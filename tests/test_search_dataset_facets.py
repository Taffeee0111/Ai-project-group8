from __future__ import annotations

import json
import sys
import tempfile
import urllib.parse
import urllib.request
import unittest
from io import BytesIO
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

import backend.server as server


class SearchDatasetFacetsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.tempdir = tempfile.TemporaryDirectory()
        cls.db_path = Path(cls.tempdir.name) / "library.db"
        cls.original_db_path = server.DB_PATH
        server.DB_PATH = cls.db_path
        server.init_db()

    @classmethod
    def tearDownClass(cls) -> None:
        server.DB_PATH = cls.original_db_path
        cls.tempdir.cleanup()

    def fetch_json(self, path: str):
        parsed = urllib.parse.urlparse(path)
        fake = type(
            "FakeHandler",
            (),
            {
                "headers": {},
                "wfile": BytesIO(),
                "send_response": lambda self, status: setattr(self, "status", status),
                "send_header": lambda self, key, value: None,
                "end_headers": lambda self: None,
            },
        )()
        server.Handler.handle_get(fake, parsed.path, urllib.parse.parse_qs(parsed.query))
        self.assertEqual(fake.status, 200)
        return json.loads(fake.wfile.getvalue().decode("utf-8"))

    def test_search_facets_include_dataset_terms(self) -> None:
        facets = self.fetch_json("/api/books/search-facets")

        self.assertIn("fantasy", facets["genres"])
        self.assertTrue(any("Scholastic" in publisher for publisher in facets["publishers"]))
        self.assertNotIn("shelfTags", facets)
        self.assertNotIn("languages", facets)
        self.assertNotIn("formats", facets)

    def test_fresh_database_imports_dataset_auxiliary_tables(self) -> None:
        with server.connect() as conn:
            self.assertEqual(conn.execute("SELECT COUNT(*) FROM books").fetchone()[0], 10000)
            self.assertGreater(conn.execute("SELECT COUNT(*) FROM dataset_book_shelves").fetchone()[0], 0)
            self.assertGreater(conn.execute("SELECT COUNT(*) FROM dataset_interactions").fetchone()[0], 0)
            self.assertGreater(conn.execute("SELECT COUNT(*) FROM dataset_book_id_map").fetchone()[0], 0)

    def test_search_matches_publisher_and_returns_dataset_metadata(self) -> None:
        rows = self.fetch_json("/api/books/search?keyword=Scholastic&record=0")

        self.assertGreater(len(rows), 0)
        self.assertTrue(any("Scholastic" in (row.get("publisher") or "") for row in rows))
        self.assertTrue(all("genres" in row and "top_shelves" in row for row in rows))

    def test_search_matches_isbn_and_filters_dataset_fields(self) -> None:
        rows = self.fetch_json("/api/books/search?keyword=9780439785969&genre=fantasy&minRating=4.5&record=0")

        self.assertGreater(len(rows), 0)
        first = rows[0]
        self.assertEqual(first["isbn13"], "9780439785969")
        self.assertEqual(first["language_code"], "eng")
        self.assertGreaterEqual(float(first["average_rating"]), 4.5)
        self.assertIn("fantasy", first["genres"])
