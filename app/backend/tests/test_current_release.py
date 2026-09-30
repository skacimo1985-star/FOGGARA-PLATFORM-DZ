"""Regression checks for evidence integrity and actual Rust integration."""
import os
from pathlib import Path
import pytest
from fastapi import HTTPException
from app import config
from app.services.decision_matrix import evaluate_matrix, evaluate_python_matrix
from app.services.indicators import build_recommendation, validate_measurement
from .test_decision_matrix import snapshot
from .test_acceptance import make_project
from .test_critical_gaps import make_recommendation
from .conftest import login


def test_flow_summary_does_not_invent_acceptance_rule(db):
    from app.services.indicators import ensure_default_indicator
    from datetime import datetime, timezone
    ind=ensure_default_indicator(db)
    now=datetime.now(timezone.utc)
    for value in [0.1, 50]:
        basis,ar,fr,en=build_recommendation(ind,value,2,now,now,[])
        assert 'threshold=not_configured' in basis
        assert 'not establish' in en
        assert 'acceptable limit' not in en and 'cleaning' not in en


def test_pressure_and_flow_guardrails_normalize_units():
    validate_measurement('pressure', 100000, 'kPa')
    validate_measurement('flow_rate', 360000, 'm3/h')
    with pytest.raises(HTTPException):validate_measurement('pressure', 100001, 'kPa')


def test_action_cannot_link_other_project_decision(client,world):
    member=login(client,'o1m@t.dz');reviewer=login(client,'o1r@t.dz')
    p1=make_project(client,member);p2=make_project(client,member)
    rec=make_recommendation(client,member,reviewer,p1['id'])
    decision=client.post(f"/api/recommendations/{rec['id']}/decisions",headers=reviewer,json={'decision':'approved','rationale':'Reviewed project requirements'}).json()
    result=client.post('/api/actions',headers=member,json={'project_id':p2['id'],'decision_id':decision['id'],'title':'Action in another project'})
    assert result.status_code==404,result.text


def test_selected_missing_rust_fails_closed(monkeypatch):
    monkeypatch.setattr(config,'NEXUS_MATRIX_ENGINE','rust')
    monkeypatch.setattr(config,'NEXUS_RUST_BINARY','/nonexistent/foggara-nexus-core')
    with pytest.raises(HTTPException) as caught:evaluate_matrix(snapshot())
    assert caught.value.status_code==503 and caught.value.detail['code']=='MATRIX_ENGINE_UNAVAILABLE'


@pytest.mark.skipif(not os.environ.get('NEXUS_RUST_TEST_BINARY'),reason='Rust integration executable not configured')
def test_real_rust_and_python_comparison(monkeypatch):
    executable=os.environ['NEXUS_RUST_TEST_BINARY'];assert Path(executable).is_file()
    monkeypatch.setattr(config,'NEXUS_MATRIX_ENGINE','rust');monkeypatch.setattr(config,'NEXUS_RUST_BINARY',executable)
    for weights in [(60,40),(0,100),(12.34,56.78)]:
        data=snapshot()
        for c,w in zip(data['criteria'],weights):c['weight']=w
        rust=evaluate_matrix(data);python=evaluate_python_matrix(data)
        assert rust['algorithm']=='weighted-minmax-rust-v1'
        assert rust['ranking']==python['ranking'] and rust['input_sha256']==python['input_sha256']
        for a,b in zip(rust['alternatives'],python['alternatives']):
            assert a['feasible']==b['feasible'] and a['violations']==b['violations']
            if b['score'] is not None:assert a['score']==pytest.approx(b['score'],abs=1e-6)
            else:assert a['score'] is None
        assert rust['field_execution'] is False
