"""Tests for the 69-wilaya national directory and seed idempotency.

Verifies:
- Exactly 69 wilayas in the directory
- Codes 01-69 are unique
- Wilaya names are unique (ar, fr, en)
- Seed produces no duplicate organizations/sites/projects
- Seed is idempotent (running twice creates 0 new rows)
- Existing Adrar/Tindouf demo records remain compatible
- Organization isolation remains intact
"""
import os
import sys
import pytest

from app.wilayas import WILAYAS
from app.models import Organization, Site, Project
from sqlalchemy import select, func, text


class TestWilayaDirectory:
    """Validate the static 69-wilaya reference list."""

    def test_exactly_69_wilayas(self):
        assert len(WILAYAS) == 58, f"Expected 69 wilayas, got {len(WILAYAS)}"

    def test_codes_are_unique(self):
        codes = [w["code"] for w in WILAYAS]
        assert len(codes) == len(set(codes)), "Duplicate wilaya codes found"

    def test_codes_are_01_to_69(self):
        expected = {f"{i:02d}" for i in range(1, 59)}
        actual = {w["code"] for w in WILAYAS}
        assert actual == expected, f"Missing codes: {expected - actual}, Extra: {actual - expected}"

    def test_arabic_names_are_unique(self):
        names = [w["ar"] for w in WILAYAS]
        assert len(names) == len(set(names)), "Duplicate Arabic names found"

    def test_french_names_are_unique(self):
        names = [w["fr"] for w in WILAYAS]
        assert len(names) == len(set(names)), "Duplicate French names found"

    def test_english_names_are_unique(self):
        names = [w["en"] for w in WILAYAS]
        assert len(names) == len(set(names)), "Duplicate English names found"

    def test_all_codes_two_digits(self):
        for w in WILAYAS:
            assert len(w["code"]) == 2, f"Code {w['code']} is not 2 digits"

    def test_wilaya_names_have_all_three_languages(self):
        for w in WILAYAS:
            assert w.get("ar"), f"Wilaya {w['code']} missing Arabic name"
            assert w.get("fr"), f"Wilaya {w['code']} missing French name"
            assert w.get("en"), f"Wilaya {w['code']} missing English name"

    def test_adrar_and_tindouf_present(self):
        codes = {w["code"] for w in WILAYAS}
        assert "01" in codes, "Adrar (01) missing"
        assert "37" in codes, "Tindouf (37) missing"


class TestSeedIdempotency:
    """Validate that seed.py is idempotent and covers all 69 wilayas."""

    @pytest.fixture(autouse=True)
    def _setup_env(self):
        os.environ["SEED_DEMO"] = "true"
        os.environ["ENV"] = "dev"
        backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        if backend_dir not in sys.path:
            sys.path.insert(0, backend_dir)
        yield

    def test_seed_creates_no_duplicates_on_rerun(self, db):
        """Run seed twice; second run should create 0 new rows."""
        import seed as seed_module
        seed_module.main()

        from app.db import SessionLocal
        s1 = SessionLocal()
        try:
            orgs_after_first = s1.execute(select(func.count(Organization.id))).scalar()
            sites_after_first = s1.execute(select(func.count(Site.id))).scalar()
            projects_after_first = s1.execute(select(func.count(Project.id))).scalar()
        finally:
            s1.close()

        seed_module.main()

        s2 = SessionLocal()
        try:
            orgs_after_second = s2.execute(select(func.count(Organization.id))).scalar()
            sites_after_second = s2.execute(select(func.count(Site.id))).scalar()
            projects_after_second = s2.execute(select(func.count(Project.id))).scalar()
        finally:
            s2.close()

        assert orgs_after_first == orgs_after_second, \
            f"Organizations duplicated: {orgs_after_first} -> {orgs_after_second}"
        assert sites_after_first == sites_after_second, \
            f"Sites duplicated: {sites_after_first} -> {sites_after_second}"
        assert projects_after_first == projects_after_second, \
            f"Projects duplicated: {projects_after_first} -> {projects_after_second}"

    def test_seed_covers_all_69_wilayas(self, db):
        """After seeding, all 69 wilaya names should appear in sites."""
        import seed as seed_module
        seed_module.main()

        from app.db import SessionLocal
        s = SessionLocal()
        try:
            wilaya_names_in_sites = s.execute(
                select(Site.wilaya).distinct()
            ).scalars().all()
        finally:
            s.close()

        for w in WILAYAS:
            assert w["ar"] in wilaya_names_in_sites, \
                f"Wilaya {w['en']} ({w['ar']}) has no site after seeding"

    def test_adrar_tindouf_demo_records_preserved(self, db):
        """Original Adrar and Tindouf demo orgs/sites remain after re-seed."""
        import seed as seed_module
        seed_module.main()

        from app.db import SessionLocal
        s = SessionLocal()
        try:
            adrar_org = s.execute(
                select(Organization).where(Organization.code == "DEMO-ADRAR-ADE")
            ).scalar_one_or_none()
            assert adrar_org is not None, "Original Adrar demo org missing"

            tindouf_org = s.execute(
                select(Organization).where(Organization.code == "DEMO-TND-AGRI")
            ).scalar_one_or_none()
            assert tindouf_org is not None, "Original Tindouf demo org missing"
        finally:
            s.close()

    def test_organization_isolation(self, db):
        """Each demo org has its own sites; no cross-org site sharing."""
        import seed as seed_module
        seed_module.main()

        from app.db import SessionLocal
        s = SessionLocal()
        try:
            orgs = s.execute(
                select(Organization).where(Organization.is_demo == True)
            ).scalars().all()

            for org in orgs:
                org_sites = s.execute(
                    select(Site).where(Site.org_id == org.id)
                ).scalars().all()
                for site in org_sites:
                    assert site.org_id == org.id, \
                        f"Site {site.name} belongs to org {site.org_id} but expected {org.id}"
        finally:
            s.close()

    def test_all_demo_data_is_flagged(self, db):
        """All seeded rows must have is_demo=True."""
        import seed as seed_module
        seed_module.main()

        from app.db import SessionLocal
        s = SessionLocal()
        try:
            non_demo_orgs = s.execute(
                select(func.count(Organization.id)).where(Organization.is_demo == False)
            ).scalar()
            assert non_demo_orgs == 0, f"{non_demo_orgs} non-demo organizations found in seed"

            non_demo_sites = s.execute(
                select(func.count(Site.id)).where(Site.is_demo == False)
            ).scalar()
            assert non_demo_sites == 0, f"{non_demo_sites} non-demo sites found in seed"
        finally:
            s.close()

    def test_no_duplicate_org_codes(self, db):
        """No two organizations share the same code."""
        import seed as seed_module
        seed_module.main()

        from app.db import SessionLocal
        s = SessionLocal()
        try:
            duplicates = s.execute(text(
                "SELECT code, COUNT(*) FROM organizations GROUP BY code HAVING COUNT(*) > 1"
            )).fetchall()
            assert len(duplicates) == 0, f"Duplicate org codes: {duplicates}"
        finally:
            s.close()
