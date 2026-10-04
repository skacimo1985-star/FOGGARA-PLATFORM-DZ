from tests.test_platform_completion import setup, agri_source  # noqa: F401


def body(s):
    return {**agri_source(s), 'product':'soil', 'report_ref':'PROVIDER-REPORT-001',
            'method':'External remote sensing model; validation pending', 'rights_confirmed':True,
            'source_resolution_m':10, 'update_interval_days':120, 'ph':7.4}


def test_provider_soil_stays_inferred_and_isolated(client,setup):
    s=setup; path=f"/api/projects/{s['project']}/agriculture"
    assert client.post(path+'/provider-estimate',headers=s['own'],json=body(s)).status_code==403
    result=client.post(path+'/provider-estimate',headers=s['reviewer'],json=body(s))
    assert result.status_code==201,result.text
    c=result.json()['content']
    assert c['provenance']=='INFERRED' and c['ph']==7.4
    assert c['local_validation'] is False and c['redistribution_authorized'] is False
    rows=client.get(path,headers=s['own']).json()['records']
    assert rows[0]['provenance']=='INFERRED' and rows[0]['source']=='Reviewed data provider'
    assert client.get(path,headers=s['other']).status_code==404
    assert client.post(path+'/provider-estimate',headers=s['other'],json=body(s)).status_code==403


def test_provider_estimate_requires_rights_valid_values_and_metadata(client,setup):
    s=setup; path=f"/api/projects/{s['project']}/agriculture/provider-estimate"
    for patch in ({'rights_confirmed':False},{'ph':15},{'provenance':'VERIFIED'},{'source_resolution_m':0},
                  {'product':'ndvi'},{'ph':None},{'observed_at':'2099-01-01T00:00:00Z'}):
        assert client.post(path,headers=s['reviewer'],json={**body(s),**patch}).status_code==422


def test_provider_indices_and_moisture_do_not_assume_accuracy(client,setup):
    s=setup; path=f"/api/projects/{s['project']}/agriculture/provider-estimate"
    base=body(s);base.pop('ph');base.pop('source_resolution_m');base.pop('update_interval_days')
    for product,field,value in [('ndvi','ndvi',0.4),('lswi','lswi',-0.2),('moisture','moisture_percent',28)]:
        result=client.post(path,headers=s['reviewer'],json={**base,'product':product,field:value})
        assert result.status_code==201,result.text
        data=result.json()['content']
        assert data['provenance']=='INFERRED' and data['source_resolution_m'] is None
        assert not data['local_validation'] and not data['field_execution']
