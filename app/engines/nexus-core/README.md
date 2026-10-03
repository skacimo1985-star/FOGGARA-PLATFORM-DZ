# FOGGARA Nexus calculation core

This Rust executable compares declared decision alternatives. It applies hard
bounds before normalization, then scores feasible alternatives using weighted
min–max utility. It does not issue equipment commands, access a database, call
external APIs, certify recommendations, or establish regulatory compliance.

## Build and verify

```sh
cargo test --locked
cargo build --release --locked
cargo clippy --locked --all-targets -- -D warnings
```

Build from this directory. Commit `Cargo.lock` with dependency changes. The
executable is `target/release/foggara-nexus-core` (`.exe` on Windows).
`unsafe` Rust is forbidden in this crate; this does not make a claim about every
transitive dependency or eliminate all application security risks.

## Protocol

One JSON snapshot on standard input, one JSON result on standard output, followed
by a newline. Maximum input: 1 MiB. No HTTP listener. Errors return exit code 2
and a generic error on standard error; input contents are not echoed.

Input fields match the backend's validated matrix snapshot:

| Field | Constraint |
| --- | --- |
| `title` | 3–255 Unicode characters |
| `context` | 10–3000 Unicode characters |
| `criteria` | 1–20 criteria |
| `alternatives` | 2–20 alternatives with distinct names |
| `evidence_ids` | Optional array, at most 30 nonnegative integers |

Each criterion has `key`, `label`, `domain`, `unit`, `direction`, `weight`,
`minimum`, and `maximum`. Keys match `[a-z][a-z0-9_]{0,39}` and are unique.
Domains are `water`, `energy`, `food`, `ecosystem`, and `health`. Direction is
`minimize` or `maximize`. Weight is finite, in [0,100], with a strictly positive
sum. Nullable bounds must be finite, at most 10^15 in absolute magnitude, and
ordered. Labels contain 2–100 characters; units 1–40.

Each alternative has `name` (2–100 characters) and `values`, containing exactly
one finite number per criterion, also bounded by 10^15 in absolute magnitude.
Unknown object fields, duplicate JSON value keys, nonfinite JSON numbers,
trailing JSON, missing values and inconsistent bounds are rejected. The Rust
process does not authorize `evidence_ids`: authenticated backend authorization
and organization isolation remain mandatory before invoking the process.

Output fields: `algorithm`, `alternatives`, `ranking`, `status`,
`field_execution`, `normalization_scope`, and `warning`. Each alternative returns
`name`, `feasible`, `violations`, `score`, and `contributions`. The backend adds
its SHA-256 hash over the canonical input snapshot and persists the record.

## Calculation and precision

Algorithm version: `weighted-minmax-rust-v1`. For each criterion, normalize
over **feasible alternatives only**. For maximize, utility is `(value-low)/(high-low)`;
for minimize, `(high-value)/(high-low)`. Equal observed values yield utility 1.
The weighted contribution is `utility * weight / sum(weights)`. The score is
the sum of contributions × 100, rounded to six decimal places with ties to even.
Hard-bound equality is feasible. Zero-weight criteria still enforce hard bounds.
An infeasible alternative has a null score and no contributions. If none are
feasible, ranking is empty. Equal scores retain declared alternative order;
there is no automatically approved winner.

This version uses bounded IEEE-754 binary64 (`f64`), unlike the Python reference's
Decimal intermediate arithmetic. Results are deterministic for this version
but are not asserted to be byte-identical to the Python version. Tiny rounding
differences can change close rankings; review the inputs and contributions.
Changing alternatives changes min–max normalization and can change rankings.
Scores are scenario-relative preferences, not measured performance, probabilities,
investment ratings, or calibrated risk estimates.

The operating backend must explicitly select this engine, invoke it without a
shell, bound output and execution time, validate result shape, and fail closed
when the chosen executable cannot run. It must never label a Python fallback
as a Rust computation. No executable or Rust compiler is included in Git.
