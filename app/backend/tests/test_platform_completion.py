from datetime import datetime, timedelta, timezone
import hashlib
import pytest
from sqlalchemy import select
from app.models import Evidence, Project, User
from app.platform_models import Invitation
from app.security import hash_password
from .conftest import login


@pytest.fixture()
def setup(client, world, db):
    admin = User(org_id=world['org1'].id, email='admin@t.dz', password_hash=hash_password('pass#1'), full_name='Admin', role='admin')
    db.add(admin); db.commit()
    own = login(client, 'o1m@t.dz'); reviewer = login(client, 'o1r@t.dz'); other = login(client, 'o2m@t.dz'); owner = login(client, 'admin@t.dz')
    project = client.post('/api/projects', headers=own, json={'title':'Project one', 'description':'Documented test project', 'domain':'food'}).json()
    ev = client.post('/api/evidences', headers=own, json={'project_id':project['id'], 'title':'Verified report', 'doc_type':'report', 'license':'internal'}).json()
    db.get(Evidence, ev['id']).status = 'verified'; db.commit()
    return {'own':own, 'reviewer':reviewer, 'other':other, 'owner':owner, 'project':project['id'], 'evidence':ev['id'], 'admin':admin}


def room(client, s, discoverable=True):
    result = client.post('/api/data-rooms', headers=s['reviewer'], json={'project_id':s['project'], 'title':'Private room', 'purpose':'Review selected evidence', 'discoverable':discoverable})
    assert result.status_code == 201, result.text
    return result.json()['id']


def test_registration_isolated_and_roles_server_owned(client, world):
    body = {'email':'NEW@sample.dz','password':'a-unique-password','full_name':'New user','organization_name':'New organization','locale':'fr'}
    assert client.post('/api/auth/register', json={**body, 'org_id':world['org1'].id}).status_code == 422
    result=client.post('/api/auth/register',json=body)
    assert result.status_code == 201
    user=result.json()['user']; assert user['email']=='new@sample.dz' and user['role']=='admin' and user['org_id'] not in (world['org1'].id,world['org2'].id)
    assert client.post('/api/auth/register',json=body).status_code==409


def test_invitations_single_use_expiry_revocation_and_hash(client, setup, db):
    s=setup
    assert client.post('/api/org/invitations',headers=s['own'],json={'email':'invite@sample.dz'}).status_code==403
    res=client.post('/api/org/invitations',headers=s['owner'],json={'email':'invite@sample.dz','role':'reviewer'})
    assert res.status_code==201,res.text
    token=res.json()['token']; inv=db.get(Invitation,res.json()['id'])
    assert inv.token_hash==hashlib.sha256(token.encode()).hexdigest() and token not in inv.token_hash
    body={'token':token,'password':'unique-long-password','full_name':'Invited user'}
    joined=client.post('/api/org/invitations/accept',json=body)
    assert joined.status_code==201 and joined.json()['user']['role']=='reviewer'
    assert client.post('/api/org/invitations/accept',json=body).status_code==400
    for email, mode in (('expired@sample.dz','expiry'),('revoked@sample.dz','revoke')):
        r=client.post('/api/org/invitations',headers=s['owner'],json={'email':email}).json()
        if mode=='expiry':
            row=db.get(Invitation,r['id']); row.expires_at=datetime.now(timezone.utc)-timedelta(seconds=1); db.commit()
        else:
            assert client.patch(f"/api/org/invitations/{r['id']}/revoke",headers=s['owner']).status_code==200
        assert client.post('/api/org/invitations/accept',json={**body,'token':r['token']}).status_code==400


def test_private_rooms_not_listed_or_requestable(client,setup):
    s=setup; rid=room(client,s,False)
    assert all(r['id']!=rid for r in client.get('/api/data-rooms',headers=s['other']).json())
    assert client.get(f'/api/data-rooms/{rid}',headers=s['other']).status_code==404
    assert client.post(f'/api/data-rooms/{rid}/access',headers=s['other'],json={'reason':'Need to review'}).status_code==404
    assert client.post('/api/data-rooms',headers=s['own'],json={'project_id':s['project'],'title':'Room','purpose':'Review documents'}).status_code==403


