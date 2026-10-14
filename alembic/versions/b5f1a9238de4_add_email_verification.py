"""add email verification fields to users and create email_verification_tokens table

Revision ID: b5f1a9238de4
Revises: 992b8e22d756
Create Date: 2026-10-14 12:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b5f1a9238de4'
down_revision: Union[str, Sequence[str], None] = '992b8e22d756'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema safely supporting existing and new PostgreSQL/SQLite databases."""
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()

    # 1. Update users table with email verification columns
    if 'users' in tables:
        existing_cols = [c['name'] for c in inspector.get_columns('users')]
        with op.batch_alter_table('users', schema=None) as batch_op:
            if 'email_verified' not in existing_cols:
                # server_default=sa.true() ensures all existing accounts are marked verified and not locked out
                batch_op.add_column(
                    sa.Column('email_verified', sa.Boolean(), server_default=sa.true(), nullable=False)
                )
            if 'email_verified_at' not in existing_cols:
                batch_op.add_column(
                    sa.Column('email_verified_at', sa.DateTime(timezone=True), nullable=True)
                )

    # 2. Create email_verification_tokens table
    if 'email_verification_tokens' not in tables:
        op.create_table(
            'email_verification_tokens',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('user_id', sa.Integer(), nullable=False),
            sa.Column('token_hash', sa.String(length=64), nullable=False),
            sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
            sa.Column('used_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id')
        )
        with op.batch_alter_table('email_verification_tokens', schema=None) as batch_op:
            batch_op.create_index(batch_op.f('ix_email_verification_tokens_id'), ['id'], unique=False)
            batch_op.create_index(batch_op.f('ix_email_verification_tokens_user_id'), ['user_id'], unique=False)
            batch_op.create_index(batch_op.f('ix_email_verification_tokens_token_hash'), ['token_hash'], unique=False)
            batch_op.create_index(batch_op.f('ix_email_verification_tokens_expires_at'), ['expires_at'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()

    if 'email_verification_tokens' in tables:
        with op.batch_alter_table('email_verification_tokens', schema=None) as batch_op:
            batch_op.drop_index(batch_op.f('ix_email_verification_tokens_expires_at'))
            batch_op.drop_index(batch_op.f('ix_email_verification_tokens_token_hash'))
            batch_op.drop_index(batch_op.f('ix_email_verification_tokens_user_id'))
            batch_op.drop_index(batch_op.f('ix_email_verification_tokens_id'))
        op.drop_table('email_verification_tokens')

    if 'users' in tables:
        existing_cols = [c['name'] for c in inspector.get_columns('users')]
        with op.batch_alter_table('users', schema=None) as batch_op:
            if 'email_verified_at' in existing_cols:
                batch_op.drop_column('email_verified_at')
            if 'email_verified' in existing_cols:
                batch_op.drop_column('email_verified')
