"""
Database configuration and SQLAlchemy models for the Sentiment Analysis App.
Initializes SQLite connection, session handling, and defines the User model.
"""

import os
from sqlalchemy import create_engine, Column, Integer, String
from sqlalchemy.orm import declarative_base, sessionmaker

# Database file location in the project root
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATABASE_URL = os.environ.get("DATABASE_URL", f"sqlite:///{os.path.join(BASE_DIR, 'sentiment.db')}")

# SQLite requires check_same_thread=False when used across multiple FastAPI request threads
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
)

# SessionLocal class for creating new DB sessions per request
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Declarative base model
Base = declarative_base()


class User(Base):
    """
    SQLAlchemy User model representing registered users.
    """
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    email = Column(String(120), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)

    def __repr__(self):
        return f"<User(id={self.id}, username='{self.username}', email='{self.email}')>"


def get_db():
    """
    FastAPI dependency that provides a transactional database session per request,
    ensuring the session is automatically closed when the request finishes.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """
    Creates all database tables defined in Base metadata if they don't already exist.
    """
    Base.metadata.create_all(bind=engine)