def test_controlled_disclosure_qa_revocation_and_close(client,setup):
    s=setup; rid=room(client,s)
    listed=next(r for r in client.get('/api/data-rooms',headers=s['other']).json() if r['id']==rid)
    assert 'project_id' not in listed and 'evidence' not in listed
    assert client.get(f'/api/data-rooms/{rid}',headers=s['other']).status_code==404
    grant=client.post(f'/api/data-rooms/{rid}/access',headers=s['other'],json={'reason':'Technical review required'}).json()['id']
    assert client.patch(f'/api/data-rooms/{rid}/access/{grant}',headers=s['other'],json={'status':'approved','reason':'Self approval'}).status_code==404
    assert client.patch(f'/api/data-rooms/{rid}/access/{grant}',headers=s['reviewer'],json={'status':'approved','reason':'Qualified for limited access'}).status_code==200
    assert client.post(f'/api/data-rooms/{rid}/disclosures',headers=s['reviewer'],json={'evidence_id':s['evidence']}).status_code==201
    result=client.get(f'/api/data-rooms/{rid}',headers=s['other']).json()
    assert result['project_id'] is None and len(result['evidence'])==1
    assert client.get(f"/api/evidences/{s['evidence']}",headers=s['other']).status_code==404
    q=client.post(f'/api/data-rooms/{rid}/questions',headers=s['other'],json={'question':'What is the method?'}).json()['id']
    assert client.patch(f'/api/data-rooms/{rid}/questions/{q}',headers=s['reviewer'],json={'answer':'The method is in the report.'}).status_code==200
    assert client.patch(f'/api/data-rooms/{rid}/questions/{q}',headers=s['reviewer'],json={'answer':'Replacement answer'}).status_code==409
    assert any(e['action']=='answer' for e in client.get(f'/api/data-rooms/{rid}/audit',headers=s['reviewer']).json())
    assert client.patch(f'/api/data-rooms/{rid}/access/{grant}',headers=s['reviewer'],json={'status':'revoked','reason':'Review window ended'}).status_code==200
    assert client.get(f'/api/data-rooms/{rid}',headers=s['other']).status_code==404
    assert client.patch(f'/api/data-rooms/{rid}',headers=s['reviewer'],json={'status':'closed'}).status_code==200
    assert client.get(f'/api/data-rooms/{rid}',headers=s['own']).status_code==404


def test_files_bound_private_immutable_and_disclosure_withdrawn(client,setup,db):
    s=setup; ev=client.post('/api/evidences',headers=s['own'],json={'project_id':s['project'],'title':'Image source','doc_type':'photo','license':'internal'}).json()['id']
    path=f'/api/evidences/{ev}/files?filename=../../image.png'
    blob=b'\x89PNG\r\n\x1a\n'+b'test data'
    res=client.post(path,headers={**s['own'],'Content-Type':'image/png'},content=blob)
    assert res.status_code==201,res.text
    file=res.json(); assert '/' not in file['filename'] and file['sha256']==hashlib.sha256(blob).hexdigest()
    assert client.get(f"/api/evidence-files/{file['id']}/download",headers=s['other']).status_code==404
    own=client.get(f"/api/evidence-files/{file['id']}/download",headers=s['own'])
    assert own.content==blob and own.headers['content-disposition']=='attachment'
    assert client.post(path,headers={**s['own'],'Content-Type':'image/png'},content=b'not png').status_code==415
    assert client.post(path,headers={**s['own'],'Content-Type':'image/png'},content=blob+b'x'*5242880).status_code==413
    db.get(Evidence,ev).status='verified'; db.commit()
    assert client.post(path,headers={**s['own'],'Content-Type':'image/png'},content=blob).status_code==403
    rid=room(client,s); grant=client.post(f'/api/data-rooms/{rid}/access',headers=s['other'],json={'reason':'Review image'}).json()['id']
    client.patch(f'/api/data-rooms/{rid}/access/{grant}',headers=s['reviewer'],json={'status':'approved','reason':'Review approved'})
    client.post(f'/api/data-rooms/{rid}/disclosures',headers=s['reviewer'],json={'evidence_id':ev})
    assert client.get(f"/api/data-rooms/{rid}/files/{file['id']}",headers=s['other']).content==blob
    client.delete(f'/api/data-rooms/{rid}/disclosures/{ev}',headers=s['reviewer'])
    assert client.get(f"/api/data-rooms/{rid}/files/{file['id']}",headers=s['other']).status_code==404


