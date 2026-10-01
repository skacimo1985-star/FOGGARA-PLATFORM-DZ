#![forbid(unsafe_code)]
use foggara_nexus_core::{parse_and_evaluate, MAX_INPUT_BYTES};
use std::io::{self, Read, Write};

fn run() -> Result<(), &'static str> {
    let mut bytes = Vec::new();
    io::stdin()
        .lock()
        .take(MAX_INPUT_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "input read failed")?;
    let result = parse_and_evaluate(&bytes)?;
    let mut stdout = io::stdout().lock();
    serde_json::to_writer(&mut stdout, &result).map_err(|_| "output failed")?;
    stdout.write_all(b"\n").map_err(|_| "output failed")
}
fn main() {
    if let Err(reason) = run() {
        // Deliberately excludes original input, labels and source document contents.
        eprintln!("nexus-core: {reason}");
        std::process::exit(2);
    }
}
