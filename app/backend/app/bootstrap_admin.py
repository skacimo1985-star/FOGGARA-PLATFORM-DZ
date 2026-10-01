"""One-time admin provisioning via interactive input; no credentials on disk/argv.
Run in the authenticated server console: python -m app.bootstrap_admin.
Existing accounts are never changed. Does not seed demo data or send email.
"""
from getpass import getpass
from sqlalchemy import select
from .db import SessionLocal
from .models import Organization, User
from .security import hash_password
from .audit import audit

def main():
    email = input('Administrator email: ').strip().lower()
    if '@' not in email or len(email) > 255:
        raise SystemExit('Invalid email')
    password = getpass('Password (at least 16 characters): ')
    if len(password) < 16 or password != getpass('Confirm password: '):
        raise SystemExit('Invalid or mismatched password')
    with SessionLocal.begin() as db:
        if db.scalar(select(User).where(User.email == email)):
            raise SystemExit('Account already exists; no changes made')
        org = db.scalar(select(Organization).where(Organization.code == 'SIREP'))
        if org is None:
            org = Organization(code='SIREP', name_ar='SIREP Oasis Nexus WEFEH',
                name_fr='SIREP Oasis Nexus WEFEH', name_en='SIREP Oasis Nexus WEFEH', is_demo=False)
            db.add(org)
            db.flush()
        user = User(org_id=org.id, email=email, full_name='SIREP Administrator',
                    password_hash=hash_password(password), role='admin', locale='ar')
        db.add(user)
        db.flush()
        audit(db, user, 'bootstrap_admin', 'user', entity_id=user.id)
    print('Administrator created. No demo records were added.')

if __name__ == '__main__':
    main()