@pytest.mark.parametrize('domain',['water','energy','food','ecosystem','health'])
def test_nexus_resource_all_domains_and_isolation(client,setup,domain):
    s=setup; body={'project_id':s['project'],'domain':domain,'name':'Resource','kind':'Capacity','quantity':'1.25','unit':'declared unit','source':'field source','provenance':'OBSERVED'}
    assert client.post('/api/nexus/resources',headers=s['other'],json=body).status_code==404
    assert client.post('/api/nexus/resources',headers=s['own'],json={**body,'quantity':'NaN'}).status_code==422
    assert client.post('/api/nexus/resources',headers=s['own'],json=body).status_code==201
    assert len(client.get('/api/nexus/resources',headers=s['own']).json())==1
    assert client.get('/api/nexus/resources',headers=s['other']).json()==[]
    assert client.get(f'/api/explore/{domain}',headers=s['own']).json()['resources']['status']=='available'


def test_opportunities_consent_explainable_matching_and_withdrawal(client,setup):
    s=setup; body={'title':'Laboratory need','description':'Need laboratory services for analysis','domain':'food','kind':'need','category':'laboratory','wilaya':'Laghouat','published':True}
    assert client.post('/api/opportunities',headers=s['own'],json=body).status_code==422
    need=client.post('/api/opportunities',headers=s['own'],json={**body,'consent':True}).json()['id']
    offer=client.post('/api/opportunities',headers=s['other'],json={**body,'kind':'offer','consent':True}).json()['id']
    matches=client.get(f'/api/opportunities/{need}/matches',headers=s['own']).json()['matches']
    assert len(matches)==1 and matches[0]['score']==3 and matches[0]['provenance']=='COMPUTED'
    assert 'email' not in matches[0]['opportunity']
    assert client.patch(f'/api/opportunities/{offer}',headers=s['own'],json={'published':False,'status':'closed'}).status_code==404
    assert client.patch(f'/api/opportunities/{offer}',headers=s['other'],json={'published':False,'status':'closed'}).status_code==200
    assert client.get(f'/api/opportunities/{need}/matches',headers=s['own']).json()['matches']==[]


def test_assurance_exact_amounts_verified_evidence_and_mixed_tax_basis(client,setup):
    s=setup
    def record(stage,amount,basis='gross'):
        return client.post(f"/api/projects/{s['project']}/assurance",headers=s['own'],json={'chain':'Contract A','stage':stage,'reference':stage+' reference','amount':amount,'amount_basis':basis,'evidence_id':s['evidence']})
    assert record('acceptance','0.30').status_code==201
    assert record('invoice','0.31').status_code==201
    chain=client.get(f"/api/projects/{s['project']}/assurance",headers=s['own']).json()['chains'][0]
    assert chain['totals']['invoice']=='0.31' and 'INVOICE_ABOVE_ACCEPTANCE' in chain['signals']
    assert record('payment','0.10','net').status_code==201
    mixed=client.get(f"/api/projects/{s['project']}/assurance",headers=s['own']).json()['chains'][0]
    assert 'MIXED_AMOUNT_BASIS' in mixed['signals'] and 'INVOICE_ABOVE_ACCEPTANCE' not in mixed['signals']


def test_readiness_risks_graph_and_audit_are_record_based(client,setup):
    s=setup; path=f"/api/projects/{s['project']}"
    first=client.get(path+'/assessment',headers=s['own']).json(); assert first['provenance']=='COMPUTED' and not first['investment_certification']
    assert client.get(path+'/assessment',headers=s['other']).status_code==404
    assert client.post(path+'/risks',headers=s['own'],json={'title':'Operational risk','likelihood':6,'severity':5,'mitigation':'Need mitigation'}).status_code==422
    client.post(path+'/risks',headers=s['own'],json={'title':'Operational risk','likelihood':2,'severity':3,'mitigation':'Monitor and review'})
    assert client.get(path+'/risks',headers=s['own']).json()[0]['score']==6
    run=client.post(path+'/assessment/run',headers=s['own']).json(); assert run['input_hash']!=first['input_hash']
    graph=client.get(path+'/evidence-graph',headers=s['own']).json(); assert not graph['causal_claim'] and any(n['provenance']=='VERIFIED' for n in graph['nodes'])


