import json
from pathlib import Path

import aiosqlite

DB_PATH = Path.home() / ".lingua" / "sessions.db"


async def init_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                id                   INTEGER PRIMARY KEY AUTOINCREMENT,
                started_at           TEXT NOT NULL,
                ended_at             TEXT,
                source_language      TEXT,
                target_language      TEXT,
                transcript           TEXT,
                transcript_translated TEXT,
                title                TEXT,
                summary              TEXT,
                key_points           TEXT,
                title_en             TEXT,
                summary_en           TEXT,
                key_points_en        TEXT,
                duration_seconds     REAL,
                word_count           INTEGER
            )
        """)
        # Migrate existing DBs
        for col in ("transcript_translated TEXT", "title_en TEXT", "summary_en TEXT", "key_points_en TEXT"):
            try:
                await db.execute(f"ALTER TABLE sessions ADD COLUMN {col}")
            except Exception:
                pass
        await db.commit()


async def create_session(started_at: str, target_language: str) -> int:
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            "INSERT INTO sessions (started_at, target_language) VALUES (?, ?)",
            (started_at, target_language),
        )
        await db.commit()
        return cursor.lastrowid


async def update_session(session_id: int, **kwargs) -> None:
    if not kwargs:
        return
    cols = ", ".join(f"{k} = ?" for k in kwargs)
    vals = list(kwargs.values()) + [session_id]
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(f"UPDATE sessions SET {cols} WHERE id = ?", vals)
        await db.commit()


def _parse(row: dict) -> dict:
    for col in ("key_points", "key_points_en"):
        if row.get(col):
            try:
                row[col] = json.loads(row[col])
            except Exception:
                row[col] = []
    return row


async def get_sessions(date: str | None = None) -> list[dict]:
    q = (
        "SELECT id, started_at, ended_at, source_language, target_language, "
        "title, summary, key_points, duration_seconds, word_count "
        "FROM sessions"
    )
    params: list = []
    if date:
        q += " WHERE date(started_at) = ?"
        params.append(date)
    q += " ORDER BY started_at DESC"
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(q, params)
        return [_parse(dict(r)) for r in await cursor.fetchall()]


async def get_session(session_id: int) -> dict | None:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM sessions WHERE id = ?", (session_id,))
        row = await cursor.fetchone()
        return _parse(dict(row)) if row else None


async def get_session_dates() -> list[str]:
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            "SELECT DISTINCT date(started_at) FROM sessions ORDER BY 1 DESC"
        )
        return [r[0] for r in await cursor.fetchall()]
