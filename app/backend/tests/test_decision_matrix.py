from .test_platform_completion import setup
from app.services.decision_matrix import evaluate_matrix
import pytest


def snapshot():
    return {'title':'Irrigation options', 'context':'Declared estimates for comparison only', 'evidence_ids':[],
            'criteria':[{'key':'water','label':'Water demand','domain':'water','unit':'m3','direction':'minimize','weight':60,'minimum':None,'maximum':100},
                        {'key':'energy','label':'Energy demand','domain':'energy','unit':'kWh','direction':'minimize','weight':40,'minimum':None,'maximum':None}],
            'alternatives':[{'name':'Morning','values':{'water':80,'energy':20}}, {'name':'Midday','values':{'water':90,'energy':10}}, {'name':'Over limit','values':{'water':110,'energy':1}}]}


def test_hard_limits_before_soft_ranking():
    result=evaluate_matrix(snapshot())
    assert result['ranking']==['Morning','Midday']
    assert result['alternatives'][0]['score']==60
    assert result['alternatives'][1]['score']==40
    blocked=result['alternatives'][2]
    assert blocked['score'] is None and blocked['violations']==[{'criterion':'water','bound':'maximum'}]
    assert result['field_execution'] is False and result['status']=='PROPOSED'


def test_identical_values_and_infeasible_scenarios():
    data=snapshot(); data['alternatives']=data['alternatives'][:2]
    data['alternatives'][1]['values']=dict(data['alternatives'][0]['values'])
    result=evaluate_matrix(data)
    assert all(a['score']==100 for a in result['alternatives'])
    data['criteria'][0]['maximum']=50
    assert evaluate_matrix(data)['ranking']==[]
    assert all(a['score'] is None for a in evaluate_matrix(data)['alternatives'])


def test_reproducibility_and_input_fingerprint():
    data=snapshot();a=evaluate_matrix(data);assert a==evaluate_matrix(data)
    data['criteria'][0]['weight']=10
    b=evaluate_matrix(data);assert b['input_sha256']!=a['input_sha256'] and b['ranking'][0]=='Midday'


def test_matrix_persistence_isolation_and_audit(client,setup):
    s=setup;path=f"/api/projects/{s['project']}/decision-matrices";data=snapshot();data['evidence_ids']=[s['evidence']]
    first=client.post(path,headers=s['own'],json=data)
    assert first.status_code==201,first.text
    record=first.json(); assert record['results']['status']=='PROPOSED'
    assert client.get(path,headers=s['own']).json()[0]['results']==record['results']
    assert client.post(path,headers=s['other'],json=data).status_code==404
    assert client.get(path,headers=s['other']).status_code==404
    assert client.get(path).status_code==401
    assert any(row['action']=='compute_matrix' for row in client.get('/api/audit',headers=s['owner']).json())


@pytest.mark.parametrize('change', ['missing','weights','bounds','duplicate','extra'])
def test_matrix_rejects_incomplete_or_inconsistent_inputs(client,setup,change):
    data=snapshot()
    if change=='missing': del data['alternatives'][0]['values']['water']
    if change=='weights':
        for c in data['criteria']: c['weight']=0
    if change=='bounds': data['criteria'][0]['minimum']=200
    if change=='duplicate': data['criteria'][1]['key']='water'
    if change=='extra': data['alternatives'][0]['values']['mystery']=1
    assert client.post(f"/api/projects/{setup['project']}/decision-matrices",headers=setup['own'],json=data).status_code==422


def test_matrix_to_human_decision_preserves_evidence_and_guards(client,setup):
    s=setup;path=f"/api/projects/{s['project']}/decision-matrices";run=client.post(path,headers=s['own'],json=snapshot()).json()
    proposal={'alternative':'Morning','reason':'Reviewed assumptions and selected water efficiency','risk_level':'medium'}
    url=f"{path}/{run['id']}/propose"
    assert client.post(url,headers=s['other'],json=proposal).status_code==404
    assert client.post(url,headers=s['own'],json={**proposal,'alternative':'Over limit'}).status_code==422
    result=client.post(url,headers=s['own'],json=proposal);assert result.status_code==201,result.text
    did=result.json()['decision_id']
    d=client.get(f'/api/decisions/{did}',headers=s['own']).json()
    assert d['status']=='PROPOSED' and d['subject_id']==s['project'] and d['source_id']==str(run['id'])
    ev=client.get(f'/api/decisions/{did}/evidence',headers=s['own']).json()
    assert ev[0]['evidence_type']=='calculation' and ev[0]['meta']['input_sha256']==run['results']['input_sha256']
    assert client.get(path,headers=s['own']).json()[0]['decision_id']==did
    assert client.post(url,headers=s['own'],json=proposal).status_code==409


def test_graph_records_matrix_decision_relationship(client,setup):
    s=setup;path=f"/api/projects/{s['project']}/decision-matrices";data=snapshot();data['evidence_ids']=[s['evidence']]
    run=client.post(path,headers=s['own'],json=data).json()
    did=client.post(f"{path}/{run['id']}/propose",headers=s['own'],json={'alternative':'Morning','reason':'Reviewed choice for human approval','risk_level':'medium'}).json()['decision_id']
    graph=client.get(f"/api/projects/{s['project']}/evidence-graph",headers=s['own']).json()
    assert any(e['source']==f"matrix:{run['id']}" and e['target']==f'gov_decision:{did}' and e['relation']=='informs' for e in graph['edges'])
    assert any(n['id']==f"matrix:{run['id']}" and n['provenance']=='COMPUTED' for n in graph['nodes'])
    assert graph['causal_claim'] is False
