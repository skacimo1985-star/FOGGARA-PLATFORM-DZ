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

def test_remote_sensing_ingestion_is_inferred_idempotent_and_isolated(client, world, farm, db):
    h, pid = farm
    acquired = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
    payload = {
        'provider': 'provider_demo',
        'scene_id': 'SCENE-2026-001',
        'acquired_at': acquired,
        'ndvi': 0.71,
        'lswi': 0.18,
        'moisture': 24.5,
        'cloud_cover_pct': 8.0,
        'confidence': 0.86,
        'source_uri': 'https://example.invalid/scenes/SCENE-2026-001',
    }
    url = f'/api/agriculture/parcels/{pid}/remote-sensing/ingest'
    r = client.post(url, headers=h, json=payload)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body['provenance'] == 'INFERRED'
    assert body['live_provider_connected'] is False
    assert {row['metric'] for row in body['created']} == {'ndvi', 'lswi', 'moisture'}
    assert all(row['source_type'] == 'satellite' for row in body['created'])
    assert all(row['evidence_status'] == 'INFERRED' for row in body['created'])

    again = client.post(url, headers=h, json=payload)
    assert again.status_code == 201, again.text
    assert again.json()['created'] == []
    assert set(again.json()['skipped_metrics']) == {'ndvi', 'lswi', 'moisture'}

    history = client.get(f'/api/agriculture/parcels/{pid}/remote-sensing', headers=h)
    assert history.status_code == 200, history.text
    hist = history.json()
    assert hist['adapter_contract'] == 'provider_neutral'
    assert hist['live_provider_connected'] is False
    assert len(hist['observations']) == 3
    assert {row['metric'] for row in hist['observations']} == {'ndvi', 'lswi', 'moisture'}

    reviewer = login(client, 'o1r@t.dz')
    inferred_id = body['created'][0]['id']
    verify = client.post(f'/api/agriculture/observations/{inferred_id}/verify', headers=reviewer)
    assert verify.status_code == 409
    assert verify.json()['detail']['code'] == 'INFERENCE_NOT_MEASUREMENT'

    other = login(client, 'o2m@t.dz')
    assert client.get(f'/api/agriculture/parcels/{pid}/remote-sensing', headers=other).status_code == 404
    assert client.post(url, headers=other, json=payload).status_code == 404

    audits = list(db.scalars(select(AuditLog).where(
        AuditLog.action == 'remote_sensing_ingest',
        AuditLog.entity_type == 'agri_observations',
    )))
    assert len(audits) == 3


