"""Additive auth migration. CLI backs up, rehearses, and verifies before applying."""
import argparse
import sqlite3
import tempfile
from datetime import datetime, timezone
from pathlib import Path

VERSION = "secure_auth_v1"


def migrate(conn):
    conn.execute("BEGIN IMMEDIATE")
    try:
        conn.execute("CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT DEFAULT CURRENT_TIMESTAMP)")
        if conn.execute("SELECT 1 FROM schema_migrations WHERE version=?", (VERSION,)).fetchone():
            conn.commit()
            return
        columns = {r[1] for r in conn.execute("PRAGMA table_info(users)")}
        for name, definition in {"status": "TEXT NOT NULL DEFAULT 'ACTIVE'", "email_verified": "INTEGER NOT NULL DEFAULT 0", "identity_trusted": "INTEGER NOT NULL DEFAULT 0"}.items():
            if name not in columns:
                conn.execute(f"ALTER TABLE users ADD COLUMN {name} {definition}")
        columns = {r[1] for r in conn.execute("PRAGMA table_info(transactions)")}
        if "owner_user_id" not in columns:
            conn.execute("ALTER TABLE transactions ADD COLUMN owner_user_id TEXT REFERENCES users(id)")
        # Fail rather than silently merge conflicting existing identities.
        conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS users_email_normalized ON users(lower(trim(email)))")
        statements = [
            "CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), role TEXT NOT NULL CHECK(role IN ('USER','ADMIN')), provider TEXT NOT NULL, admin_email TEXT, csrf_hash TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, last_seen INTEGER NOT NULL, revoked INTEGER NOT NULL DEFAULT 0)",
            "CREATE TABLE IF NOT EXISTS auth_tokens (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), purpose TEXT NOT NULL CHECK(purpose IN ('verify','reset')), expires_at INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0)",
            "CREATE TABLE IF NOT EXISTS login_history (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT REFERENCES users(id), email TEXT, provider TEXT NOT NULL, success INTEGER NOT NULL, reason TEXT NOT NULL, created_at INTEGER NOT NULL)",
            "CREATE TABLE IF NOT EXISTS admin_audit_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, actor_id TEXT REFERENCES users(id), action TEXT NOT NULL, target_id TEXT, created_at INTEGER NOT NULL)",
            "CREATE TABLE IF NOT EXISTS auth_rate_limits (bucket_hash TEXT PRIMARY KEY, window_start INTEGER NOT NULL, attempts INTEGER NOT NULL)",
            "CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id)",
            "CREATE INDEX IF NOT EXISTS transactions_owner ON transactions(owner_user_id)",
            "CREATE INDEX IF NOT EXISTS login_history_time ON login_history(created_at)",
            "CREATE INDEX IF NOT EXISTS auth_tokens_user ON auth_tokens(user_id,purpose)",
        ]
        for sql in statements:
            conn.execute(sql)
        conn.execute("INSERT INTO schema_migrations(version) VALUES (?)", (VERSION,))
        conn.commit()
    except Exception:
        conn.rollback()
        raise


def snapshot(conn):
    tables = ["customers", "counterparties", "transactions", "fraud_analyses", "audit_logs", "users", "admin_whitelist"]
    return {t: (tuple(r[1] for r in conn.execute(f"PRAGMA table_info({t})")), conn.execute(f"SELECT * FROM {t} ORDER BY rowid").fetchall()) for t in tables}


def preserved(conn, before):
    for table, (columns, rows) in before.items():
        actual = conn.execute(f"SELECT {','.join(columns)} FROM {table} ORDER BY rowid").fetchall()
        if actual != rows:
            raise RuntimeError(f"Migration changed existing data in {table}")
    if conn.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
        raise RuntimeError("SQLite integrity check failed")


def apply_safely(path):
    path = Path(path).resolve()
    if not path.is_file():
        raise RuntimeError(f"Existing database required: {path}")
    with sqlite3.connect(path, timeout=15) as source:
        before = snapshot(source)
        backup_dir = path.parent / "backups"
        backup_dir.mkdir(exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
        backup = backup_dir / f"sentinel-pre-auth-{stamp}.db"
        with sqlite3.connect(backup) as target:
            source.backup(target)
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as temp:
            with sqlite3.connect(Path(temp) / "rehearsal.db") as trial:
                source.backup(trial)
                migrate(trial)
                preserved(trial, before)
        migrate(source)
        preserved(source, before)
    print(f"Migration verified; original records preserved. Backup: {backup}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--database", default=str(Path(__file__).parent / "sentinel.db"))
    args = parser.parse_args()
    apply_safely(args.database)