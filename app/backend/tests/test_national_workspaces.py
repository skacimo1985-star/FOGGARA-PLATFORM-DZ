"""Persistence, provenance and tenant boundaries of national workspaces."""
from decimal import Decimal
import json
import httpx
import pytest
from sqlalchemy import select, func
from app.models import Evidence, Project, AuditLog
from app.reference_models import NationalWilaya, ReferenceEntry, AIAnalysisRun
from app.services.reference_catalog import ensure_reference_catalog
from app.services import llm_ensemble as llm
from .test_platform_completion import setup, agri_source


def site(client, headers, name='Field site', wilaya='Laghouat'):
    r=client.post('/api/sites',headers=headers,json={'name':name,'wilaya':wilaya,'lat':33.8,'lon':2.8})
    assert r.status_code==201,r.text
    return r.json()


def test_reference_idempotent_localized(client,world,db):
    ensure_reference_catalog(db);ensure_reference_catalog(db);db.commit()
    assert db.scalar(select(func.count()).select_from(NationalWilaya))==69
    assert db.scalar(select(func.count()).select_from(ReferenceEntry))==14
    d=client.get('/api/reference/wilayas').json();assert d['count']==69 and d['operational_coverage'] is False
    rows={r['code']:r for r in d['wilayas']}
    assert rows['53']['en']=='In Salah' and rows['54']['en']=='In Guezzam'
    assert rows['59']['en']=='Aflou' and rows['69']['en']=='El Abiodh Sidi Cheikh'
    for locale in ('ar','fr','en'):
        refs=client.get('/api/reference/catalog',params={'locale':locale}).json()
        assert refs['wilaya_count']==69 and len(refs['items'])==14
        assert all(r['title'] and r['summary'] and r['source_url'].startswith('https://') and r['data_class']=='REFERENCE' for r in refs['items'])
    assert client.get('/api/reference/catalog?locale=xx').status_code==422
    assert len(client.get('/api/reference/catalog?category=law').json()['items'])==9


def test_registry_persistence_and_link_constraints(client,setup):
    s=setup;a=site(client,s['own']);b=site(client,s['own'],'Second','69');assert a['wilaya']=='03'
    edit={'name':'Updated site','wilaya':'الأغواط','lat':33.9,'lon':2.9}
    assert client.patch(f"/api/sites/{a['id']}",headers=s['other'],json=edit).status_code==404
    assert client.patch(f"/api/sites/{a['id']}",headers=s['own'],json=edit).json()['wilaya']=='03'
    assert client.get('/api/sites',headers=s['own']).json()['items'][0]['name']=='Updated site'
    for invalid in ({'name':'Invalid','wilaya':'00'},{'name':'Invalid','wilaya':'03','lat':33.8}):
        assert client.post('/api/sites',headers=s['own'],json=invalid).status_code==422
    rb={'site_id':a['id'],'name':'Foggara A','type':'foggara','status':'active'}
    r=client.post('/api/resources',headers=s['own'],json=rb).json()
    assert client.patch(f"/api/resources/{r['id']}",headers=s['own'],json={**rb,'site_id':b['id']}).status_code==409
    assert client.patch(f"/api/resources/{r['id']}",headers=s['other'],json=rb).status_code==404
    assert client.patch(f"/api/resources/{r['id']}",headers=s['own'],json={**rb,'status':'degraded'}).json()['status']=='degraded'
    ab={'resource_id':r['id'],'kind':'channel','name':'Channel A','status':'operational'}
    asset=client.post('/api/assets',headers=s['own'],json=ab).json()
    assert client.patch(f"/api/assets/{asset['id']}",headers=s['other'],json=ab).status_code==404
    assert client.patch(f"/api/assets/{asset['id']}",headers=s['own'],json={**ab,'status':'maintenance'}).json()['status']=='maintenance'
    p={'title':'Linked project','site_id':b['id'],'resource_id':r['id'],'asset_id':asset['id']}
    assert client.post('/api/projects',headers=s['own'],json=p).status_code==422
    assert client.post('/api/projects',headers=s['own'],json={**p,'site_id':a['id']}).status_code==201
    assert client.get('/api/resources',headers=s['other']).json()['items']==[]


