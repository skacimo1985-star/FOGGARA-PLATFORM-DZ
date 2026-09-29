"""deterministic telemetry + IoT simulator (Phase 03)

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-09-29

أجهزة ومستشعرات منطقية + قراءات قياس عن بُعد + تشغيلات محاكاة + قواعد.
أنماط محمولة تعمل على PostgreSQL وSQLite معًا. لا تحكم بأي معدات.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'c3d4e5f6a7b8'
down_revision = 'b2c3d4e5f6a7'
branch_labels = None
depends_on = None

_ID = sa.BigInteger().with_variant(sa.Integer(), 'sqlite')
_JSON = sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql')
_NOW = sa.text('CURRENT_TIMESTAMP')

_DEVICE_TYPES = ("'well_controller','pump_controller','reservoir_monitor',"
                 "'irrigation_controller','energy_meter','environmental_station',"
                 "'generic_sensor_node'")
_SENSOR_TYPES = ("'water_level','flow_rate','pressure','temperature','pump_state',"
                 "'valve_state','energy','voltage','current','frequency'")
_SCENARIOS = "'NORMAL','HIGH_DEMAND','LOW_WATER','PRESSURE_ANOMALY','SENSOR_FAILURE','ENERGY_ANOMALY'"
_RUN_STATUSES = "'CREATED','RUNNING','COMPLETED','FAILED','CANCELLED'"
_DOMAINS = "'water','energy','food','ecosystem','health','cross_domain'"


def upgrade() -> None:
    op.create_table(
        'devices',
        sa.Column('id', _ID, nullable=False),
        sa.Column('org_id', sa.BigInteger(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('device_type', sa.String(length=40), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('subject_type', sa.String(length=50), nullable=True),
        sa.Column('subject_id', sa.BigInteger(), nullable=True),
        sa.Column('protocol', sa.String(length=20), nullable=False),
        sa.Column('configuration', _JSON, nullable=False),
        sa.Column('is_simulated', sa.Boolean(), nullable=False),
        sa.Column('is_demo', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=_NOW, nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=_NOW, nullable=False),
        sa.CheckConstraint(f"device_type IN ({_DEVICE_TYPES})", name='ck_device_type'),
        sa.CheckConstraint("status IN ('active','inactive','maintenance','decommissioned')",
                           name='ck_device_status'),
        sa.ForeignKeyConstraint(['org_id'], ['organizations.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_devices_org_id', 'devices', ['org_id'])

    op.create_table(
        'sensors',
        sa.Column('id', _ID, nullable=False),
        sa.Column('org_id', sa.BigInteger(), nullable=False),
        sa.Column('device_id', sa.BigInteger(), nullable=False),
        sa.Column('subject_type', sa.String(length=50), nullable=True),
        sa.Column('subject_id', sa.BigInteger(), nullable=True),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('sensor_type', sa.String(length=30), nullable=False),
        sa.Column('metric', sa.String(length=50), nullable=False),
        sa.Column('unit', sa.String(length=10), nullable=False),
        sa.Column('min_value', sa.Numeric(precision=18, scale=4), nullable=True),
        sa.Column('max_value', sa.Numeric(precision=18, scale=4), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('configuration', _JSON, nullable=False),
        sa.Column('is_simulated', sa.Boolean(), nullable=False),
        sa.Column('is_demo', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=_NOW, nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=_NOW, nullable=False),
        sa.CheckConstraint(f"sensor_type IN ({_SENSOR_TYPES})", name='ck_sensor_type'),
        sa.CheckConstraint("max_value IS NULL OR min_value IS NULL OR max_value > min_value",
                           name='ck_sensor_range_order'),
        sa.ForeignKeyConstraint(['org_id'], ['organizations.id']),
        sa.ForeignKeyConstraint(['device_id'], ['devices.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_sensors_org_id', 'sensors', ['org_id'])
    op.create_index('ix_sensors_device_id', 'sensors', ['device_id'])
    op.create_index('ix_sensors_metric', 'sensors', ['metric'])

    op.create_table(
        'simulation_runs',
        sa.Column('id', _ID, nullable=False),
        sa.Column('org_id', sa.BigInteger(), nullable=False),
        sa.Column('device_id', sa.BigInteger(), nullable=False),
        sa.Column('scenario', sa.String(length=30), nullable=False),
        sa.Column('seed', sa.BigInteger(), nullable=False),
        sa.Column('steps', sa.Integer(), nullable=False),
        sa.Column('step_seconds', sa.Integer(), nullable=False),
        sa.Column('start_time', sa.DateTime(timezone=True), nullable=False),
        sa.Column('end_time', sa.DateTime(timezone=True), nullable=True),
        sa.Column('status', sa.String(length=15), nullable=False),
        sa.Column('generated_count', sa.Integer(), nullable=False),
        sa.Column('created_by', sa.BigInteger(), nullable=False),
        sa.Column('configuration', _JSON, nullable=False),
        sa.Column('is_demo', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=_NOW, nullable=False),
        sa.CheckConstraint(f"scenario IN ({_SCENARIOS})", name='ck_simrun_scenario'),
        sa.CheckConstraint(f"status IN ({_RUN_STATUSES})", name='ck_simrun_status'),
        sa.CheckConstraint("steps > 0", name='ck_simrun_steps_positive'),
        sa.CheckConstraint("step_seconds > 0", name='ck_simrun_step_seconds_positive'),
        sa.ForeignKeyConstraint(['org_id'], ['organizations.id']),
        sa.ForeignKeyConstraint(['device_id'], ['devices.id']),
        sa.ForeignKeyConstraint(['created_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_simulation_runs_org_id', 'simulation_runs', ['org_id'])
    op.create_index('ix_simulation_runs_device_id', 'simulation_runs', ['device_id'])

    op.create_table(
        'telemetry_readings',
        sa.Column('id', _ID, nullable=False),
        sa.Column('org_id', sa.BigInteger(), nullable=False),
        sa.Column('device_id', sa.BigInteger(), nullable=False),
        sa.Column('sensor_id', sa.BigInteger(), nullable=False),
        sa.Column('subject_type', sa.String(length=50), nullable=True),
        sa.Column('subject_id', sa.BigInteger(), nullable=True),
        sa.Column('metric', sa.String(length=50), nullable=False),
        sa.Column('value', sa.Numeric(precision=18, scale=4), nullable=True),
        sa.Column('unit', sa.String(length=10), nullable=False),
        sa.Column('quality', sa.String(length=10), nullable=False),
        sa.Column('observed_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('received_at', sa.DateTime(timezone=True), server_default=_NOW, nullable=False),
        sa.Column('source', sa.String(length=15), nullable=False),
        sa.Column('simulation_run_id', sa.BigInteger(), nullable=True),
        sa.Column('metadata', _JSON, nullable=False),
        sa.Column('is_demo', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=_NOW, nullable=False),
        sa.CheckConstraint("quality IN ('VALID','INVALID','SUSPECT','MISSING')",
                           name='ck_telemetry_quality'),
        sa.CheckConstraint("source IN ('simulator','manual','api')", name='ck_telemetry_source'),
        sa.ForeignKeyConstraint(['org_id'], ['organizations.id']),
        sa.ForeignKeyConstraint(['device_id'], ['devices.id']),
        sa.ForeignKeyConstraint(['sensor_id'], ['sensors.id']),
        sa.ForeignKeyConstraint(['simulation_run_id'], ['simulation_runs.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('sensor_id', 'observed_at', 'metric',
                            name='uq_telemetry_ingestion_identity'),
    )
    op.create_index('ix_telemetry_readings_org_id', 'telemetry_readings', ['org_id'])
    op.create_index('ix_telemetry_readings_device_id', 'telemetry_readings', ['device_id'])
    op.create_index('ix_telemetry_readings_sensor_id', 'telemetry_readings', ['sensor_id'])
    op.create_index('ix_telemetry_readings_metric', 'telemetry_readings', ['metric'])
    op.create_index('ix_telemetry_readings_quality', 'telemetry_readings', ['quality'])
    op.create_index('ix_telemetry_readings_observed_at', 'telemetry_readings', ['observed_at'])
    op.create_index('ix_telemetry_readings_simulation_run_id', 'telemetry_readings',
                    ['simulation_run_id'])

    op.create_table(
        'telemetry_rules',
        sa.Column('id', _ID, nullable=False),
        sa.Column('org_id', sa.BigInteger(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('domain', sa.String(length=20), nullable=False),
        sa.Column('metric', sa.String(length=50), nullable=False),
        sa.Column('operator', sa.String(length=3), nullable=False),
        sa.Column('threshold', sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column('unit', sa.String(length=10), nullable=False),
        sa.Column('severity', sa.String(length=10), nullable=False),
        sa.Column('decision_type', sa.String(length=50), nullable=False),
        sa.Column('enabled', sa.Boolean(), nullable=False),
        sa.Column('configuration', _JSON, nullable=False),
        sa.Column('is_demo', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=_NOW, nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=_NOW, nullable=False),
        sa.CheckConstraint("operator IN ('GT','GTE','LT','LTE','EQ','NEQ')", name='ck_rule_operator'),
        sa.CheckConstraint("severity IN ('low','medium','high','critical')", name='ck_rule_severity'),
        sa.CheckConstraint(f"domain IN ({_DOMAINS})", name='ck_rule_domain'),
        sa.ForeignKeyConstraint(['org_id'], ['organizations.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_telemetry_rules_org_id', 'telemetry_rules', ['org_id'])
    op.create_index('ix_telemetry_rules_metric', 'telemetry_rules', ['metric'])


def downgrade() -> None:
    op.drop_index('ix_telemetry_rules_metric', table_name='telemetry_rules')
    op.drop_index('ix_telemetry_rules_org_id', table_name='telemetry_rules')
    op.drop_table('telemetry_rules')
    for idx in ('ix_telemetry_readings_simulation_run_id', 'ix_telemetry_readings_observed_at',
                'ix_telemetry_readings_quality', 'ix_telemetry_readings_metric',
                'ix_telemetry_readings_sensor_id', 'ix_telemetry_readings_device_id',
                'ix_telemetry_readings_org_id'):
        op.drop_index(idx, table_name='telemetry_readings')
    op.drop_table('telemetry_readings')
    op.drop_index('ix_simulation_runs_device_id', table_name='simulation_runs')
    op.drop_index('ix_simulation_runs_org_id', table_name='simulation_runs')
    op.drop_table('simulation_runs')
    op.drop_index('ix_sensors_metric', table_name='sensors')
    op.drop_index('ix_sensors_device_id', table_name='sensors')
    op.drop_index('ix_sensors_org_id', table_name='sensors')
    op.drop_table('sensors')
    op.drop_index('ix_devices_org_id', table_name='devices')
    op.drop_table('devices')
