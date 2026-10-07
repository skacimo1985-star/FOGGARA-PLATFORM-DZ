"""Initialize authored production references after migrations.

This script never creates organizations, users, measurements, telemetry,
satellite observations, or other synthetic business data.
"""
from app.db import SessionLocal
from app.services.reference_data import ensure_reference_data


def main() -> None:
    db = SessionLocal()
    try:
        created = ensure_reference_data(db)
        db.commit()
        print(
            "Production references ensured "
            f"(services_created={created['services']}, "
            f"indicators_created={created['indicators']})."
        )
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
