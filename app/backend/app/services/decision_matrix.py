"""Declared scenario comparison; versioned and reproducible, never field control."""
from decimal import Decimal, localcontext
import hashlib
import json

VERSION = 'weighted-minmax-v1'


def evaluate_matrix(snapshot):
    criteria = snapshot['criteria']
    options = snapshot['alternatives']
    results = []
    for option in options:
        violations = []
        for c in criteria:
            value = Decimal(str(option['values'][c['key']]))
            if c['minimum'] is not None and value < Decimal(str(c['minimum'])):
                violations.append({'criterion': c['key'], 'bound': 'minimum'})
            if c['maximum'] is not None and value > Decimal(str(c['maximum'])):
                violations.append({'criterion': c['key'], 'bound': 'maximum'})
        results.append({'name': option['name'], 'feasible': not violations, 'violations': violations, 'score': None, 'contributions': {}})
    feasible = [i for i, r in enumerate(results) if r['feasible']]
    with localcontext() as ctx:
        ctx.prec = 40
        total = sum(Decimal(str(c['weight'])) for c in criteria)
        for c in criteria:
            values = [Decimal(str(options[i]['values'][c['key']])) for i in feasible]
            if not values:
                continue
            low, high = min(values), max(values)
            for i in feasible:
                value = Decimal(str(options[i]['values'][c['key']]))
                utility = Decimal(1) if high == low else (value-low)/(high-low)
                if high != low and c['direction'] == 'minimize':
                    utility = 1 - utility
                contribution = utility * Decimal(str(c['weight'])) / total
                results[i]['contributions'][c['key']] = float(contribution)
        for i in feasible:
            results[i]['score'] = round(sum(results[i]['contributions'].values()) * 100, 6)
    ranking = sorted(feasible, key=lambda i: (-results[i]['score'], i))
    return {'algorithm': VERSION, 'input_sha256': hashlib.sha256(json.dumps(snapshot, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest(),
            'alternatives': results, 'ranking': [results[i]['name'] for i in ranking], 'status': 'PROPOSED', 'field_execution': False,
            'normalization_scope': 'feasible_alternatives', 'warning': 'declared_scenario_not_certified_recommendation'}