def agri_source(s):
    return {'evidence_id':s['evidence'],'source':'Reviewed data provider','observed_at':datetime.now(timezone.utc).isoformat()}


def test_satellite_indices_masking_and_zero_denominators(client,setup):
    s=setup; path=f"/api/projects/{s['project']}/agriculture/satellite"
    body={**agri_source(s),'product_id':'S2-L2A-test','red':0.2,'nir':0.6,'swir1':0.3,'common_resolution_m':20,'cloud_free':True,'same_grid':True}
    assert client.post(path,headers=s['other'],json=body).status_code==404
    result=client.post(path,headers=s['own'],json=body)
    assert result.status_code==201,result.text
    c=result.json()['content']; assert c['ndvi']==pytest.approx(.5) and c['lswi']==pytest.approx(1/3)
    masked=client.post(path,headers=s['own'],json={**body,'cloud_free':False}).json()['content']; assert masked['ndvi'] is None and masked['lswi'] is None
    zero=client.post(path,headers=s['own'],json={**body,'nir':0,'red':0,'swir1':0}).json()['content']; assert zero['ndvi'] is None and zero['lswi'] is None
    assert client.post(path,headers=s['own'],json={**body,'nir':1000}).status_code==422


def test_soil_irrigation_and_weather_validation(client,setup):
    s=setup; path=f"/api/projects/{s['project']}/agriculture"
    source=agri_source(s)
    soil={**source,'sample_id':'Sample 01','method':'Laboratory method','ph':7.2,'soc_g_kg':15}
    assert client.post(path+'/soil',headers=s['own'],json=soil).status_code==201
    assert client.post(path+'/soil',headers=s['own'],json={**soil,'ph':15}).status_code==422
    irrigation={**source,'crop':'Wheat','eto_mm_day':5,'kc':1.2,'effective_rain_mm':1,'area_ha':2,'efficiency':.5,'kc_source':'Reviewed crop coefficient'}
    result=client.post(path+'/irrigation',headers=s['own'],json=irrigation).json()['content']
    assert result['etc_mm_day']==6 and result['volume_m3_day']==200 and result['field_execution'] is False
    assert client.post(path+'/irrigation',headers=s['own'],json={**irrigation,'efficiency':0}).status_code==422
    forecast={**source,'model_name':'ECMWF imported','latitude':33.8,'longitude':2.8,'days':[{'day':datetime.now(timezone.utc).date().isoformat(),'min_c':20,'max_c':30,'rain_mm':0}]}
    assert client.post(path+'/weather',headers=s['own'],json=forecast).status_code==201
    assert client.post(path+'/weather',headers=s['own'],json={**forecast,'days':forecast['days']*2}).status_code==422
    assert client.get(path,headers=s['own']).json()['live_feed'] is False


def test_diagnosis_requires_reviewer_and_image(client,setup):
    s=setup; body={**agri_source(s),'crop':'Wheat','observation':'Visible leaf lesions','conclusion':'Needs specialist examination','mode':'diagnosis'}
    path=f"/api/projects/{s['project']}/agriculture/diagnosis"
    assert client.post(path,headers=s['own'],json=body).status_code==403
    assert client.post(path,headers=s['reviewer'],json=body).status_code==422
    result=client.post(path,headers=s['reviewer'],json={**body,'mode':'forewarning'})
    assert result.status_code==201 and result.json()['content']['automated_image_diagnosis'] is False


def test_auth_throttled_and_validation_does_not_echo_secrets(client,world):
    secret='short!'
    r=client.post('/api/auth/register',json={'email':'bad@example.dz','password':secret,'full_name':'Test User','organization_name':'Test Organization'})
    assert r.status_code==422 and secret not in r.text
    statuses=[client.post('/api/auth/login',json={'email':'unknown@sample.dz','password':'wrong'}).status_code for _ in range(31)]
    assert statuses[0]==401 and statuses[-1]==429


def test_unknown_api_not_spa_and_private_responses_no_store(client,setup):
    assert client.get('/api/route-does-not-exist').status_code==404
    response=client.get('/api/org/members',headers=setup['own'])
    assert response.headers['cache-control']=='no-store'
