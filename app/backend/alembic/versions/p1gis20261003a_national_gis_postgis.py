"""P1 national GIS core: administrative hierarchy and PostGIS site geometry."""

from alembic import op
import sqlalchemy as sa

revision = "p1gis20261003a"
down_revision = "int20261003s1"
branch_labels = None
depends_on = None


def _is_postgres(bind):
    return bind.dialect.name == "postgresql"


def upgrade():
    bind = op.get_bind()

    op.create_table(
        "administrative_versions",
        sa.Column("id", sa.BigInteger().with_variant(sa.Integer(), "sqlite"), primary_key=True),
        sa.Column("code", sa.String(50), nullable=False, unique=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("valid_from", sa.Date(), nullable=False),
        sa.Column("valid_to", sa.Date(), nullable=True),
        sa.Column("source_title", sa.String(255), nullable=False),
        sa.Column("source_uri", sa.Text(), nullable=False),
        sa.Column("source_date", sa.Date(), nullable=False),
        sa.Column("verified", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_table(
        "wilayas",
        sa.Column("id", sa.BigInteger().with_variant(sa.Integer(), "sqlite"), primary_key=True),
        sa.Column("version_id", sa.BigInteger().with_variant(sa.Integer(), "sqlite"), sa.ForeignKey("administrative_versions.id"), nullable=False),
        sa.Column("official_code", sa.String(20), nullable=False),
        sa.Column("name_ar", sa.String(150), nullable=False),
        sa.Column("name_fr", sa.String(150), nullable=False),
        sa.Column("name_en", sa.String(150), nullable=False),
        sa.Column("source_uri", sa.Text(), nullable=False),
        sa.Column("verified", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.UniqueConstraint("version_id", "official_code", name="uq_wilaya_version_code"),
    )
    op.create_index("ix_wilayas_version_id", "wilayas", ["version_id"])
    op.create_index("ix_wilayas_official_code", "wilayas", ["official_code"])

    op.create_table(
        "dairas",
        sa.Column("id", sa.BigInteger().with_variant(sa.Integer(), "sqlite"), primary_key=True),
        sa.Column("version_id", sa.BigInteger().with_variant(sa.Integer(), "sqlite"), sa.ForeignKey("administrative_versions.id"), nullable=False),
        sa.Column("wilaya_id", sa.BigInteger().with_variant(sa.Integer(), "sqlite"), sa.ForeignKey("wilayas.id"), nullable=False),
        sa.Column("official_code", sa.String(30), nullable=True),
        sa.Column("name_ar", sa.String(150), nullable=False),
        sa.Column("name_fr", sa.String(150), nullable=False),
        sa.Column("name_en", sa.String(150), nullable=False),
        sa.Column("source_uri", sa.Text(), nullable=False),
        sa.Column("verified", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_index("ix_dairas_version_id", "dairas", ["version_id"])
    op.create_index("ix_dairas_wilaya_id", "dairas", ["wilaya_id"])
    op.create_index("ix_dairas_official_code", "dairas", ["official_code"])

    op.create_table(
        "communes",
        sa.Column("id", sa.BigInteger().with_variant(sa.Integer(), "sqlite"), primary_key=True),
        sa.Column("version_id", sa.BigInteger().with_variant(sa.Integer(), "sqlite"), sa.ForeignKey("administrative_versions.id"), nullable=False),
        sa.Column("wilaya_id", sa.BigInteger().with_variant(sa.Integer(), "sqlite"), sa.ForeignKey("wilayas.id"), nullable=False),
        sa.Column("daira_id", sa.BigInteger().with_variant(sa.Integer(), "sqlite"), sa.ForeignKey("dairas.id"), nullable=True),
        sa.Column("official_code", sa.String(30), nullable=False),
        sa.Column("name_ar", sa.String(150), nullable=False),
        sa.Column("name_fr", sa.String(150), nullable=False),
        sa.Column("name_en", sa.String(150), nullable=False),
        sa.Column("source_uri", sa.Text(), nullable=False),
        sa.Column("verified", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.UniqueConstraint("version_id", "official_code", name="uq_commune_version_code"),
    )
    op.create_index("ix_communes_version_id", "communes", ["version_id"])
    op.create_index("ix_communes_wilaya_id", "communes", ["wilaya_id"])
    op.create_index("ix_communes_daira_id", "communes", ["daira_id"])
    op.create_index("ix_communes_official_code", "communes", ["official_code"])

    op.add_column("sites", sa.Column("wilaya_id", sa.BigInteger().with_variant(sa.Integer(), "sqlite"), nullable=True))
    op.add_column("sites", sa.Column("daira_id", sa.BigInteger().with_variant(sa.Integer(), "sqlite"), nullable=True))
    op.add_column("sites", sa.Column("commune_id", sa.BigInteger().with_variant(sa.Integer(), "sqlite"), nullable=True))
    op.create_index("ix_sites_wilaya_id", "sites", ["wilaya_id"])
    op.create_index("ix_sites_daira_id", "sites", ["daira_id"])
    op.create_index("ix_sites_commune_id", "sites", ["commune_id"])

    if not _is_postgres(bind):
        return

    op.execute(sa.text("CREATE EXTENSION IF NOT EXISTS postgis"))
    op.execute(sa.text("ALTER TABLE wilayas ADD COLUMN geom geometry(MultiPolygon,4326)"))
    op.execute(sa.text("ALTER TABLE dairas ADD COLUMN geom geometry(MultiPolygon,4326)"))
    op.execute(sa.text("ALTER TABLE communes ADD COLUMN geom geometry(MultiPolygon,4326)"))
    op.execute(sa.text("ALTER TABLE sites ADD COLUMN geom geometry(Point,4326)"))

    op.execute(sa.text("CREATE INDEX ix_wilayas_geom_gist ON wilayas USING GIST (geom)"))
    op.execute(sa.text("CREATE INDEX ix_dairas_geom_gist ON dairas USING GIST (geom)"))
    op.execute(sa.text("CREATE INDEX ix_communes_geom_gist ON communes USING GIST (geom)"))
    op.execute(sa.text("CREATE INDEX ix_sites_geom_gist ON sites USING GIST (geom)"))

    op.execute(sa.text("""
        ALTER TABLE sites
          ADD CONSTRAINT fk_sites_wilaya_id FOREIGN KEY (wilaya_id) REFERENCES wilayas(id),
          ADD CONSTRAINT fk_sites_daira_id FOREIGN KEY (daira_id) REFERENCES dairas(id),
          ADD CONSTRAINT fk_sites_commune_id FOREIGN KEY (commune_id) REFERENCES communes(id)
    """))
    op.execute(sa.text("""
        UPDATE sites
        SET geom = ST_SetSRID(ST_MakePoint(lon::double precision, lat::double precision), 4326)
        WHERE lon IS NOT NULL AND lat IS NOT NULL
    """))
    op.execute(sa.text("""
        CREATE OR REPLACE FUNCTION foggara_sync_site_geom() RETURNS trigger AS $$
        BEGIN
          IF NEW.lon IS NULL OR NEW.lat IS NULL THEN
            NEW.geom := NULL;
          ELSE
            NEW.geom := ST_SetSRID(ST_MakePoint(NEW.lon::double precision, NEW.lat::double precision), 4326);
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
    """))
    op.execute(sa.text("""
        CREATE TRIGGER trg_sites_sync_geom
        BEFORE INSERT OR UPDATE OF lon, lat ON sites
        FOR EACH ROW EXECUTE FUNCTION foggara_sync_site_geom()
    """))

    quote = bind.dialect.identifier_preparer.quote
    roles = [
        role for role in ("anon", "authenticated", "service_role")
        if bind.execute(sa.text("SELECT 1 FROM pg_roles WHERE rolname = :role"), {"role": role}).scalar()
    ]
    for name in ("administrative_versions", "wilayas", "dairas", "communes"):
        op.execute(sa.text("ALTER TABLE public." + quote(name) + " ENABLE ROW LEVEL SECURITY"))
        op.execute(sa.text("REVOKE ALL ON TABLE public." + quote(name) + " FROM PUBLIC"))
        for role in roles:
            op.execute(sa.text("REVOKE ALL ON TABLE public." + quote(name) + " FROM " + quote(role)))


def downgrade():
    bind = op.get_bind()
    if _is_postgres(bind):
        op.execute(sa.text("DROP TRIGGER IF EXISTS trg_sites_sync_geom ON sites"))
        op.execute(sa.text("DROP FUNCTION IF EXISTS foggara_sync_site_geom()"))
        op.execute(sa.text("ALTER TABLE sites DROP CONSTRAINT IF EXISTS fk_sites_commune_id"))
        op.execute(sa.text("ALTER TABLE sites DROP CONSTRAINT IF EXISTS fk_sites_daira_id"))
        op.execute(sa.text("ALTER TABLE sites DROP CONSTRAINT IF EXISTS fk_sites_wilaya_id"))
        op.execute(sa.text("DROP INDEX IF EXISTS ix_sites_geom_gist"))
        op.execute(sa.text("ALTER TABLE sites DROP COLUMN IF EXISTS geom"))

    op.drop_index("ix_sites_commune_id", table_name="sites")
    op.drop_index("ix_sites_daira_id", table_name="sites")
    op.drop_index("ix_sites_wilaya_id", table_name="sites")
    op.drop_column("sites", "commune_id")
    op.drop_column("sites", "daira_id")
    op.drop_column("sites", "wilaya_id")

    if _is_postgres(bind):
        op.execute(sa.text("DROP INDEX IF EXISTS ix_communes_geom_gist"))
        op.execute(sa.text("DROP INDEX IF EXISTS ix_dairas_geom_gist"))
        op.execute(sa.text("DROP INDEX IF EXISTS ix_wilayas_geom_gist"))

    op.drop_table("communes")
    op.drop_table("dairas")
    op.drop_table("wilayas")
    op.drop_table("administrative_versions")
