use std::io::Write;
use std::process::{Command, Stdio};

fn run(input: &[u8]) -> std::process::Output {
    let mut child = Command::new(env!("CARGO_BIN_EXE_foggara-nexus-core"))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    child.stdin.take().unwrap().write_all(input).unwrap();
    child.wait_with_output().unwrap()
}

#[test]
fn errors_do_not_echo_sensitive_input() {
    let result = run(br#"{"confidential":"private project secret"}"#);
    assert_eq!(result.status.code(), Some(2));
    assert!(result.stdout.is_empty());
    let err = String::from_utf8(result.stderr).unwrap();
    assert!(err.contains("invalid JSON snapshot"));
    assert!(!err.contains("secret"));
}

#[test]
fn oversized_input_is_rejected() {
    let result = run(&vec![
        b' ';
        foggara_nexus_core::MAX_INPUT_BYTES as usize + 1
    ]);
    assert_eq!(result.status.code(), Some(2));
    assert!(result.stdout.is_empty());
}

#[test]
fn valid_unicode_input_returns_json_only() {
    let result = run(r#"{"title":"المقارنة","context":"مقارنة الموارد المعلنة","criteria":[{"key":"water","label":"المياه","domain":"water","unit":"m3","direction":"minimize","weight":100,"minimum":null,"maximum":null}],"alternatives":[{"name":"الأول","values":{"water":1}},{"name":"الثاني","values":{"water":2}}]}"#.as_bytes());
    assert!(result.status.success());
    assert!(result.stderr.is_empty());
    let parsed: serde_json::Value = serde_json::from_slice(&result.stdout).unwrap();
    assert_eq!(parsed["ranking"][0], "الأول");
    assert_eq!(parsed["field_execution"], false);
    assert_eq!(parsed["status"], "PROPOSED");
}
