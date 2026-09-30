"""Initialize the technical indicator catalog only; never create business records."""
from app.db import SessionLocal
from app.services.indicators import ensure_default_indicator

if __name__ == "__main__":
    with SessionLocal() as db:
        ensure_default_indicator(db)
        db.commit()
    print("Technical catalog initialized. Register your organization through /register.")
