"""drop dangling users foreign keys on feedback and import_jobs

Revision ID: d5f3a1829e01
Revises: c4e2f187a912
Create Date: 2026-10-18 15:45:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd5f3a1829e01'
down_revision: Union[str, Sequence[str], None] = 'c4e2f187a912'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Safely drop dangling foreign keys to users table and ensure user_id is nullable."""
    conn = op.get_bind()
    is_sqlite = conn.dialect.name == "sqlite"
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()

    if is_sqlite:
        conn.execute(sa.text("PRAGMA foreign_keys = OFF"))

        if "feedback" in tables:
            conn.execute(sa.text("""
                CREATE TABLE feedback_clean (
                    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER,
                    text TEXT NOT NULL,
                    clean_text TEXT,
                    sentiment VARCHAR(20) NOT NULL,
                    confidence FLOAT NOT NULL,
                    positive_score FLOAT NOT NULL DEFAULT 0.0,
                    neutral_score FLOAT NOT NULL DEFAULT 0.0,
                    negative_score FLOAT NOT NULL DEFAULT 0.0,
                    category VARCHAR(50),
                    source VARCHAR(50),
                    rating INTEGER,
                    model_version VARCHAR(30) NOT NULL DEFAULT '3.0.0',
                    created_at DATETIME NOT NULL,
                    updated_at DATETIME NOT NULL
                )
            """))
            conn.execute(sa.text("""
                INSERT INTO feedback_clean (
                    id, user_id, text, clean_text, sentiment, confidence,
                    positive_score, neutral_score, negative_score, category, source, rating,
                    model_version, created_at, updated_at
                )
                SELECT
                    id, user_id, text, clean_text, sentiment, confidence,
                    positive_score, neutral_score, negative_score, category, source, rating,
                    model_version, created_at, updated_at
                FROM feedback
            """))
            conn.execute(sa.text("DROP TABLE feedback"))
            conn.execute(sa.text("ALTER TABLE feedback_clean RENAME TO feedback"))
            conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_feedback_id ON feedback (id)"))
            conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_feedback_user_id ON feedback (user_id)"))
            conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_feedback_sentiment ON feedback (sentiment)"))
            conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_feedback_category ON feedback (category)"))
            conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_feedback_source ON feedback (source)"))
            conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_feedback_created_at ON feedback (created_at)"))

        if "import_jobs" in tables:
            conn.execute(sa.text("""
                CREATE TABLE import_jobs_clean (
                    id VARCHAR(36) NOT NULL PRIMARY KEY,
                    user_id INTEGER,
                    filename VARCHAR(255) NOT NULL,
                    total_rows INTEGER NOT NULL DEFAULT 0,
                    processed_rows INTEGER NOT NULL DEFAULT 0,
                    successful_rows INTEGER NOT NULL DEFAULT 0,
                    failed_rows INTEGER NOT NULL DEFAULT 0,
                    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
                    error_summary TEXT,
                    created_at DATETIME NOT NULL,
                    completed_at DATETIME
                )
            """))
            conn.execute(sa.text("""
                INSERT INTO import_jobs_clean (
                    id, user_id, filename, total_rows, processed_rows,
                    successful_rows, failed_rows, status, error_summary, created_at, completed_at
                )
                SELECT
                    id, user_id, filename, total_rows, processed_rows,
                    successful_rows, failed_rows, status, error_summary, created_at, completed_at
                FROM import_jobs
            """))
            conn.execute(sa.text("DROP TABLE import_jobs"))
            conn.execute(sa.text("ALTER TABLE import_jobs_clean RENAME TO import_jobs"))
            conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_import_jobs_id ON import_jobs (id)"))
            conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_import_jobs_user_id ON import_jobs (user_id)"))
            conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_import_jobs_status ON import_jobs (status)"))

        conn.execute(sa.text("PRAGMA foreign_keys = ON"))
    else:
        # PostgreSQL / generic SQL
        for tbl in ["feedback", "import_jobs"]:
            if tbl in tables:
                for fk in inspector.get_foreign_keys(tbl):
                    if fk.get("referred_table") == "users" and fk.get("name"):
                        op.drop_constraint(fk["name"], tbl, type_="foreignkey")
                conn.execute(sa.text(f"ALTER TABLE {tbl} ALTER COLUMN user_id DROP NOT NULL"))


def downgrade() -> None:
    """Downgrade schema."""
    pass
