"""Tests for the 58-wilaya national directory and seed idempotency.

Verifies:
- Exactly 58 wilayas in the directory
- Codes 01-58 are unique
- Wilaya names are unique (ar, fr, en)
- Seed produces no duplicate organizations/sites/projects
- Seed is idempotent (running twice creates 0 new rows)
- Existing Adrar/Tindouf demo records remain compatible
- Organization isolation remains intact
"""
import pytest
import os

from app.wilayas import WILAYAS
from app.models import Organization, Site, Project
from sqlalchemy import select, func, text


class TestWilayaDirectory:
    """Validate the static 58-wilaya reference list."""

    def test_exactly_58_wilayas(self):
        assert len(WILAYAS) == 58, f"Expected 58 wilayas, got {len(WILAYAS)}"

    def test_codes_are_unique(self):
        codes = [w["code"] for w in WILAYAS]
        assert len(codes) == len(set(codes)), "Duplicate wilaya codes found"

    def test_codes_are_01_to_58(self):
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


class TestSeedIdempotency:
    """Validate that seed.py is idempotent and covers all 58 wilayas."""

    def test_seed_creates_no_duplicates_on_rerun(self, db):
        """Run seed twice; second run should create 0 new rows."""
        os.environ["SEED_DEMO"] = "true"
        os.environ["ENV"] = "dev"

        import seed as seed_module
        seed_module.main()

        orgs_after_first = db.execute(select(func.count(Organization.id))).scalar()
        sites_after_first = db.execute(select(func.count(Site.id))).scalar()
        projects_after_first = db.execute(select(func.count(Project.id))).scalar()

        seed_module.main()

        orgs_after_second = db.execute(select(func.count(Organization.id))).scalar()
        sites_after_second = db.execute(select(func.count(Site.id))).scalar()
        projects_after_second = db.execute(select(func.count(Project.id))).scalar()

        assert orgs_after_first == orgs_after_second, \
            f"Organizations duplicated: {orgs_after_first} -> {orgs_after_second}"
        assert sites_after_first == sites_after_second, \
            f"Sites duplicated: {sites_after_first} -> {sites_after_second}"
        assert projects_after_first == projects_after_second, \
            f"Projects duplicated: {projects_after_first} -> {projects_after_second}"

    def test_seed_covers_all_58_wilayas(self, db):
        """After seeding, all 58 wilaya names should appear in sites."""
        os.environ["SEED_DEMO"] = "true"
        os.environ["ENV"] = "dev"

        import seed as seed_module
        seed_module.main()

        wilaya_names_in_sites = db.execute(
            select(Site.wilaya).distinct()
        ).scalars().all()

        for w in WILAYAS:
            assert w["ar"] in wilaya_names_in_sites, \
                f"Wilaya {w['en']} ({w['ar']}) has no site after seeding"

    def test_adrar_tindouf_demo_records_preserved(self, db):
        """Original Adrar and Tindouf demo orgs/sites remain after re-seed."""
        os.environ["SEED_DEMO"] = "true"
        os.environ["ENV"] = "dev"

        import seed as seed_module
        seed_module.main()

        adrar_org = db.execute(
            select(Organization).where(Organization.code == "DEMO-ADRAR-ADE")
        ).scalar_one_or_none()
        assert adrar_org is not None, "Original Adrar demo org missing"

        tindouf_org = db.execute(
            select(Organization).where(Organization.code == "DEMO-TND-AGRI")
        ).scalar_one_or_none()
        assert tindouf_org is not None, "Original Tindouf demo org missing"

    def test_organization_isolation(self, db):
        """Each demo org has its own sites; no cross-org site sharing."""
        os.environ["SEED_DEMO"] = "true"
        os.environ["ENV"] = "dev"

        import seed as seed_module
        seed_module.main()

        orgs = db.execute(
            select(Organization).where(Organization.is_demo == True)
        ).scalars().all()

        for org in orgs:
            org_sites = db.execute(
                select(Site).where(Site.org_id == org.id)
            ).scalars().all()
            for site in org_sites:
                assert site.org_id == org.id, \
                    f"Site {site.name} belongs to org {site.org_id} but expected {org.id}"

    def test_all_demo_data_is_flagged(self, db):
        """All seeded rows must have is_demo=True."""
        os.environ["SEED_DEMO"] = "true"
        os.environ["ENV"] = "dev"

        import seed as seed_module
        seed_module.main()

        non_demo_orgs = db.execute(
            select(func.count(Organization.id)).where(Organization.is_demo == False)
        ).scalar()
        assert non_demo_orgs == 0, f"{non_demo_orgs} non-demo organizations found in seed"

        non_demo_sites = db.execute(
            select(func.count(Site.id)).where(Site.is_demo == False)
        ).scalar()
        assert non_demo_sites == 0, f"{non_demo_sites} non-demo sites found in seed"

    def test_no_duplicate_org_codes(self, db):
        """No two organizations share the same code."""
        os.environ["SEED_DEMO"] = "true"
        os.environ["ENV"] = "dev"

        import seed as seed_module
        seed_module.main()

        duplicates = db.execute(text(
            "SELECT code, COUNT(*) FROM organizations GROUP BY code HAVING COUNT(*) > 1"
        )).fetchall()
        assert len(duplicates) == 0, f"Duplicate org codes: {duplicates}"
