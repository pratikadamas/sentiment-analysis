"""remove authentication, drop users and verification tokens, make feedback and import user_id nullable

Revision ID: c4e2f187a912
Revises: b5f1a9238de4
Create Date: 2026-10-14 23:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c4e2f187a912'
down_revision: Union[str, Sequence[str], None] = 'b5f1a9238de4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Safely remove authentication tables and convert user_id to nullable for existing records."""
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()

    # 1. Drop email_verification_tokens table if it exists
    if 'email_verification_tokens' in tables:
        with op.batch_alter_table('email_verification_tokens', schema=None) as batch_op:
            for idx in inspector.get_indexes('email_verification_tokens'):
                batch_op.drop_index(idx['name'])
        op.drop_table('email_verification_tokens')

    # 2. Modify feedback table: drop composite user indexes, drop foreign key, make user_id nullable
    if 'feedback' in tables:
        existing_fb_indexes = {idx['name'] for idx in inspector.get_indexes('feedback')}
        with op.batch_alter_table('feedback', schema=None) as batch_op:
            if 'ix_feedback_user_category' in existing_fb_indexes:
                batch_op.drop_index('ix_feedback_user_category')
            if 'ix_feedback_user_created' in existing_fb_indexes:
                batch_op.drop_index('ix_feedback_user_created')
            if 'ix_feedback_user_sentiment' in existing_fb_indexes:
                batch_op.drop_index('ix_feedback_user_sentiment')

            # Drop foreign key constraint to users table if named
            for fk in inspector.get_foreign_keys('feedback'):
                if fk.get('referred_table') == 'users':
                    if fk.get('name'):
                        batch_op.drop_constraint(fk['name'], type_='foreignkey')

            # Alter user_id to be nullable
            batch_op.alter_column('user_id', existing_type=sa.Integer(), nullable=True)

    # 3. Modify import_jobs table: drop foreign key, make user_id nullable
    if 'import_jobs' in tables:
        with op.batch_alter_table('import_jobs', schema=None) as batch_op:
            for fk in inspector.get_foreign_keys('import_jobs'):
                if fk.get('referred_table') == 'users':
                    if fk.get('name'):
                        batch_op.drop_constraint(fk['name'], type_='foreignkey')

            batch_op.alter_column('user_id', existing_type=sa.Integer(), nullable=True)

    # 4. Drop users table if it exists
    if 'users' in tables:
        with op.batch_alter_table('users', schema=None) as batch_op:
            for idx in inspector.get_indexes('users'):
                batch_op.drop_index(idx['name'])
        op.drop_table('users')


def downgrade() -> None:
    """Downgrade schema back to multi-tenant users table."""
    op.create_table(
        'users',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('username', sa.String(length=50), nullable=False),
        sa.Column('email', sa.String(length=120), nullable=False),
        sa.Column('hashed_password', sa.String(length=255), nullable=False),
        sa.Column('is_active', sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column('email_verified', sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column('email_verified_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.create_index('ix_users_email', ['email'], unique=True)
        batch_op.create_index('ix_users_id', ['id'], unique=False)
        batch_op.create_index('ix_users_username', ['username'], unique=True)

    with op.batch_alter_table('import_jobs', schema=None) as batch_op:
        batch_op.alter_column('user_id', existing_type=sa.Integer(), nullable=False)
        batch_op.create_foreign_key('fk_import_jobs_user_id', 'users', ['user_id'], ['id'], ondelete='CASCADE')

    with op.batch_alter_table('feedback', schema=None) as batch_op:
        batch_op.alter_column('user_id', existing_type=sa.Integer(), nullable=False)
        batch_op.create_foreign_key('fk_feedback_user_id', 'users', ['user_id'], ['id'], ondelete='CASCADE')
        batch_op.create_index('ix_feedback_user_category', ['user_id', 'category'], unique=False)
        batch_op.create_index('ix_feedback_user_created', ['user_id', 'created_at'], unique=False)
        batch_op.create_index('ix_feedback_user_sentiment', ['user_id', 'sentiment'], unique=False)
