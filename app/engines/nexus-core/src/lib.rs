#![forbid(unsafe_code)]
//! Bounded comparison of declared scenarios. No device, network or database access.
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

pub const ALGORITHM: &str = "weighted-minmax-rust-v1";
pub const MAX_INPUT_BYTES: u64 = 1_048_576;

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Snapshot {
    pub title: String,
    pub context: String,
    pub criteria: Vec<Criterion>,
    pub alternatives: Vec<Alternative>,
    #[serde(default)]
    pub evidence_ids: Vec<u64>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Criterion {
    pub key: String,
    pub label: String,
    pub domain: Domain,
    pub unit: String,
    pub direction: Direction,
    pub weight: f64,
    pub minimum: Option<f64>,
    pub maximum: Option<f64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Domain {
    Water,
    Energy,
    Food,
    Ecosystem,
    Health,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Direction {
    Minimize,
    Maximize,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Alternative {
    pub name: String,
    #[serde(deserialize_with = "unique_values")]
    pub values: BTreeMap<String, f64>,
}

fn unique_values<'de, D: serde::Deserializer<'de>>(
    d: D,
) -> Result<BTreeMap<String, f64>, D::Error> {
    struct Unique;
    impl<'de> serde::de::Visitor<'de> for Unique {
        type Value = BTreeMap<String, f64>;
        fn expecting(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
            f.write_str("unique criterion values")
        }
        fn visit_map<A: serde::de::MapAccess<'de>>(
            self,
            mut map: A,
        ) -> Result<Self::Value, A::Error> {
            let mut result = BTreeMap::new();
            while let Some((key, value)) = map.next_entry::<String, f64>()? {
                if result.insert(key, value).is_some() {
                    return Err(serde::de::Error::custom("duplicate criterion"));
                }
                if result.len() > 20 {
                    return Err(serde::de::Error::custom("too many criteria"));
                }
            }
            Ok(result)
        }
    }
    d.deserialize_map(Unique)
}

#[derive(Debug, Serialize)]
pub struct Violation {
    pub criterion: String,
    pub bound: &'static str,
}

#[derive(Debug, Serialize)]
pub struct ResultRow {
    pub name: String,
    pub feasible: bool,
    pub violations: Vec<Violation>,
    pub score: Option<f64>,
    pub contributions: BTreeMap<String, f64>,
}

#[derive(Debug, Serialize)]
pub struct Evaluation {
    pub algorithm: &'static str,
    pub alternatives: Vec<ResultRow>,
    pub ranking: Vec<String>,
    pub status: &'static str,
    pub field_execution: bool,
    pub normalization_scope: &'static str,
    pub warning: &'static str,
}

fn text_length(value: &str, min: usize, max: usize) -> bool {
    let size = value.chars().count();
    size >= min && size <= max && !value.trim().is_empty()
}
fn bounded(value: f64) -> bool {
    value.is_finite() && value.abs() <= 1e15
}

impl Snapshot {
    pub fn validate(&self) -> Result<(), &'static str> {
        if !text_length(&self.title, 3, 255)
            || !text_length(&self.context, 10, 3000)
            || self.criteria.is_empty()
            || self.criteria.len() > 20
            || !(2..=20).contains(&self.alternatives.len())
            || self.evidence_ids.len() > 30
        {
            return Err("invalid snapshot dimensions");
        }
        let mut keys = BTreeSet::new();
        let mut total = 0.0;
        for c in &self.criteria {
            let key = c.key.as_bytes();
            if key.is_empty()
                || key.len() > 40
                || !key[0].is_ascii_lowercase()
                || !key
                    .iter()
                    .all(|v| v.is_ascii_lowercase() || v.is_ascii_digit() || *v == b'_')
                || !keys.insert(c.key.as_str())
                || !text_length(&c.label, 2, 100)
                || !text_length(&c.unit, 1, 40)
                || !c.weight.is_finite()
                || !(0.0..=100.0).contains(&c.weight)
                || c.minimum.is_some_and(|v| !bounded(v))
                || c.maximum.is_some_and(|v| !bounded(v))
                || matches!((c.minimum, c.maximum), (Some(a), Some(b)) if a > b)
            {
                return Err("invalid criterion");
            }
            total += c.weight;
        }
        if total <= 0.0 {
            return Err("positive total weight required");
        }
        let mut names = BTreeSet::new();
        for a in &self.alternatives {
            if !text_length(&a.name, 2, 100)
                || !names.insert(a.name.as_str())
                || a.values.keys().map(String::as_str).collect::<BTreeSet<_>>() != keys
                || a.values.values().any(|v| !bounded(*v))
            {
                return Err("invalid alternative");
            }
        }
        Ok(())
    }
}

pub fn evaluate(snapshot: &Snapshot) -> Result<Evaluation, &'static str> {
    snapshot.validate()?;
    let mut rows: Vec<ResultRow> = snapshot
        .alternatives
        .iter()
        .map(|a| {
            let mut violations = Vec::new();
            for c in &snapshot.criteria {
                let value = a.values[&c.key];
                if c.minimum.is_some_and(|v| value < v) {
                    violations.push(Violation {
                        criterion: c.key.clone(),
                        bound: "minimum",
                    });
                }
                if c.maximum.is_some_and(|v| value > v) {
                    violations.push(Violation {
                        criterion: c.key.clone(),
                        bound: "maximum",
                    });
                }
            }
            ResultRow {
                name: a.name.clone(),
                feasible: violations.is_empty(),
                violations,
                score: None,
                contributions: BTreeMap::new(),
            }
        })
        .collect();
    let feasible: Vec<usize> = rows
        .iter()
        .enumerate()
        .filter_map(|(i, r)| r.feasible.then_some(i))
        .collect();
    let total: f64 = snapshot.criteria.iter().map(|c| c.weight).sum();
    for c in &snapshot.criteria {
        let low = feasible
            .iter()
            .map(|i| snapshot.alternatives[*i].values[&c.key])
            .fold(f64::INFINITY, f64::min);
        let high = feasible
            .iter()
            .map(|i| snapshot.alternatives[*i].values[&c.key])
            .fold(f64::NEG_INFINITY, f64::max);
        for i in &feasible {
            let value = snapshot.alternatives[*i].values[&c.key];
            let utility = if high == low {
                1.0
            } else {
                match c.direction {
                    Direction::Maximize => (value - low) / (high - low),
                    Direction::Minimize => (high - value) / (high - low),
                }
            };
            rows[*i]
                .contributions
                .insert(c.key.clone(), utility * c.weight / total);
        }
    }
    for i in &feasible {
        // Sum in declared criterion order, independent of map/key iteration order.
        let score = snapshot
            .criteria
            .iter()
            .map(|c| rows[*i].contributions[&c.key])
            .sum::<f64>()
            * 100.0;
        rows[*i].score = Some((score * 1e6).round_ties_even() / 1e6);
    }
    let mut ranking = feasible;
    ranking.sort_by(|a, b| {
        rows[*b]
            .score
            .unwrap_or(0.0)
            .total_cmp(&rows[*a].score.unwrap_or(0.0))
            .then(a.cmp(b))
    });
    Ok(Evaluation {
        algorithm: ALGORITHM,
        ranking: ranking.iter().map(|i| rows[*i].name.clone()).collect(),
        alternatives: rows,
        status: "PROPOSED",
        field_execution: false,
        normalization_scope: "feasible_alternatives",
        warning: "declared_scenario_not_certified_recommendation",
    })
}

pub fn parse_and_evaluate(bytes: &[u8]) -> Result<Evaluation, &'static str> {
    if bytes.len() as u64 > MAX_INPUT_BYTES {
        return Err("input exceeds size limit");
    }
    let snapshot: Snapshot = serde_json::from_slice(bytes).map_err(|_| "invalid JSON snapshot")?;
    evaluate(&snapshot)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> Snapshot {
        serde_json::from_str(r#"{"title":"Analysis","context":"Declared comparison","criteria":[{"key":"water","label":"Water","domain":"water","unit":"m3","direction":"minimize","weight":60,"minimum":0,"maximum":100},{"key":"energy","label":"Energy","domain":"energy","unit":"kWh","direction":"maximize","weight":40,"minimum":null,"maximum":null}],"alternatives":[{"name":"AA","values":{"water":20,"energy":10}},{"name":"BB","values":{"water":80,"energy":20}},{"name":"CC","values":{"water":120,"energy":1000}}],"evidence_ids":[]}"#).unwrap()
    }
    #[test]
    fn hard_bounds_exclude_before_normalization() {
        let r = evaluate(&fixture()).unwrap();
        assert_eq!(r.ranking, vec!["AA", "BB"]);
        assert_eq!(r.alternatives[0].score, Some(60.0));
        assert_eq!(r.alternatives[1].score, Some(40.0));
        assert_eq!(r.alternatives[2].score, None);
        assert!(r.alternatives[2].contributions.is_empty());
        assert!(!r.field_execution);
    }
    #[test]
    fn equal_values_and_ties_keep_input_order() {
        let mut s = fixture();
        s.alternatives.truncate(2);
        s.alternatives[1].values = s.alternatives[0].values.clone();
        let r = evaluate(&s).unwrap();
        assert_eq!(r.ranking, vec!["AA", "BB"]);
        assert!(r.alternatives.iter().all(|a| a.score == Some(100.0)));
    }
    #[test]
    fn all_infeasible_has_empty_ranking() {
        let mut s = fixture();
        s.criteria[0].maximum = Some(1.0);
        let r = evaluate(&s).unwrap();
        assert!(r.ranking.is_empty());
        assert!(r.alternatives.iter().all(|a| a.score.is_none()));
    }
    #[test]
    fn rejects_nonfinite_and_overflow_range() {
        for bad in [f64::NAN, f64::INFINITY, -f64::INFINITY, 1e16] {
            let mut s = fixture();
            s.alternatives[0].values.insert("water".into(), bad);
            assert!(evaluate(&s).is_err());
        }
    }
    #[test]
    fn rejects_keys_names_missing_values_and_zero_weight() {
        let mut s = fixture();
        s.criteria[1].key = "water".into();
        assert!(evaluate(&s).is_err());
        let mut s = fixture();
        s.alternatives[1].name = "AA".into();
        assert!(evaluate(&s).is_err());
        let mut s = fixture();
        s.alternatives[0].values.remove("water");
        assert!(evaluate(&s).is_err());
        let mut s = fixture();
        for c in &mut s.criteria {
            c.weight = 0.0;
        }
        assert!(evaluate(&s).is_err());
    }
    #[test]
    fn inclusive_bounds_are_feasible() {
        let mut s = fixture();
        s.criteria[0].minimum = Some(20.0);
        s.criteria[0].maximum = Some(80.0);
        let r = evaluate(&s).unwrap();
        assert!(r.alternatives[0].feasible && r.alternatives[1].feasible);
    }
    #[test]
    fn rejects_bad_bounds_and_unknown_fields() {
        let mut s = fixture();
        s.criteria[0].minimum = Some(101.0);
        assert!(evaluate(&s).is_err());
        assert!(parse_and_evaluate(br#"{"title":"test","unknown":true}"#).is_err());
    }
    #[test]
    fn rejects_duplicate_json_values_and_trailing_json() {
        assert!(serde_json::from_str::<Alternative>(
            r#"{"name":"AA","values":{"water":1,"water":2}}"#
        )
        .is_err());
        assert!(parse_and_evaluate(b"{} {}").is_err());
        assert!(parse_and_evaluate(b"NaN").is_err());
    }
    #[test]
    fn bounded_json_and_reproducibility() {
        assert!(parse_and_evaluate(&vec![b' '; MAX_INPUT_BYTES as usize + 1]).is_err());
        let s = fixture();
        assert_eq!(
            serde_json::to_string(&evaluate(&s).unwrap()).unwrap(),
            serde_json::to_string(&evaluate(&s).unwrap()).unwrap()
        );
    }
}
