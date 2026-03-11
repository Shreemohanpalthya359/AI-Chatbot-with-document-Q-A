"""
db.py — PostgreSQL Database Module for AI Document Q&A
=======================================================
Handles all database operations:
  - Connection management (singleton)
  - Table initialization
  - CRUD helpers for messages, documents, training runs
"""

import os
import json
import psycopg2
import psycopg2.extras
from datetime import datetime

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://localhost/ai_chatbot_db")

_conn = None


def get_connection():
    """Returns a live PostgreSQL connection, reconnecting if needed."""
    global _conn
    try:
        if _conn is None or _conn.closed:
            _conn = psycopg2.connect(DATABASE_URL)
            _conn.autocommit = True
    except Exception as e:
        print(f"[DB] Connection error: {e}")
        raise
    return _conn


def init_db():
    """Creates all tables if they don't already exist."""
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS conversations (
                id         SERIAL PRIMARY KEY,
                created_at TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS messages (
                id              SERIAL PRIMARY KEY,
                conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE,
                role            VARCHAR(10)  NOT NULL,
                content         TEXT         NOT NULL,
                message_type    VARCHAR(20)  DEFAULT 'text',
                created_at      TIMESTAMP    DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS uploaded_documents (
                id          SERIAL PRIMARY KEY,
                filename    TEXT    NOT NULL,
                file_path   TEXT    NOT NULL,
                num_chunks  INTEGER DEFAULT 0,
                uploaded_at TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS training_runs (
                id            SERIAL PRIMARY KEY,
                best_model    TEXT,
                best_accuracy FLOAT,
                best_f1       FLOAT,
                num_samples   INTEGER,
                num_classes   INTEGER,
                results_json  JSONB,
                trained_at    TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS users (
                id            SERIAL PRIMARY KEY,
                email         TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                created_at    TIMESTAMP DEFAULT NOW()
            );
        """)
    print("[DB] Tables ready.")


# ── Conversation ───────────────────────────────────────────────────────────────

def create_conversation() -> int:
    """Creates a new conversation row and returns its ID."""
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute("INSERT INTO conversations DEFAULT VALUES RETURNING id;")
        return cur.fetchone()[0]


# ── Messages ──────────────────────────────────────────────────────────────────

def save_message(conversation_id: int, role: str, content: str, message_type: str = "text"):
    """Inserts a single message into the messages table."""
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO messages (conversation_id, role, content, message_type)
            VALUES (%s, %s, %s, %s);
            """,
            (conversation_id, role, content, message_type)
        )


def get_recent_messages(limit: int = 50) -> list:
    """Returns the most recent messages across all conversations."""
    conn = get_connection()
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            """
            SELECT m.id, c.id AS conversation_id, m.role, m.content,
                   m.message_type, m.created_at
            FROM messages m
            JOIN conversations c ON m.conversation_id = c.id
            ORDER BY m.created_at DESC
            LIMIT %s;
            """,
            (limit,)
        )
        rows = cur.fetchall()
    # Convert datetime to ISO string for JSON serialization
    result = []
    for row in rows:
        d = dict(row)
        d['created_at'] = d['created_at'].isoformat()
        result.append(d)
    return result


# ── Documents ─────────────────────────────────────────────────────────────────

def save_document(filename: str, file_path: str, num_chunks: int) -> int:
    """Inserts document metadata and returns the new row ID."""
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO uploaded_documents (filename, file_path, num_chunks)
            VALUES (%s, %s, %s) RETURNING id;
            """,
            (filename, file_path, num_chunks)
        )
        return cur.fetchone()[0]


def get_documents() -> list:
    """Returns all uploaded document records."""
    conn = get_connection()
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("SELECT * FROM uploaded_documents ORDER BY uploaded_at DESC;")
        rows = cur.fetchall()
    result = []
    for row in rows:
        d = dict(row)
        d['uploaded_at'] = d['uploaded_at'].isoformat()
        result.append(d)
    return result


# ── Training Runs ─────────────────────────────────────────────────────────────

def save_training_run(result: dict) -> int:
    """Saves a training run result dict and returns the new row ID."""
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO training_runs
                (best_model, best_accuracy, best_f1, num_samples, num_classes, results_json)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING id;
            """,
            (
                result.get("best_model"),
                result.get("best_accuracy"),
                result.get("best_f1"),
                result.get("num_samples"),
                result.get("num_classes"),
                json.dumps(result.get("models", [])),
            )
        )
        return cur.fetchone()[0]


def get_training_runs() -> list:
    """Returns all training run records."""
    conn = get_connection()
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("SELECT * FROM training_runs ORDER BY trained_at DESC;")
        rows = cur.fetchall()
    result = []
    for row in rows:
        d = dict(row)
        d['trained_at'] = d['trained_at'].isoformat()
        result.append(d)
    return result


# ── Users ─────────────────────────────────────────────────────────────────────

def create_user(email: str, password_hash: str) -> int:
    """Creates a new user and returns their ID."""
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO users (email, password_hash) VALUES (%s, %s) RETURNING id;",
            (email, password_hash)
        )
        return cur.fetchone()[0]


def get_user_by_email(email: str) -> dict:
    """Fetches a user by their email address."""
    conn = get_connection()
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("SELECT * FROM users WHERE email = %s;", (email,))
        return cur.fetchone()
