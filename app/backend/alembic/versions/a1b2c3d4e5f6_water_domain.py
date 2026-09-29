"""water domain (Contract §4 — Phase 1)

Revision ID: a1b2c3d4e5f6
Revises: 6954b62149be
Create Date: 2026-09-29

كيانات نطاق المياه: wells, reservoirs, pumps, vfds, irrigation_zones,
valves, water_allocations — بعزل المستأجر وقيود سلامة علائقية (القاعدة 8)
وأنماط محمولة تعمل على PostgreSQL وSQLite معًا (القاعدة 9).
"""
from alembic import op
import sqlalchemy as sa

revision = 'a1b2c3d4e5f6'
down_revision = '6954b62149be'
branch_labels = None
depends_on = None

_ID = sa.BigInteger().with_variant(sa.Integer(), 'sqlite')
_NOW = sa.text('CURRENT_TIMESTAMP')


def upgrade() -> None:
    op.create_table(
        'wells',
        sa.Column('id', _ID, nullable=False),
        sa.Column('org_id', sa.BigInteger(), nullable=False),
        sa.Column('site_id', sa.BigInteger(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('depth_m', sa.Numeric(precision=8, scale=2), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('is_demo', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=_NOW, nullable=False),
        sa.ForeignKeyConstraint(['org_id'], ['organizations.id']),
        sa.ForeignKeyConstraint(['site_id'], ['sites.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_wells_org_id'), 'wells', ['org_id'], unique=False)
    op.create_index(op.f('ix_wells_site_id'), 'wells', ['site_id'], unique=False)

    op.create_table(
        'reservoirs',
        sa.Column('id', _ID, nullable=False),
        sa.Column('org_id', sa.BigInteger(), nullable=False),
        sa.Column('site_id', sa.BigInteger(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('capacity_m3', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('min_level_m', sa.Numeric(precision=8, scale=2), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('is_demo', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=_NOW, nullable=False),
        sa.ForeignKeyConstraint(['org_id'], ['organizations.id']),
        sa.ForeignKeyConstraint(['site_id'], ['sites.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_reservoirs_org_id'), 'reservoirs', ['org_id'], unique=False)
    op.create_index(op.f('ix_reservoirs_site_id'), 'reservoirs', ['site_id'], unique=False)

    op.create_table(
        'pumps',
        sa.Column('id', _ID, nullable=False),
        sa.Column('org_id', sa.BigInteger(), nullable=False),
        sa.Column('site_id', sa.BigInteger(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('well_id', sa.BigInteger(), nullable=True),
        sa.Column('reservoir_id', sa.BigInteger(), nullable=True),
        sa.Column('rated_power_kw', sa.Numeric(precision=8, scale=2), nullable=True),
        sa.Column('rated_flow_l_s', sa.Numeric(precision=8, scale=2), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('is_demo', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=_NOW, nullable=False),
        sa.CheckConstraint('(well_id IS NULL) <> (reservoir_id IS NULL)', name='ck_pump_exactly_one_source'),
        sa.ForeignKeyConstraint(['org_id'], ['organizations.id']),
        sa.ForeignKeyConstraint(['site_id'], ['sites.id']),
        sa.ForeignKeyConstraint(['well_id'], ['wells.id']),
        sa.ForeignKeyConstraint(['reservoir_id'], ['reservoirs.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_pumps_org_id'), 'pumps', ['org_id'], unique=False)
    op.create_index(op.f('ix_pumps_site_id'), 'pumps', ['site_id'], unique=False)

    op.create_table(
        'vfds',
        sa.Column('id', _ID, nullable=False),
        sa.Column('org_id', sa.BigInteger(), nullable=False),
        sa.Column('pump_id', sa.BigInteger(), nullable=False),
        sa.Column('model', sa.String(length=255), nullable=False),
        sa.Column('max_frequency_hz', sa.Numeric(precision=5, scale=1), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('is_demo', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=_NOW, nullable=False),
        sa.ForeignKeyConstraint(['org_id'], ['organizations.id']),
        sa.ForeignKeyConstraint(['pump_id'], ['pumps.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_vfds_org_id'), 'vfds', ['org_id'], unique=False)
    op.create_index(op.f('ix_vfds_pump_id'), 'vfds', ['pump_id'], unique=False)

    op.create_table(
        'irrigation_zones',
        sa.Column('id', _ID, nullable=False),
        sa.Column('org_id', sa.BigInteger(), nullable=False),
        sa.Column('site_id', sa.BigInteger(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('area_ha', sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column('soil_type', sa.String(length=100), nullable=True),
        sa.Column('crop_hint', sa.String(length=100), nullable=True),
        sa.Column('is_demo', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=_NOW, nullable=False),
        sa.ForeignKeyConstraint(['org_id'], ['organizations.id']),
        sa.ForeignKeyConstraint(['site_id'], ['sites.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_irrigation_zones_org_id'), 'irrigation_zones', ['org_id'], unique=False)
    op.create_index(op.f('ix_irrigation_zones_site_id'), 'irrigation_zones', ['site_id'], unique=False)

    op.create_table(
        'valves',
        sa.Column('id', _ID, nullable=False),
        sa.Column('org_id', sa.BigInteger(), nullable=False),
        sa.Column('site_id', sa.BigInteger(), nullable=False),
        sa.Column('zone_id', sa.BigInteger(), nullable=True),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('diameter_mm', sa.Numeric(precision=6, scale=1), nullable=True),
        sa.Column('normally_open', sa.Boolean(), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('is_demo', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=_NOW, nullable=False),
        sa.ForeignKeyConstraint(['org_id'], ['organizations.id']),
        sa.ForeignKeyConstraint(['site_id'], ['sites.id']),
        sa.ForeignKeyConstraint(['zone_id'], ['irrigation_zones.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_valves_org_id'), 'valves', ['org_id'], unique=False)
    op.create_index(op.f('ix_valves_site_id'), 'valves', ['site_id'], unique=False)

    op.create_table(
        'water_allocations',
        sa.Column('id', _ID, nullable=False),
        sa.Column('org_id', sa.BigInteger(), nullable=False),
        sa.Column('zone_id', sa.BigInteger(), nullable=False),
        sa.Column('well_id', sa.BigInteger(), nullable=True),
        sa.Column('reservoir_id', sa.BigInteger(), nullable=True),
        sa.Column('volume_m3', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('period_start', sa.DateTime(timezone=True), nullable=False),
        sa.Column('period_end', sa.DateTime(timezone=True), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('created_by', sa.BigInteger(), nullable=False),
        sa.Column('decided_by', sa.BigInteger(), nullable=True),
        sa.Column('decided_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('is_demo', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=_NOW, nullable=False),
        sa.CheckConstraint('volume_m3 > 0', name='ck_allocation_volume_positive'),
        sa.CheckConstraint('period_end > period_start', name='ck_allocation_period_order'),
        sa.CheckConstraint('(well_id IS NULL) <> (reservoir_id IS NULL)', name='ck_allocation_exactly_one_source'),
        sa.ForeignKeyConstraint(['org_id'], ['organizations.id']),
        sa.ForeignKeyConstraint(['zone_id'], ['irrigation_zones.id']),
        sa.ForeignKeyConstraint(['well_id'], ['wells.id']),
        sa.ForeignKeyConstraint(['reservoir_id'], ['reservoirs.id']),
        sa.ForeignKeyConstraint(['created_by'], ['users.id']),
        sa.ForeignKeyConstraint(['decided_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_water_allocations_org_id'), 'water_allocations', ['org_id'], unique=False)
    op.create_index(op.f('ix_water_allocations_zone_id'), 'water_allocations', ['zone_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_water_allocations_zone_id'), table_name='water_allocations')
    op.drop_index(op.f('ix_water_allocations_org_id'), table_name='water_allocations')
    op.drop_table('water_allocations')
    op.drop_index(op.f('ix_valves_site_id'), table_name='valves')
    op.drop_index(op.f('ix_valves_org_id'), table_name='valves')
    op.drop_table('valves')
    op.drop_index(op.f('ix_irrigation_zones_site_id'), table_name='irrigation_zones')
    op.drop_index(op.f('ix_irrigation_zones_org_id'), table_name='irrigation_zones')
    op.drop_table('irrigation_zones')
    op.drop_index(op.f('ix_vfds_pump_id'), table_name='vfds')
    op.drop_index(op.f('ix_vfds_org_id'), table_name='vfds')
    op.drop_table('vfds')
    op.drop_index(op.f('ix_pumps_site_id'), table_name='pumps')
    op.drop_index(op.f('ix_pumps_org_id'), table_name='pumps')
    op.drop_table('pumps')
    op.drop_index(op.f('ix_reservoirs_site_id'), table_name='reservoirs')
    op.drop_index(op.f('ix_reservoirs_org_id'), table_name='reservoirs')
    op.drop_table('reservoirs')
    op.drop_index(op.f('ix_wells_site_id'), table_name='wells')
    op.drop_index(op.f('ix_wells_org_id'), table_name='wells')
    op.drop_table('wells')
