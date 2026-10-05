from datetime import datetime, timezone, timedelta
import pytest
from sqlalchemy import select
from app.models import AuditLog
from app.services.agriculture_operations import irrigation_scenario, vegetation_index
from tests.conftest import login

@pytest.fixture()
def farm(client, world):
    h = login(client, 'o1m@t.dz')
    r = client.post('/api/agriculture/parcels', headers=h, json=dict(name='P-001', crop='wheat', area_ha=2, location='test'))
    assert r.status_code == 201, r.text
    return h, r.json()['id']

def observation(pid, **kw):
    data = dict(parcel_id=pid, metric='ph', value=7.2, source_type='lab', source_ref='LAB-REF-1',
                observed_at=(datetime.now(timezone.utc)-timedelta(days=1)).isoformat())
    data.update(kw)
    return data

def test_no_anonymous(client):
    assert client.get('/api/agriculture/parcels').status_code == 401

def test_org_isolation(client, world, farm):
    _, pid = farm; h2 = login(client, 'o2m@t.dz')
    assert client.get('/api/agriculture/parcels', headers=h2).json() == []
    assert client.patch(f'/api/agriculture/parcels/{pid}', headers=h2,json={'archived':True}).status_code==404
    assert client.post('/api/agriculture/observations',headers=h2,json=observation(pid)).status_code==404
    assert client.get(f'/api/agriculture/observations?parcel_id={pid}',headers=h2).status_code==404
    assert client.post('/api/agriculture/tasks',headers=h2,json={'parcel_id':pid,'title':'test','due_date':'2026-10-12'}).status_code==404
    assert client.post('/api/agriculture/plans',headers=h2,json={'parcel_id':pid,'eto_mm_day':5,'kc':1,'effective_rain_mm':0,'efficiency':.8,'days':1,'input_source':'test'}).status_code==404

def test_cannot_inject_org_or_verified_status(client, world, farm):
    h,pid=farm
    assert client.post('/api/agriculture/parcels',headers=h,json=dict(name='x',crop='x',area_ha=2,location='x',org_id=world['org2'].id)).status_code==422
    assert client.post('/api/agriculture/observations',headers=h,json=observation(pid,evidence_status='VERIFIED')).status_code==422

@pytest.mark.parametrize('value',[0,-2,100001])
def test_invalid_area(client,world,value):
    h=login(client,'o1m@t.dz')
    assert client.post('/api/agriculture/parcels',headers=h,json=dict(name='x',crop='x',area_ha=value,location='x')).status_code==422

@pytest.mark.parametrize('patch',[{'value':15},{'observed_at':'2036-01-01T00:00:00Z'},{'observed_at':'2026-01-01T00:00:00'},{'source_type':'satellite'},{'source_ref':'  '}])
def test_observation_validation(client,world,farm,patch):
    h,pid=farm; data=observation(pid); data.update(patch)
    r=client.post('/api/agriculture/observations',headers=h,json=data)
    assert r.status_code==422,r.text
    assert 'input' not in r.json()['detail']['errors'][0]

def test_independent_review(client,world,farm,db):
    h,pid=farm; row=client.post('/api/agriculture/observations',headers=h,json=observation(pid)).json()
    url=f"/api/agriculture/observations/{row['id']}/verify"
    assert client.post(url,headers=h).status_code==403
    assert client.post(url,headers=login(client,'o2r@t.dz')).status_code==404
    review=login(client,'o1r@t.dz')
    assert client.post(url,headers=review).json()['evidence_status']=='VERIFIED'
    assert client.post(url,headers=review).status_code==409
    new=client.post('/api/agriculture/observations',headers=review,json=observation(pid)).json()
    assert client.post(f"/api/agriculture/observations/{new['id']}/verify",headers=review).status_code==409
    assert db.scalar(select(AuditLog).where(AuditLog.action=='verify',AuditLog.entity_type=='agri_observations')) is not None

def test_satellite_remains_inferred(client,world,farm):
    h,pid=farm; data=observation(pid);data.update(metric='ndvi',value=.7,source_type='satellite')
    row=client.post('/api/agriculture/observations',headers=h,json=data).json()
    assert row['evidence_status']=='INFERRED'
    assert client.post(f"/api/agriculture/observations/{row['id']}/verify",headers=login(client,'o1r@t.dz')).status_code==409