def test_economics_exact_scenarios_and_isolation(client,setup):
    s=setup;path=f"/api/projects/{s['project']}/economics"
    body={'title':'Reviewed assumptions','initial_investment':'1000.00','discount_percent':'10','stress_percent':'20','years':[{'revenue':'800','cost':'200'}]*2,'source_note':'Explicit test assumptions','evidence_id':s['evidence']}
    assert client.post(path,headers=s['other'],json=body).status_code==404
    r=client.post(path,headers=s['own'],json=body);assert r.status_code==201,r.text
    row=r.json();base,stress,upside=row['results']['cases']
    assert Decimal(base['npv_dzd'])==Decimal('41.32') and Decimal(base['payback_years'])==Decimal('1.6667')
    assert Decimal(base['net_total_dzd'])==200 and stress['payback_years'] is None
    assert Decimal(stress['npv_dzd'])<Decimal(base['npv_dzd'])<Decimal(upside['npv_dzd'])
    assert row['results']['funding_approval'] is False and row['results']['assumptions_class']=='PROPOSED'
    assert client.get(path,headers=s['own']).json()[0]['input_hash']==row['input_hash']
    assert client.get(path,headers=s['other']).status_code==404
    assert client.post(path,headers=s['own'],json={**body,'initial_investment':'NaN'}).status_code==422


def test_water_sar_soil_and_evidence_withdrawal(client,setup,db):
    s=setup;path=f"/api/projects/{s['project']}/agriculture"
    body={**agri_source(s),'sample_id':'Water 01','method':'Laboratory report','ph':7.4,'ec_ds_m':1.2,'sodium_meq_l':4,'calcium_meq_l':4,'magnesium_meq_l':4}
    assert client.post(path+'/water',headers=s['other'],json=body).status_code==404
    r=client.post(path+'/water',headers=s['own'],json=body);assert r.status_code==201,r.text
    c=r.json()['content'];assert c['sar']==2 and c['sar_provenance']=='COMPUTED'
    assert c['suitability_assessed'] is False and c['field_execution'] is False
    for override in ({'calcium_meq_l':0,'magnesium_meq_l':0},{'sodium_meq_l':None}):
        assert client.post(path+'/water',headers=s['own'],json={**body,**override}).json()['content']['sar'] is None
    assert client.post(path+'/water',headers=s['own'],json={**body,'ph':15}).status_code==422
    soil={**agri_source(s),'sample_id':'Soil 01','method':'Laboratory report','ec_ds_m':1.2,'organic_matter_percent':2.5,'temperature_c':28,'texture':'Sandy loam'}
    assert client.post(path+'/soil',headers=s['own'],json=soil).status_code==201
    records=client.get(path,headers=s['own']).json()['records'];assert len(records)==4 and {r['kind'] for r in records}=={'water','soil'}
    db.get(Evidence,s['evidence']).status='rejected';db.commit()
    assert client.get(path,headers=s['own']).json()['records']==[]
    assert client.post(path+'/water',headers=s['own'],json=body).status_code==409


def test_ai_packet_scope_persistence_and_unconfigured_state(client,setup,db,monkeypatch):
    for key in ('FOGGARA_OLLAMA_URL','FOGGARA_LLM_MODELS','FOGGARA_LLM_PRIVATE_DEPLOYMENT'):monkeypatch.delenv(key,raising=False)
    s=setup;body={'project_id':s['project'],'domain':'soil','locale':'ar','question':'What data is needed for this field?'}
    assert client.get('/api/ai/models',headers=s['own']).json()['status']=='unconfigured'
    assert client.post('/api/ai/analyses',headers=s['own'],json=body).json()['status']=='insufficient_data'
    a=site(client,s['own']);db.get(Project,s['project']).site_id=a['id'];db.commit()
    assert client.post('/api/ai/analyses',headers=s['other'],json=body).status_code==404
    row=client.post('/api/ai/analyses',headers=s['own'],json=body).json()
    assert row['status']=='prepared' and row['results']['drafts']==[] and row['results']['missing']==['private_model_connection']
    assert len(row['input_hash'])==64 and row['snapshot']['sources'][0]['crs']=='EPSG:4326' and row['snapshot']['sources'][0]['latitude']==33.8
    assert all('password_hash' not in source and 'email' not in source for source in row['snapshot']['sources']) and 'o2m@t.dz' not in json.dumps(row)
    assert client.get(f"/api/ai/analyses?project_id={s['project']}",headers=s['own']).json()[0]['id']==row['id']
    assert client.get(f"/api/ai/analyses?project_id={s['project']}",headers=s['other']).status_code==404


def test_model_schema_and_source_validation(monkeypatch):
    snapshot={'sources':[{'source_id':'site:1','class':'OBSERVED'}]}
    draft={'summary':'Limited documented field analysis','source_ids':['site:1'],'limitations':['No laboratory report'],'next_steps':['Obtain reviewed samples']}
    class FakeClient:
        def __init__(self,**kw):assert kw['follow_redirects'] is False and kw['trust_env'] is False
        def __enter__(self):return self
        def __exit__(self,*args):pass
        def post(self,url,json):
            assert json['format']['additionalProperties'] is False and 'tools' not in json
            return httpx.Response(200,json={'message':{'content':__import__('json').dumps(draft)}},request=httpx.Request('POST',url))
    monkeypatch.setattr(llm.httpx,'Client',FakeClient)
    result=llm.generate('http://private-llm','model-a',snapshot,'Analyse sources','water','ar')
    assert result['data_class']=='PROPOSED' and result['validated_facts'] is False
    draft['source_ids']=['invented:99']
    with pytest.raises(ValueError,match='Unsupported source'):llm.generate('http://private-llm','model-a',snapshot,'Analyse sources','water','ar')


