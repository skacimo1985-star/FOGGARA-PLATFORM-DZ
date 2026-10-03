"""Import a reviewed administrative hierarchy file into FOGGARA-DZ.

Example:
  python -m scripts.import_admin_reference official.json --sha256 <digest> --verified --complete-2026

The command never downloads source material.  Obtain and review the official
source separately, then pin its SHA-256 explicitly.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from app.admin_importer import AdministrativeImportError, import_administrative_json
from app.db import SessionLocal


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description="Import reviewed Algerian administrative reference data")
    result.add_argument("file", type=Path)
    result.add_argument("--sha256", required=True, help="Expected SHA-256 of the exact source file")
    result.add_argument("--verified", action="store_true", help="Allow source metadata to be marked verified")
    result.add_argument(
        "--complete-2026",
        action="store_true",
        help="Require a verified 2026 dataset with exactly 69 wilayas and 1541 communes",
    )
    return result


def main() -> None:
    args = parser().parse_args()
    raw = args.file.read_bytes()
    with SessionLocal() as db:
        try:
            version = import_administrative_json(
                db,
                raw,
                expected_sha256=args.sha256,
                allow_verified=args.verified,
                require_complete_2026=args.complete_2026,
            )
            db.commit()
        except AdministrativeImportError:
            db.rollback()
            raise
        print(
            f"Imported administrative version {version.code} "
            f"(verified={version.verified}, source_sha256={version.source_sha256})"
        )


if __name__ == "__main__":
    main()