def test_irrigation_dimensions_and_rain_floor():
    result=irrigation_scenario(2,5,.8,1,.8,2)
    assert result['volume_m3']==175
    assert result['net_mm']==7
    assert result['decision_status']=='PROPOSED'
    assert irrigation_scenario(2,5,.8,100,.8,2)['volume_m3']==0
    for eff in (0,-1,1.1,float('nan')):
        with pytest.raises(ValueError):irrigation_scenario(2,5,.8,1,eff,2)

def test_plan_snapshots(client,world,farm):
    h,pid=farm; body=dict(parcel_id=pid,eto_mm_day=5,kc=.8,effective_rain_mm=1,efficiency=.8,days=2,input_source='weather-file-1')
    r=client.post('/api/agriculture/plans',headers=h,json=body)
    assert r.status_code==201,r.text
    assert r.json()['result']['volume_m3']==175
    assert r.json()['inputs']['area_ha']==2
    assert client.get('/api/agriculture/plans',headers=login(client,'o2m@t.dz')).json()==[]
    client.patch(f'/api/agriculture/parcels/{pid}',headers=h,json={'archived':True})
    assert client.post('/api/agriculture/plans',headers=h,json=body).status_code==409

def test_tasks(client,world,farm):
    h,pid=farm; task=client.post('/api/agriculture/tasks',headers=h,json={'parcel_id':pid,'title':'Inspect irrigation','due_date':'2026-10-12'}).json()
    url=f"/api/agriculture/tasks/{task['id']}"
    assert client.patch(url,headers=login(client,'o2m@t.dz'),json={'completed':True}).status_code==404
    assert client.patch(url,headers=h,json={'completed':True}).json()['completed'] is True
    assert client.get('/api/agriculture/tasks',headers=login(client,'o2m@t.dz')).json()==[]

def test_ndvi():
    assert vegetation_index(.8,.2)==pytest.approx(.6)
    assert vegetation_index(.2,.8)==pytest.approx(-.6)
    for nir,red in [(0,0),(-1,.2),(8000,2000),(float('nan'),.2)]:
        with pytest.raises(ValueError):vegetation_index(nir,red)

def test_unknown_api_is_not_spa(client):
    assert client.get('/api/not-a-real-route').status_code==404


def test_service_summary_turns_recorded_data_into_actionable_service(client, world, farm):
    h, pid = farm
    client.post('/api/agriculture/observations', headers=h, json=observation(pid, value=8.4))
    data = observation(pid)
    data.update(metric='ec', value=5.1, source_ref='LAB-EC-1')
    client.post('/api/agriculture/observations', headers=h, json=data)
    r = client.get(f'/api/agriculture/parcels/{pid}/service-summary', headers=h)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body['available_services']['soil_screening'] is True
    assert body['available_services']['irrigation_planning'] is True
    assert body['available_services']['irrigation_water_screening'] is False
    assert body['irrigation_water_assessment']['evidence_status'] == 'MISSING'
    assert body['irrigation_water_assessment']['decision_status'] == 'UNAVAILABLE'
    assert 'EXPLICIT_WATER_SAMPLE_REQUIRED' in body['irrigation_water_assessment']['limitations']
    assert body['available_services']['satellite_live'] is False
    assert body['available_services']['weather_live'] is False
    assert body['soil_assessment']['evidence_status'] == 'COMPUTED'
    assert body['soil_assessment']['decision_status'] == 'PROPOSED'
    assert {'ph', 'ec'} <= set(body['soil_assessment']['coverage'])
    assert any(x['message'] == 'salinity_risk' for x in body['soil_assessment']['findings'])
    assert body['soil_assessment']['actions']


def test_service_summary_is_org_isolated(client, world, farm):
    _, pid = farm
    h2 = login(client, 'o2m@t.dz')
    assert client.get(f'/api/agriculture/parcels/{pid}/service-summary', headers=h2).status_code == 404


def test_service_summary_can_be_saved_as_submitted_evidence(client, world, farm):
    h, pid = farm
    from tests.test_acceptance import make_project
    project = make_project(client, h)
    client.post('/api/agriculture/observations', headers=h, json=observation(pid, value=7.2))
    data = observation(pid)
    data.update(metric='ec', value=1.4, source_ref='LAB-EC-SAVE')
    client.post('/api/agriculture/observations', headers=h, json=data)
    r = client.post(f'/api/agriculture/parcels/{pid}/service-summary/evidence',
                    headers=h, json={'project_id': project['id']})
    assert r.status_code == 201, r.text
    saved = r.json()
    assert saved['status'] == 'submitted'
    ev = client.get(f"/api/evidences/{saved['evidence_id']}", headers=h)
    assert ev.status_code == 200
    body = ev.json()
    assert body['doc_type'] == 'report'
    assert body['status'] == 'submitted'
    assert 'RECORDED_AND_COMPUTED' in body['content_note']
    assert 'LAB-EC-SAVE' in body['content_note']


