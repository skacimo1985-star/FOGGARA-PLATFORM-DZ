"""Negative authorization checks for controlled external disclosure."""
import pytest
from app.models import Evidence
from .conftest import login
from .test_platform_completion import setup, room  # noqa: F401


def approve(client, s, rid, headers):
    response = client.post(f'/api/data-rooms/{rid}/access', headers=headers,
                           json={'reason': 'Review disclosed technical evidence'})
    assert response.status_code == 201
    grant = response.json()['id']
    assert client.patch(f'/api/data-rooms/{rid}/access/{grant}', headers=s['reviewer'],
                        json={'status': 'approved', 'reason': 'Authorized limited review'}).status_code == 200
    return grant


def test_grants_bound_to_user_and_questions_private(client, setup):
    s = setup
    rid = room(client, s)
    second_guest = login(client, 'o2r@t.dz')
    approve(client, s, rid, s['other'])
    # A colleague in the approved guest's organization does not inherit permission.
    assert client.get(f'/api/data-rooms/{rid}', headers=second_guest).status_code == 404
    approve(client, s, rid, second_guest)
    q = client.post(f'/api/data-rooms/{rid}/questions', headers=s['other'],
                    json={'question': 'Confidential question from first guest'}).json()['id']
    assert client.get(f'/api/data-rooms/{rid}', headers=second_guest).json()['questions'] == []
    assert client.patch(f'/api/data-rooms/{rid}/questions/{q}', headers=second_guest,
                        json={'answer': 'Unauthorized response'}).status_code == 404
    assert client.get(f'/api/data-rooms/{rid}/audit', headers=second_guest).status_code == 404
    assert client.get(f'/api/data-rooms/{rid}/access', headers=second_guest).status_code == 404


def test_identifiers_cannot_be_swapped_between_rooms(client, setup):
    s = setup
    first, second = room(client, s), room(client, s)
    grant = approve(client, s, first, s['other'])
    assert client.patch(f'/api/data-rooms/{second}/access/{grant}', headers=s['reviewer'],
                        json={'status': 'revoked', 'reason': 'Wrong room identifier'}).status_code == 404
    q = client.post(f'/api/data-rooms/{first}/questions', headers=s['other'],
                    json={'question': 'Question scoped to the first room'}).json()['id']
    assert client.patch(f'/api/data-rooms/{second}/questions/{q}', headers=s['reviewer'],
                        json={'answer': 'Wrong room answer'}).status_code == 404
    assert client.get(f'/api/data-rooms/{first}', headers=s['other']).status_code == 200


@pytest.mark.parametrize('barrier', ['revocation', 'closure', 'withdrawal', 'evidence_status'])
def test_file_access_rechecks_current_authorization(client, setup, db, barrier):
    s = setup
    ev = client.post('/api/evidences', headers=s['own'], json={
        'project_id': s['project'], 'title': 'Restricted file', 'doc_type': 'photo',
        'license': 'internal'}).json()['id']
    data = b'\x89PNG\r\n\x1a\nsynthetic authorization fixture'
    uploaded = client.post(f'/api/evidences/{ev}/files?filename=fixture.png',
                           headers={**s['own'], 'Content-Type': 'image/png'}, content=data)
    assert uploaded.status_code == 201
    fid = uploaded.json()['id']
    db.get(Evidence, ev).status = 'verified'
    db.commit()
    rid = room(client, s)
    grant = approve(client, s, rid, s['other'])
    assert client.post(f'/api/data-rooms/{rid}/disclosures', headers=s['reviewer'],
                       json={'evidence_id': ev}).status_code == 201
    url = f'/api/data-rooms/{rid}/files/{fid}'
    assert client.get(url, headers=s['other']).content == data
    if barrier == 'revocation':
        assert client.patch(f'/api/data-rooms/{rid}/access/{grant}', headers=s['reviewer'],
                            json={'status': 'revoked', 'reason': 'Review authorization ended'}).status_code == 200
    elif barrier == 'closure':
        assert client.patch(f'/api/data-rooms/{rid}', headers=s['reviewer'],
                            json={'status': 'closed'}).status_code == 200
    elif barrier == 'withdrawal':
        assert client.delete(f'/api/data-rooms/{rid}/disclosures/{ev}', headers=s['reviewer']).status_code == 200
    else:
        db.get(Evidence, ev).status = 'submitted'
        db.commit()
    response = client.get(url, headers=s['other'])
    assert response.status_code == 404
    assert data not in response.content
    assert response.headers['cache-control'] == 'no-store'
    # Direct evidence routes cannot bypass the room's restrictions.
    assert client.get(f'/api/evidence-files/{fid}/download', headers=s['other']).status_code == 404


def test_request_cannot_self_assign_approval(client, setup):
    s = setup
    rid = room(client, s)
    response = client.post(f'/api/data-rooms/{rid}/access', headers=s['other'],
                           json={'reason': 'Unauthorized self approval', 'status': 'approved'})
    assert response.status_code == 422
    assert client.get(f'/api/data-rooms/{rid}', headers=s['other']).status_code == 404
