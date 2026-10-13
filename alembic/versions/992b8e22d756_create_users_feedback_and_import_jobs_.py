"""create users, feedback, and import_jobs tables

Revision ID: 992b8e22d756
Revises: 
Create Date: 2026-10-14 00:19:38.726138

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '992b8e22d756'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema safely supporting fresh instances and existing tables."""
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()

    # 1. Manage users table
    if 'users' not in tables:
        op.create_table(
            'users',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('username', sa.String(length=50), nullable=False),
            sa.Column('email', sa.String(length=120), nullable=False),
            sa.Column('hashed_password', sa.String(length=255), nullable=False),
            sa.Column('is_active', sa.Boolean(), server_default=sa.true(), nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.PrimaryKeyConstraint('id')
        )
        with op.batch_alter_table('users', schema=None) as batch_op:
            batch_op.create_index(batch_op.f('ix_users_email'), ['email'], unique=True)
            batch_op.create_index(batch_op.f('ix_users_id'), ['id'], unique=False)
            batch_op.create_index(batch_op.f('ix_users_username'), ['username'], unique=True)
    else:
        existing_cols = [c['name'] for c in inspector.get_columns('users')]
        with op.batch_alter_table('users', schema=None) as batch_op:
            if 'is_active' not in existing_cols:
                batch_op.add_column(sa.Column('is_active', sa.Boolean(), server_default=sa.true(), nullable=False))
            if 'created_at' not in existing_cols:
                batch_op.add_column(sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False))
            if 'updated_at' not in existing_cols:
                batch_op.add_column(sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False))

    # 2. Manage feedback table
    if 'feedback' not in tables:
        op.create_table(
            'feedback',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('user_id', sa.Integer(), nullable=False),
            sa.Column('text', sa.Text(), nullable=False),
            sa.Column('clean_text', sa.Text(), nullable=True),
            sa.Column('sentiment', sa.String(length=20), nullable=False),
            sa.Column('confidence', sa.Float(), nullable=False),
            sa.Column('positive_score', sa.Float(), nullable=False),
            sa.Column('neutral_score', sa.Float(), nullable=False),
            sa.Column('negative_score', sa.Float(), nullable=False),
            sa.Column('category', sa.String(length=50), nullable=True),
            sa.Column('source', sa.String(length=50), nullable=True),
            sa.Column('rating', sa.Integer(), nullable=True),
            sa.Column('model_version', sa.String(length=30), nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id')
        )
        with op.batch_alter_table('feedback', schema=None) as batch_op:
            batch_op.create_index(batch_op.f('ix_feedback_category'), ['category'], unique=False)
            batch_op.create_index(batch_op.f('ix_feedback_created_at'), ['created_at'], unique=False)
            batch_op.create_index(batch_op.f('ix_feedback_id'), ['id'], unique=False)
            batch_op.create_index(batch_op.f('ix_feedback_sentiment'), ['sentiment'], unique=False)
            batch_op.create_index(batch_op.f('ix_feedback_source'), ['source'], unique=False)
            batch_op.create_index('ix_feedback_user_category', ['user_id', 'category'], unique=False)
            batch_op.create_index('ix_feedback_user_created', ['user_id', 'created_at'], unique=False)
            batch_op.create_index(batch_op.f('ix_feedback_user_id'), ['user_id'], unique=False)
            batch_op.create_index('ix_feedback_user_sentiment', ['user_id', 'sentiment'], unique=False)

    # 3. Manage import_jobs table
    if 'import_jobs' not in tables:
        op.create_table(
            'import_jobs',
            sa.Column('id', sa.String(length=36), nullable=False),
            sa.Column('user_id', sa.Integer(), nullable=False),
            sa.Column('filename', sa.String(length=255), nullable=False),
            sa.Column('total_rows', sa.Integer(), nullable=False),
            sa.Column('processed_rows', sa.Integer(), nullable=False),
            sa.Column('successful_rows', sa.Integer(), nullable=False),
            sa.Column('failed_rows', sa.Integer(), nullable=False),
            sa.Column('status', sa.String(length=20), nullable=False),
            sa.Column('error_summary', sa.Text(), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
            sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id')
        )
        with op.batch_alter_table('import_jobs', schema=None) as batch_op:
            batch_op.create_index(batch_op.f('ix_import_jobs_id'), ['id'], unique=False)
            batch_op.create_index(batch_op.f('ix_import_jobs_status'), ['status'], unique=False)
            batch_op.create_index(batch_op.f('ix_import_jobs_user_id'), ['user_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('import_jobs', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_import_jobs_user_id'))
        batch_op.drop_index(batch_op.f('ix_import_jobs_status'))
        batch_op.drop_index(batch_op.f('ix_import_jobs_id'))
    op.drop_table('import_jobs')

    with op.batch_alter_table('feedback', schema=None) as batch_op:
        batch_op.drop_index('ix_feedback_user_sentiment')
        batch_op.drop_index(batch_op.f('ix_feedback_user_id'))
        batch_op.drop_index('ix_feedback_user_created')
        batch_op.drop_index('ix_feedback_user_category')
        batch_op.drop_index(batch_op.f('ix_feedback_source'))
        batch_op.drop_index(batch_op.f('ix_feedback_sentiment'))
        batch_op.drop_index(batch_op.f('ix_feedback_id'))
        batch_op.drop_index(batch_op.f('ix_feedback_created_at'))
        batch_op.drop_index(batch_op.f('ix_feedback_category'))
    op.drop_table('feedback')

    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_column('updated_at')
        batch_op.drop_column('created_at')
        batch_op.drop_column('is_active')