def test_durable_ensemble_partial_failure_and_audit(client,setup,db,monkeypatch):
    s=setup;a=site(client,s['own']);db.get(Project,s['project']).site_id=a['id'];db.commit()
    monkeypatch.setenv('FOGGARA_OLLAMA_URL','http://private-llm');monkeypatch.setenv('FOGGARA_LLM_MODELS','model-a,model-b,model-a');monkeypatch.setenv('FOGGARA_LLM_PRIVATE_DEPLOYMENT','true')
    row=client.post('/api/ai/analyses',headers=s['own'],json={'project_id':s['project'],'domain':'water','locale':'en','question':'Analyse only these supplied records'}).json();assert row['status']=='queued'
    def generate(url,model,*args):
        if model=='model-b':raise ValueError('Unverified private payload must not leak')
        return {'model':model,'summary':'A reviewed draft','source_ids':[f"site:{a['id']}"],'limitations':['Incomplete data'],'next_steps':[],'data_class':'PROPOSED','validated_facts':False}
    monkeypatch.setattr(llm,'generate',generate)
    llm.process_ai_one();db.expire_all();saved=db.get(AIAnalysisRun,row['id'])
    assert saved.status=='partial' and saved.results['consensus_verified'] is False
    assert saved.results['failures']==[{'model':'model-b','error':'ValueError'}] and 'private payload' not in json.dumps(saved.results)
    assert db.scalar(select(AuditLog).where(AuditLog.entity_type=='ai_analysis',AuditLog.action=='generate',AuditLog.entity_id==row['id'])) is not None
    llm.process_ai_one();db.expire_all();assert db.get(AIAnalysisRun,row['id']).status=='partial'


def test_ai_preserves_provider_estimate_provenance(client, setup):
    s = setup
    path = f"/api/projects/{s['project']}/agriculture/provider-estimate"
    response = client.post(path, headers=s['reviewer'], json={**agri_source(s), 'product': 'soil',
        'report_ref': 'Licensed test report', 'method': 'Provider model', 'rights_confirmed': True, 'ph': 7.2})
    assert response.status_code == 201, response.text
    analysis = client.post('/api/ai/analyses', headers=s['own'], json={'project_id':s['project'],
        'domain':'soil', 'locale':'en', 'question':'Assess the supplied estimate limits'}).json()
    source = next(item for item in analysis['snapshot']['sources'] if item['source_id'] == f"agriculture:{response.json()['id']}")
    assert source['class'] == 'INFERRED'


def test_queued_models_cannot_silently_change(client, setup, db, monkeypatch):
    s = setup
    location = site(client, s['own'])
    db.get(Project, s['project']).site_id = location['id']; db.commit()
    monkeypatch.setenv('FOGGARA_OLLAMA_URL', 'http://private-llm')
    monkeypatch.setenv('FOGGARA_LLM_PRIVATE_DEPLOYMENT', 'true')
    monkeypatch.setenv('FOGGARA_LLM_MODELS', 'model-a')
    row = client.post('/api/ai/analyses', headers=s['own'], json={'project_id':s['project'],
        'domain':'water', 'locale':'en', 'question':'Use the recorded source packet'}).json()
    monkeypatch.setenv('FOGGARA_LLM_MODELS', 'model-b')
    monkeypatch.setattr(llm, 'generate', lambda *args: pytest.fail('Changed model must not receive the source packet'))
    assert llm.process_ai_one() == 'failed'
    db.expire_all()
    saved = db.get(AIAnalysisRun, row['id'])
    assert saved.results['models'] == ['model-a'] and saved.input_hash == row['input_hash']
    assert saved.results['failures'] == [{'error':'ConfigurationChanged'}]


def test_water_sar_handles_small_positive_cations(client, setup):
    s = setup
    body = {**agri_source(s), 'sample_id':'Tiny-cations-test', 'method':'Synthetic arithmetic test',
            'sodium_meq_l':1, 'calcium_meq_l':5e-324, 'magnesium_meq_l':0}
    response = client.post(f"/api/projects/{s['project']}/agriculture/water", headers=s['own'], json=body)
    assert response.status_code == 201, response.text
    import math
    assert math.isfinite(response.json()['content']['sar'])
