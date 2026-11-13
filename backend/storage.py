"""Local SQLite metadata and chunk catalog. Database connections never outlive a call."""
import json
import sqlite3
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path


class DocumentCatalog:
    def __init__(self, path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with closing(self.connect()) as con, con:
            con.executescript("""
                CREATE TABLE IF NOT EXISTS documents (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    kind TEXT NOT NULL,
                    version INTEGER NOT NULL,
                    sha256 TEXT NOT NULL,
                    active INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS chunks (
                    vector_id TEXT PRIMARY KEY,
                    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
                    page INTEGER NOT NULL,
                    excerpt TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS queries (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    created_at TEXT NOT NULL,
                    question TEXT NOT NULL,
                    document_ids TEXT NOT NULL,
                    needs_review INTEGER NOT NULL
                );
            """)

    def connect(self):
        con = sqlite3.connect(str(self.path), timeout=15)
        con.row_factory = sqlite3.Row
        con.execute('PRAGMA foreign_keys = ON')
        return con

    def list_documents(self, active_only=True):
        with closing(self.connect()) as con:
            query = 'SELECT * FROM documents' + (' WHERE active=1' if active_only else '') + ' ORDER BY title, version DESC'
            return [dict(r) for r in con.execute(query).fetchall()]

    def get(self, document_id):
        with closing(self.connect()) as con:
            r = con.execute('SELECT * FROM documents WHERE id=?', (document_id,)).fetchone()
            return dict(r) if r else None

    def duplicate(self, title, checksum):
        with closing(self.connect()) as con:
            r = con.execute('SELECT * FROM documents WHERE title=? AND sha256=? AND active=1', (title, checksum)).fetchone()
            return dict(r) if r else None

    def next_version(self, title):
        with closing(self.connect()) as con:
            r = con.execute('SELECT COALESCE(MAX(version), 0)+1 FROM documents WHERE title=?', (title,)).fetchone()
            return int(r[0])

    def save_document(self, item, chunks):
        with closing(self.connect()) as con, con:
            con.execute('UPDATE documents SET active=0 WHERE title=?', (item['title'],))
            con.execute('INSERT INTO documents(id, title, kind, version, sha256, created_at) VALUES (:id,:title,:kind,:version,:sha256,:created_at)', item)
            con.executemany('INSERT INTO chunks(vector_id, document_id, page, excerpt) VALUES (?,?,?,?)', chunks)

    def chunk_ids(self, document_id):
        with closing(self.connect()) as con:
            return [r[0] for r in con.execute('SELECT vector_id FROM chunks WHERE document_id=?', (document_id,))]

    def delete(self, document_id):
        with closing(self.connect()) as con, con:
            con.execute('DELETE FROM chunks WHERE document_id=?', (document_id,))
            con.execute('DELETE FROM documents WHERE id=?', (document_id,))

    def record_query(self, question, document_ids, needs_review):
        with closing(self.connect()) as con, con:
            con.execute('INSERT INTO queries(created_at,question,document_ids,needs_review) VALUES(?,?,?,?)',
                        (datetime.now(timezone.utc).isoformat(), question, json.dumps(document_ids), int(needs_review)))
