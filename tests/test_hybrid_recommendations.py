from __future__ import annotations

import shutil
import sys
import tempfile
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

import backend.server as server


class HybridRecommendationTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.tempdir.name) / "library.db"
        shutil.copy2(PROJECT_ROOT / "backend" / "data" / "library.db", self.db_path)
        self.original_db_path = server.DB_PATH
        server.DB_PATH = self.db_path
        server.init_db()
        self.conn = server.connect()
        self.user_id = self.conn.execute(
            "INSERT INTO users(username,password_hash,created_at) VALUES(?,?,?)",
            ("hybrid-user", server.hash_password("secret123"), server.now()),
        ).lastrowid
        self.conn.commit()

    def tearDown(self) -> None:
        self.conn.close()
        server.DB_PATH = self.original_db_path
        self.tempdir.cleanup()

    def test_analysis_exposes_hybrid_model_metadata(self) -> None:
        self.conn.execute(
            "INSERT INTO search_history(user_id,keyword,created_at) VALUES(?,?,?)",
            (self.user_id, "fantasy magic Scholastic", server.now()),
        )
        self.conn.commit()

        analysis = server.recommendation_analysis(self.conn, self.user_id, 5)

        self.assertIn("Hybrid", analysis["summary"])
        self.assertEqual(
            analysis["modelWeights"],
            {"content": 0.45, "collaborative": 0.3, "popularity": 0.2, "novelty": 0.05},
        )
        self.assertTrue(analysis["profileKeywords"])
        self.assertTrue(analysis["preferredGenres"])

    def test_recommendations_include_score_breakdown_and_reason(self) -> None:
        self.conn.execute(
            "INSERT INTO search_history(user_id,keyword,created_at) VALUES(?,?,?)",
            (self.user_id, "fantasy magic", server.now()),
        )
        self.conn.commit()

        rows = server.recommendations(self.conn, self.user_id, 5)

        self.assertGreater(len(rows), 0)
        first = rows[0]
        self.assertEqual(first["recommendation_method"], "hybrid_recommendation")
        self.assertIn("score_breakdown", first)
        self.assertIn("content", first["score_breakdown"])
        self.assertIn("collaborative", first["score_breakdown"])
        self.assertIn("popularity", first["score_breakdown"])
        self.assertIn("综合推荐", first["reason"])
        self.assertGreaterEqual(first["ml_score"], 0)
        self.assertLessEqual(first["ml_score"], 1)

    def test_favorite_activates_collaborative_signal(self) -> None:
        favorite_book_id = self.conn.execute("SELECT id FROM books WHERE book_id='1'").fetchone()["id"]
        self.conn.execute(
            "INSERT INTO favorites(user_id,book_id,created_at) VALUES(?,?,?)",
            (self.user_id, favorite_book_id, server.now()),
        )
        self.conn.commit()

        rows = server.recommendations(self.conn, self.user_id, 10)

        self.assertGreater(len(rows), 0)
        self.assertTrue(any(row["score_breakdown"]["collaborative"] > 0 for row in rows))
        self.assertTrue(all(row["id"] != favorite_book_id for row in rows))