def test_remote_sensing_ingestion_rejects_empty_future_and_out_of_range(client, world, farm):
    h, pid = farm
    url = f'/api/agriculture/parcels/{pid}/remote-sensing/ingest'
    base = {
        'provider': 'adapter_1',
        'scene_id': 'SCENE-X',
        'acquired_at': (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat(),
    }
    assert client.post(url, headers=h, json=base).status_code == 422
    assert client.post(url, headers=h, json={**base, 'ndvi': 1.2}).status_code == 422
    future = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
    assert client.post(url, headers=h, json={**base, 'acquired_at': future, 'ndvi': 0.3}).status_code == 422


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
    assert 'PROJECT_WATER_RESOURCE_REQUIRED' in body['irrigation_water_assessment']['limitations']
    assert 'VERIFIED_WATER_MEASUREMENTS_REQUIRED' in body['irrigation_water_assessment']['limitations']
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
    assert water['measurement_sources'] == [{'measurement_id': pending.json()['id'], 'parameter': 'ec', 'source': 'LAB-WATER-EC', 'method': 'conductivity'}]
    saved = client.post(f'/api/agriculture/parcels/{pid}/service-summary/evidence', headers=h, json={'project_id': project['id']})
    assert saved.status_code == 201, saved.text
    evidence = client.get(f"/api/evidences/{saved.json()['evidence_id']}", headers=h).json()
    assert f'"measurement_ids": [{pending.json()["id"]}]' in evidence['content_note']
    assert 'LAB-WATER-EC' in evidence['content_note']
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


@pytest.mark.parametrize('parameter,value,unit', [
    ('tds', 750, 'mg/L'), ('salinity', 1.1, 'ppt'), ('sar', 3.2, 'index'),
    ('sodium', 120, 'mg/L'), ('calcium', 80, 'mg/L'), ('magnesium', 35, 'mg/L'),
    ('chloride', 160, 'mg/L'), ('bicarbonate', 180, 'mg/L'),
    ('soil_nitrogen', 45, 'mg/kg'), ('soil_phosphorus', 18, 'mg/kg'), ('soil_potassium', 210, 'mg/kg'),
    ('soil_soc', 2.1, '%'), ('soil_organic_matter', 3.6, '%'), ('soil_ec', 1.4, 'dS/m'),
    ('soil_temperature', 24, '°C'), ('air_temperature', 31, '°C'), ('wind_speed', 4.2, 'm/s'),
    ('solar_radiation', 650, 'W/m2'), ('reference_et', 5.4, 'mm/day'),
    ('current', 12, 'A'), ('energy', 42, 'kWh'),
])
def test_expanded_measurement_catalog_accepts_valid_units(client, world, parameter, value, unit):
    h = login(client, 'o1m@t.dz')
    from tests.test_acceptance import make_project
    project = make_project(client, h)
    r = client.post('/api/measurements', headers=h, json={
        'project_id':project['id'], 'parameter':parameter, 'value':value, 'unit':unit,
        'measured_at':datetime.now(timezone.utc).isoformat(), 'source':'test-source', 'method':'test-method'
    })
    assert r.status_code == 201, r.text
    assert r.json()['parameter'] == parameter

def test_georeferenced_parcel_requires_coordinate_pair_and_owned_site(client, world):
    h1 = login(client, 'o1m@t.dz')
    h2 = login(client, 'o2m@t.dz')
    site1 = client.post('/api/sites', headers=h1, json={
        'name':'GIS site','wilaya':'Laghouat','lat':33.8,'lon':2.9
    }).json()
    site2 = client.post('/api/sites', headers=h2, json={
        'name':'Other site','wilaya':'Oran','lat':35.7,'lon':-0.6
    }).json()

    missing_lon = client.post('/api/agriculture/parcels', headers=h1, json={
        'name':'Parcel GIS','crop':'date_palm','area_ha':2.5,'location':'Laghouat',
        'site_id':site1['id'],'lat':33.8
    })
    assert missing_lon.status_code == 422

    foreign_site = client.post('/api/agriculture/parcels', headers=h1, json={
        'name':'Parcel GIS','crop':'date_palm','area_ha':2.5,'location':'Laghouat',
        'site_id':site2['id'],'lat':33.8,'lon':2.9
    })
    assert foreign_site.status_code == 404

    created = client.post('/api/agriculture/parcels', headers=h1, json={
        'name':'Parcel GIS','crop':'date_palm','area_ha':2.5,'location':'Laghouat',
        'site_id':site1['id'],'lat':33.812345,'lon':2.912345
    })
    assert created.status_code == 201, created.text
    body = created.json()
    assert body['site_id'] == site1['id']
    assert float(body['lat']) == 33.812345
    assert float(body['lon']) == 2.912345

    other_list = client.get('/api/agriculture/parcels', headers=h2)
    assert all(row['id'] != body['id'] for row in other_list.json())


@pytest.mark.parametrize('lat,lon', [
    (91, 2.9), (-91, 2.9), (33.8, 181), (33.8, -181),
])
def test_georeferenced_parcel_rejects_invalid_coordinates(client, world, lat, lon):
    h = login(client, 'o1m@t.dz')
    response = client.post('/api/agriculture/parcels', headers=h, json={
        'name':'Invalid GIS','crop':'wheat','area_ha':1.0,'location':'Laghouat',
        'lat':lat,'lon':lon
    })
    assert response.status_code == 422

def test_agriculture_demo_flag_is_system_controlled(client, world):
    h = login(client, 'o1m@t.dz')
    injected = client.post('/api/agriculture/parcels', headers=h, json={
        'name':'Injected demo','crop':'wheat','area_ha':1.0,'location':'Laghouat',
        'is_demo': True,
    })
    assert injected.status_code == 422

    created = client.post('/api/agriculture/parcels', headers=h, json={
        'name':'Normal parcel','crop':'wheat','area_ha':1.0,'location':'Laghouat',
    })
    assert created.status_code == 201, created.text
    assert created.json()['is_demo'] is False

    observation_payload = observation(created.json()['id'])
    observation_payload['is_demo'] = True
    assert client.post('/api/agriculture/observations', headers=h, json=observation_payload).status_code == 422



def _satellite_parcel(client, headers):
    row = client.post('/api/agriculture/parcels', headers=headers, json={
        'name': 'Real Sentinel test parcel', 'crop': 'wheat', 'area_ha': 4.5,
        'location': 'Laghouat', 'lat': 33.8, 'lon': 2.87,
    })
    assert row.status_code == 201, row.text
    return row.json()['id']


def test_live_sentinel_workflow_persists_real_ndvi_and_audit(client, world, monkeypatch, db):
    import app.routers.satellite_parcels as satellite
    h = login(client, 'o1m@t.dz')
    parcel_id = _satellite_parcel(client, h)
    scene_id = 'S2A_TEST_SCENE_2026'
    acquired = (datetime.now(timezone.utc) - timedelta(days=3)).isoformat()
    calls = {'provider': 0, 'raster': 0}
    def provider(value):
        assert value == scene_id
        calls['provider'] += 1
        return value, {'id': value, 'collection': 'sentinel-2-l2a', 'properties': {'datetime': acquired}}
    def raster(plan, bbox, geometry_wgs84=None):
        assert geometry_wgs84 is None
        assert plan['scene_id'] == scene_id
        assert len(bbox) == 4 and bbox[0] < 2.87 < bbox[2]
        assert bbox[1] < 33.8 < bbox[3]
        calls['raster'] += 1
        return {
            'scene_id': scene_id, 'index': 'ndvi',
            'processing_plan_fingerprint': 'sha256:test-scene-plan',
            'statistics': {'mean': 0.62, 'min': 0.1, 'max': 0.9},
            'pixels': {'valid': 90, 'total': 100, 'valid_fraction': .9},
        }
    monkeypatch.setattr(satellite, '_provider_item', provider)
    monkeypatch.setattr(satellite, 'build_processing_plan', lambda item, index: {
        'scene_id': item['id'], 'index': index,
    })
    monkeypatch.setattr(satellite, 'compute_index_statistics', raster)
    monkeypatch.setattr(satellite, 'catalog_scenes', lambda **kwargs: {
        'scenes': [{'id': scene_id, 'datetime': acquired, 'cloud_cover_pct': 6.0}],
        'count': 1, 'live': True,
    })

    scenes = client.get(
        f'/api/agriculture/parcels/{parcel_id}/remote-sensing/scenes',
        params={'start': '2026-09-01', 'end': '2026-10-05'}, headers=h,
    )
    assert scenes.status_code == 200, scenes.text
    assert scenes.json()['scenes'][0]['id'] == scene_id
    assert scenes.json()['sample_geometry'] == 'POINT_CENTERED_ESTIMATE_NOT_PARCEL_BOUNDARY'
    url = f'/api/agriculture/parcels/{parcel_id}/remote-sensing/analyze'
    first = client.post(url, headers=h, json={'scene_id': scene_id})
    assert first.status_code == 201, first.text
    assert first.json()['created'] is True
    record = first.json()['observation']
    assert float(record['value']) == .62
    assert record['is_demo'] is False
    assert record['evidence_status'] == 'INFERRED'
    assert record['source_ref'].startswith(f'element84-earth-search:{scene_id}:ndvi:')
    assert first.json()['statistics']['pixels']['valid_fraction'] == .9
    assert calls == {'provider': 1, 'raster': 1}

    again = client.post(url, headers=h, json={'scene_id': scene_id})
    assert again.status_code == 201
    assert again.json()['created'] is False
    assert again.json()['observation']['id'] == record['id']
    assert calls == {'provider': 1, 'raster': 1}
    observations = client.get(
        f'/api/agriculture/observations?parcel_id={parcel_id}', headers=h,
    ).json()
    assert len([row for row in observations if row['metric'] == 'ndvi']) == 1
    assert db.scalar(select(AuditLog).where(
        AuditLog.action == 'sentinel_index_computed',
        AuditLog.entity_type == 'agri_observations',
    )) is not None
    reviewer = login(client, 'o1r@t.dz')
    assert client.post(
        f"/api/agriculture/observations/{record['id']}/verify", headers=reviewer,
    ).status_code == 409
    other = login(client, 'o2m@t.dz')
    assert client.post(url, headers=other, json={'scene_id': scene_id}).status_code == 404
    assert client.get(
        f'/api/agriculture/parcels/{parcel_id}/remote-sensing/scenes',
        params={'start': '2026-09-01', 'end': '2026-10-05'}, headers=other,
    ).status_code == 404
    assert calls == {'provider': 1, 'raster': 1}


def test_sentinel_rejects_missing_coordinates_and_low_quality(client, world, monkeypatch):
    import app.routers.satellite_parcels as satellite
    h = login(client, 'o1m@t.dz')
    unlocated = client.post('/api/agriculture/parcels', headers=h, json={
        'name': 'No coordinates', 'crop': 'wheat', 'area_ha': 2, 'location': 'Laghouat',
    }).json()['id']
    url = f'/api/agriculture/parcels/{unlocated}/remote-sensing/analyze'
    resp = client.post(url, headers=h, json={'scene_id': 'S2A_TEST_SCENE_2026'})
    assert resp.status_code == 422
    assert resp.json()['detail']['code'] == 'PARCEL_COORDINATES_REQUIRED'
    fixed = client.patch(
        f'/api/agriculture/parcels/{unlocated}', headers=h,
        json={'lat': 33.8, 'lon': 2.87},
    )
    assert fixed.status_code == 200, fixed.text
    incomplete = client.patch(
        f'/api/agriculture/parcels/{unlocated}', headers=h, json={'lat': 33.8},
    )
    assert incomplete.status_code == 422
    acquired = (datetime.now(timezone.utc) - timedelta(days=2)).isoformat()
    monkeypatch.setattr(satellite, '_provider_item', lambda value: (
        value, {'id': value, 'collection': 'sentinel-2-l2a', 'properties': {'datetime': acquired}},
    ))
    monkeypatch.setattr(satellite, 'build_processing_plan', lambda item, index: {'scene_id': item['id']})
    monkeypatch.setattr(satellite, 'compute_index_statistics', lambda plan, bbox, geometry_wgs84=None: {
        'statistics': {'mean': None}, 'pixels': {'valid': 0, 'total': 100, 'valid_fraction': 0},
    })
    poor = client.post(url, headers=h, json={'scene_id': 'S2A_TEST_SCENE_2026'})
    assert poor.status_code == 422, poor.text
    assert poor.json()['detail']['code'] == 'LOW_QUALITY_SATELLITE_SCENE'
    assert client.get(
        f'/api/agriculture/observations?parcel_id={unlocated}', headers=h,
    ).json() == []


def test_parcel_boundary_geojson_sets_centroid_and_rejects_self_intersection(client, world, db):
    h = login(client, 'o1m@t.dz')
    boundary = {
        'type': 'Polygon',
        'coordinates': [[
            [2.8695, 33.7995], [2.8705, 33.7995],
            [2.8705, 33.8005], [2.8695, 33.8005],
            [2.8695, 33.7995],
        ]],
    }
    created = client.post('/api/agriculture/parcels', headers=h, json={
        'name': 'Mapped field', 'crop': 'wheat', 'area_ha': 1.0,
        'location': 'Laghouat', 'boundary_geojson': boundary,
    })
    assert created.status_code == 201, created.text
    body = created.json()
    assert body['boundary_geojson']['type'] == 'Polygon'
    assert float(body['lat']) == pytest.approx(33.8, abs=1e-5)
    assert float(body['lon']) == pytest.approx(2.87, abs=1e-5)

    crossed = {
        'type': 'Polygon',
        'coordinates': [[
            [2.8695, 33.7995], [2.8705, 33.8005],
            [2.8695, 33.8005], [2.8705, 33.7995],
            [2.8695, 33.7995],
        ]],
    }
    bad = client.patch(f"/api/agriculture/parcels/{body['id']}", headers=h,
                       json={'boundary_geojson': crossed})
    assert bad.status_code == 422
    assert client.get('/api/agriculture/parcels', headers=login(client, 'o2m@t.dz')).json() == []


def test_sentinel_uses_real_boundary_and_recomputes_when_boundary_changes(client, world, monkeypatch):
    import app.routers.satellite_parcels as satellite
    h = login(client, 'o1m@t.dz')
    boundary = {
        'type': 'Polygon',
        'coordinates': [[
            [2.8695, 33.7995], [2.8705, 33.7995],
            [2.8705, 33.8005], [2.8695, 33.8005],
            [2.8695, 33.7995],
        ]],
    }
    parcel = client.post('/api/agriculture/parcels', headers=h, json={
        'name': 'Boundary Sentinel field', 'crop': 'wheat', 'area_ha': 1,
        'location': 'Laghouat', 'boundary_geojson': boundary,
    }).json()
    scene_id = 'S2A_BOUNDARY_SCENE_2026'
    acquired = (datetime.now(timezone.utc) - timedelta(days=2)).isoformat()
    captured = []
    monkeypatch.setattr(satellite, '_provider_item', lambda value: (
        value, {'id': value, 'collection': 'sentinel-2-l2a', 'properties': {'datetime': acquired}},
    ))
    monkeypatch.setattr(satellite, 'build_processing_plan',
                        lambda item, index: {'scene_id': item['id'], 'index': index})
    def raster(plan, bbox, geometry_wgs84=None):
        captured.append({'bbox': bbox, 'geometry': geometry_wgs84})
        return {
            'statistics': {'mean': .55},
            'pixels': {'valid': 60, 'total': 64, 'valid_fraction': .9375},
            'processing_plan_fingerprint': 'boundary-plan',
        }
    monkeypatch.setattr(satellite, 'compute_index_statistics', raster)
    monkeypatch.setattr(satellite, 'catalog_scenes', lambda **kwargs: {
        'scenes': [{'id': scene_id, 'datetime': acquired, 'cloud_cover_pct': 4.0}],
        'count': 1, 'live': True,
    })
    scenes = client.get(
        f"/api/agriculture/parcels/{parcel['id']}/remote-sensing/scenes",
        headers=h, params={'start':'2026-09-01','end':'2026-10-05'},
    )
    assert scenes.status_code == 200, scenes.text
    assert scenes.json()['sample_geometry'] == 'PARCEL_BOUNDARY_GEOJSON'

    url = f"/api/agriculture/parcels/{parcel['id']}/remote-sensing/analyze"
    first = client.post(url, headers=h, json={'scene_id':scene_id})
    assert first.status_code == 201, first.text
    assert first.json()['sample_geometry'] == 'PARCEL_BOUNDARY_GEOJSON'
    first_fp = first.json()['analysis_fingerprint']
    assert captured[0]['geometry']['type'] == 'Polygon'
    assert captured[0]['bbox'][0] == pytest.approx(2.8695)

    shifted = {
        'type': 'Polygon',
        'coordinates': [[
            [2.8700, 33.7995], [2.8710, 33.7995],
            [2.8710, 33.8005], [2.8700, 33.8005],
            [2.8700, 33.7995],
        ]],
    }
    patched = client.patch(
        f"/api/agriculture/parcels/{parcel['id']}", headers=h,
        json={'boundary_geojson': shifted},
    )
    assert patched.status_code == 200, patched.text
    second = client.post(url, headers=h, json={'scene_id':scene_id})
    assert second.status_code == 201, second.text
    assert second.json()['created'] is True
    assert second.json()['analysis_fingerprint'] != first_fp
    observations = client.get(
        f"/api/agriculture/observations?parcel_id={parcel['id']}", headers=h,
    ).json()
    assert len([x for x in observations if x['metric'] == 'ndvi']) == 2


def test_gis_parcel_geojson_exposes_only_owned_real_boundaries(client, world):
    h1 = login(client, 'o1m@t.dz')
    h2 = login(client, 'o2m@t.dz')
    boundary = {
        'type':'Polygon',
        'coordinates':[[[2.8695,33.7995],[2.8705,33.7995],[2.8705,33.8005],[2.8695,33.8005],[2.8695,33.7995]]],
    }
    row = client.post('/api/agriculture/parcels', headers=h1, json={
        'name':'GIS field','crop':'wheat','area_ha':1,'location':'Laghouat',
        'boundary_geojson':boundary,
    })
    assert row.status_code == 201, row.text
    own_geo = client.get('/api/gis/parcels.geojson', headers=h1)
    assert own_geo.status_code == 200, own_geo.text
    body = own_geo.json()
    assert body['metadata']['spatial_engine'] == 'portable_geojson'
    assert body['features'][0]['geometry']['type'] == 'Polygon'
    assert body['features'][0]['properties']['id'] == row.json()['id']
    other_geo = client.get('/api/gis/parcels.geojson', headers=h2)
    assert other_geo.status_code == 200
    assert other_geo.json()['features'] == []