def test_service_summary_evidence_requires_data_and_org_project(client, world, farm):
    h, pid = farm
    from tests.test_acceptance import make_project
    project = make_project(client, h)
    r = client.post(f'/api/agriculture/parcels/{pid}/service-summary/evidence',
                    headers=h, json={'project_id': project['id']})
    assert r.status_code == 409 and r.json()['detail']['code'] == 'INSUFFICIENT_EVIDENCE'
    h2 = login(client, 'o2m@t.dz')
    project2 = make_project(client, h2)
    assert client.post(f'/api/agriculture/parcels/{pid}/service-summary/evidence',
                       headers=h2, json={'project_id': project2['id']}).status_code == 404


def test_irrigation_water_screening_requires_verified_resource_measurements(client, world, farm):
    h, pid = farm
    reviewer = login(client, 'o1r@t.dz')
    site = client.post('/api/sites', headers=h, json={'name':'Water site','wilaya':'Laghouat'}).json()
    resource = client.post('/api/resources', headers=h, json={'site_id':site['id'],'type':'well','name':'Irrigation well','status':'active'}).json()
    project = client.post('/api/projects', headers=h, json={'title':'Water project','domain':'water','site_id':site['id'],'resource_id':resource['id']}).json()
    pending = client.post('/api/measurements', headers=h, json={
        'project_id':project['id'],'resource_id':resource['id'],'parameter':'ec','value':1.2,'unit':'dS/m',
        'measured_at':(datetime.now(timezone.utc)-timedelta(hours=1)).isoformat(),'source':'LAB-WATER-EC','method':'conductivity'
    })
    assert pending.status_code == 201, pending.text
    before = client.get(f"/api/agriculture/parcels/{pid}/service-summary?project_id={project['id']}", headers=h).json()
    assert before['available_services']['irrigation_water_screening'] is False
    assert before['irrigation_water_assessment']['decision_status'] == 'UNAVAILABLE'
    assert 'VERIFIED_WATER_MEASUREMENTS_REQUIRED' in before['irrigation_water_assessment']['limitations']
    review = client.post('/api/reviews', headers=reviewer, json={'target_type':'measurement','target_id':pending.json()['id'],'decision':'accepted','note':'checked','reason':'valid lab result'})
    assert review.status_code == 201, review.text
    after = client.get(f"/api/agriculture/parcels/{pid}/service-summary?project_id={project['id']}", headers=h).json()
    water = after['irrigation_water_assessment']
    assert after['available_services']['irrigation_water_screening'] is True
    assert water['evidence_status'] == 'COMPUTED_FROM_VERIFIED_MEASUREMENTS'
    assert water['decision_status'] == 'PROPOSED'
    assert water['resource_id'] == resource['id']
    assert water['measurement_ids'] == [pending.json()['id']]
    assert water['inputs']['ec'] == 1.2


def test_irrigation_water_screening_requires_project_resource(client, world, farm):
    h, pid = farm
    from tests.test_acceptance import make_project
    project = make_project(client, h)
    r = client.get(f"/api/agriculture/parcels/{pid}/service-summary?project_id={project['id']}", headers=h)
    assert r.status_code == 200
    water = r.json()['irrigation_water_assessment']
    assert water['decision_status'] == 'UNAVAILABLE'
    assert 'PROJECT_WATER_RESOURCE_REQUIRED' in water['limitations']


def test_ec_measurement_rejects_wrong_unit(client, world):
    h = login(client, 'o1m@t.dz')
    from tests.test_acceptance import make_project
    project = make_project(client, h)
    r = client.post('/api/measurements', headers=h, json={
        'project_id':project['id'],'parameter':'ec','value':1.0,'unit':'mS/cm',
        'measured_at':datetime.now(timezone.utc).isoformat(),'source':'lab','method':'conductivity'
    })
    assert r.status_code == 422
    assert r.json()['detail']['code'] == 'INVALID_UNIT'
