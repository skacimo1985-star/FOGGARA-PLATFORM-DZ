"""Versioned WEFEH, production, matching and legal requests.

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
"""
from alembic import op
from sqlalchemy import Column, String, Text, Integer, Boolean, DateTime, Numeric, ForeignKey, UniqueConstraint, func
from sqlalchemy import BigInteger, JSON
from sqlalchemy.dialects.postgresql import JSONB
revision = 'e5f6a7b8c9d0'
down_revision = 'd4e5f6a7b8c9'
branch_labels = None
depends_on = None
BigId = BigInteger().with_variant(Integer(), 'sqlite')
PortableJSON = JSON().with_variant(JSONB(), 'postgresql')

def upgrade():
    op.create_table('matrix_policies',
        Column('id', BigId, primary_key=True),
        Column('org_id', BigId, ForeignKey('organizations.id'), nullable=False),
        Column('version', Integer, nullable=False),
        Column('name', String(150), nullable=False),
        Column('rules', PortableJSON, nullable=False),
        Column('active', Boolean, nullable=False, default=False),
        Column('created_by', BigId, ForeignKey('users.id'), nullable=False),
        Column('created_at', DateTime(timezone=True), server_default=func.current_timestamp()),
        UniqueConstraint('org_id', 'version'),
    )
    op.create_index('ix_matrix_policies_org_id', 'matrix_policies', ['org_id'])
    op.create_table('matrix_observations',
        Column('id', BigId, primary_key=True),
        Column('org_id', BigId, ForeignKey('organizations.id'), nullable=False),
        Column('project_id', BigId, ForeignKey('projects.id'), nullable=False),
        Column('domain', String(20), nullable=False),
        Column('metric', String(80), nullable=False),
        Column('value', Numeric(18,5), nullable=False),
        Column('unit', String(30), nullable=False),
        Column('source', String(500), nullable=False),
        Column('measured_at', DateTime(timezone=True), nullable=False),
        Column('status', String(20), nullable=False, default='pending'),
        Column('submitted_by', BigId, ForeignKey('users.id'), nullable=False),
        Column('reviewed_by', BigId, ForeignKey('users.id')),
        Column('review_note', Text),
        Column('created_at', DateTime(timezone=True), server_default=func.current_timestamp()),
    )
    op.create_index('ix_matrix_observations_org_id', 'matrix_observations', ['org_id'])
    op.create_index('ix_matrix_observations_project_id', 'matrix_observations', ['project_id'])
    op.create_table('matrix_evaluations',
        Column('id', BigId, primary_key=True),
        Column('org_id', BigId, ForeignKey('organizations.id'), nullable=False),
        Column('project_id', BigId, ForeignKey('projects.id'), nullable=False),
        Column('policy_id', BigId, ForeignKey('matrix_policies.id'), nullable=False),
        Column('fingerprint', String(64), nullable=False),
        Column('result', PortableJSON, nullable=False),
        Column('status', String(20), nullable=False, default='pending'),
        Column('reviewed_by', BigId, ForeignKey('users.id')),
        Column('review_note', Text),
        Column('created_at', DateTime(timezone=True), server_default=func.current_timestamp()),
        UniqueConstraint('org_id', 'fingerprint'),
    )
    op.create_index('ix_matrix_evaluations_org_id', 'matrix_evaluations', ['org_id'])
    op.create_index('ix_matrix_evaluations_project_id', 'matrix_evaluations', ['project_id'])
    op.create_table('value_listings',
        Column('id', BigId, primary_key=True),
        Column('org_id', BigId, ForeignKey('organizations.id'), nullable=False),
        Column('project_id', BigId, ForeignKey('projects.id')),
        Column('kind', String(15), nullable=False),
        Column('sector', String(30), nullable=False),
        Column('title', String(200), nullable=False),
        Column('product_code', String(80), nullable=False),
        Column('quantity', Numeric(18,4), nullable=False),
        Column('unit', String(20), nullable=False),
        Column('wilaya', String(80), nullable=False),
        Column('status', String(20), nullable=False, default='active'),
        Column('created_by', BigId, ForeignKey('users.id'), nullable=False),
        Column('created_at', DateTime(timezone=True), server_default=func.current_timestamp()),
    )
    op.create_index('ix_value_listings_org_id', 'value_listings', ['org_id'])
    op.create_index('ix_value_listings_product_code', 'value_listings', ['product_code'])
    op.create_table('value_matches',
        Column('id', BigId, primary_key=True),
        Column('org_id', BigId, ForeignKey('organizations.id'), nullable=False),
        Column('offer_id', BigId, ForeignKey('value_listings.id'), nullable=False),
        Column('demand_id', BigId, ForeignKey('value_listings.id'), nullable=False),
        Column('quantity', Numeric(18,4), nullable=False),
        Column('score', Integer, nullable=False),
        Column('reasons', PortableJSON, nullable=False),
        Column('status', String(20), nullable=False, default='suggested'),
        UniqueConstraint('org_id','offer_id','demand_id'),
    )
    op.create_index('ix_value_matches_org_id', 'value_matches', ['org_id'])
    op.create_table('production_lots',
        Column('id', BigId, primary_key=True),
        Column('org_id', BigId, ForeignKey('organizations.id'), nullable=False),
        Column('project_id', BigId, ForeignKey('projects.id'), nullable=False),
        Column('code', String(80), nullable=False),
        Column('product', String(150), nullable=False),
        Column('sector', String(30), nullable=False),
        Column('stage', String(30), nullable=False, default='production'),
        Column('quantity', Numeric(18,4), nullable=False),
        Column('unit', String(20), nullable=False),
        Column('trace', PortableJSON, nullable=False, default=list),
        Column('created_at', DateTime(timezone=True), server_default=func.current_timestamp()),
        UniqueConstraint('org_id','code'),
    )
    op.create_index('ix_production_lots_org_id', 'production_lots', ['org_id'])
    op.create_table('matrix_jobs',
        Column('id', BigId, primary_key=True),
        Column('org_id', BigId, ForeignKey('organizations.id'), nullable=False),
        Column('kind', String(30), nullable=False),
        Column('project_id', BigId, ForeignKey('projects.id')),
        Column('status', String(20), nullable=False, default='pending'),
        Column('attempts', Integer, nullable=False, default=0),
        Column('error', String(100)),
        Column('created_at', DateTime(timezone=True), server_default=func.current_timestamp()),
        Column('finished_at', DateTime(timezone=True)),
    )
    op.create_index('ix_matrix_jobs_org_id', 'matrix_jobs', ['org_id'])
    op.create_index('ix_matrix_jobs_status', 'matrix_jobs', ['status'])
    op.create_table('contact_tickets',
        Column('id', BigId, primary_key=True),
        Column('reference', String(50), nullable=False, unique=True),
        Column('name', String(120), nullable=False),
        Column('email', String(254), nullable=False),
        Column('subject', String(180), nullable=False),
        Column('message', Text, nullable=False),
        Column('status', String(20), nullable=False, default='received'),
        Column('policy_version', String(40), nullable=False),
        Column('created_at', DateTime(timezone=True), server_default=func.current_timestamp()),
    )
    op.create_table('privacy_requests',
        Column('id', BigId, primary_key=True),
        Column('org_id', BigId, ForeignKey('organizations.id'), nullable=False),
        Column('user_id', BigId, ForeignKey('users.id'), nullable=False),
        Column('kind', String(30), nullable=False),
        Column('note', Text, nullable=False),
        Column('status', String(20), nullable=False, default='received'),
        Column('response', Text),
        Column('created_at', DateTime(timezone=True), server_default=func.current_timestamp()),
    )
    op.create_index('ix_privacy_requests_org_id', 'privacy_requests', ['org_id'])

def downgrade():
    op.drop_table('privacy_requests')
    op.drop_table('contact_tickets')
    op.drop_table('matrix_jobs')
    op.drop_table('production_lots')
    op.drop_table('value_matches')
    op.drop_table('value_listings')
    op.drop_table('matrix_evaluations')
    op.drop_table('matrix_observations')
    op.drop_table('matrix_policies')
