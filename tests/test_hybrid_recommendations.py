from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

import backend.server as server
from backend.ml.train_recommender import train_recommender
from tests.test_ml_recommender_training import MlRecommenderTrainingTest


class MlRecommendationTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.tempdir = tempfile.TemporaryDirectory()
        cls.db_path = Path(cls.tempdir.name) / "library.db"
        cls.model_path = Path(cls.tempdir.name) / "recommender.joblib"
        cls.books_csv = Path(cls.tempdir.name) / "books.csv"
        cls.interactions_csv = Path(cls.tempdir.name) / "interactions.csv"
        cls.original_db_path = server.DB_PATH
        cls.original_model_path = server.RECOMMENDER_MODEL_PATH
        server.DB_PATH = cls.db_path
        server.RECOMMENDER_MODEL_PATH = cls.model_path
        server.init_db()
        MlRecommenderTrainingTest.write_books(cls.books_csv)
        MlRecommenderTrainingTest.write_interactions(cls.interactions_csv)
        train_recommender(
            books_csv=cls.books_csv,
            interactions_csv=cls.interactions_csv,
            output_path=cls.model_path,
            n_components=2,
            max_features=32,
        )

    @classmethod
    def tearDownClass(cls) -> None:
        server.DB_PATH = cls.original_db_path
        server.RECOMMENDER_MODEL_PATH = cls.original_model_path
        server.RECOMMENDER_MODEL_CACHE.clear()
        server.RECOMMENDATION_CACHE.clear()
        cls.tempdir.cleanup()

    def setUp(self) -> None:
        self.conn = server.connect()
        self.user_id = self.conn.execute(
            "INSERT INTO users(username,password_hash,created_at) VALUES(?,?,?)",
            (f"hybrid-user-{self._testMethodName}", server.hash_password("secret123"), server.now()),
        ).lastrowid
        self.conn.commit()

    def tearDown(self) -> None:
        self.conn.close()

    def test_analysis_exposes_ml_model_status(self) -> None:
        self.conn.execute(
            "INSERT INTO search_history(user_id,keyword,created_at) VALUES(?,?,?)",
            (self.user_id, "fantasy magic Scholastic", server.now()),
        )
        self.conn.commit()

        analysis = server.recommendation_analysis(self.conn, self.user_id, 5)

        self.assertIn("机器学习", analysis["summary"])
        self.assertIn("modelStatus", analysis)
        self.assertIn("available", analysis["modelStatus"])
        self.assertNotIn("modelWeights", analysis)
        self.assertTrue(analysis["profileKeywords"])
        self.assertTrue(analysis["preferredGenres"])

    def test_profile_keywords_filter_numeric_shelf_counts(self) -> None:
        favorite_book_id = self.conn.execute("SELECT id FROM books WHERE book_id='1'").fetchone()["id"]
        self.conn.execute(
            "UPDATE books SET top_shelves=? WHERE id=?",
            ("to-read:167697; fantasy:37174; favorites:34173", favorite_book_id),
        )
        self.conn.execute(
            "INSERT INTO favorites(user_id,book_id,created_at) VALUES(?,?,?)",
            (self.user_id, favorite_book_id, server.now()),
        )
        self.conn.execute(
            "INSERT INTO search_history(user_id,keyword,created_at) VALUES(?,?,?)",
            (self.user_id, "fantasy magic", server.now()),
        )
        self.conn.commit()
        server.BOOK_VECTOR_CACHE.clear()

        terms = [item["term"] for item in server.recommendation_profile_keywords(self.conn, self.user_id, 20)]

        self.assertTrue(terms)
        self.assertFalse(any(term.isdigit() for term in terms))
        self.assertIn("fantasy", terms)

    def test_missing_model_uses_popularity_fallback(self) -> None:
        original_model_path = server.RECOMMENDER_MODEL_PATH
        server.RECOMMENDER_MODEL_PATH = Path(self.conn.execute("PRAGMA database_list").fetchone()["file"]).with_name("missing-model.joblib")
        server.RECOMMENDER_MODEL_CACHE.clear()
        server.RECOMMENDATION_CACHE.clear()
        self.addCleanup(lambda: setattr(server, "RECOMMENDER_MODEL_PATH", original_model_path))
        self.addCleanup(server.RECOMMENDER_MODEL_CACHE.clear)
        self.addCleanup(server.RECOMMENDATION_CACHE.clear)
        self.conn.execute(
            "INSERT INTO search_history(user_id,keyword,created_at) VALUES(?,?,?)",
            (self.user_id, "space galaxy", server.now()),
        )
        self.conn.commit()

        rows = server.recommendations(self.conn, self.user_id, 5)

        self.assertGreater(len(rows), 0)
        first = rows[0]
        self.assertEqual(first["recommendation_method"], "popularity_fallback")
        self.assertNotIn("score_breakdown", first)
        self.assertGreaterEqual(first["ml_score"], 0)
        self.assertLessEqual(first["ml_score"], 1)

    def test_favorite_activates_svd_collaborative_recommendations(self) -> None:
        favorite_book_id = self.conn.execute("SELECT id FROM books WHERE book_id='1'").fetchone()["id"]
        self.conn.execute(
            "INSERT INTO favorites(user_id,book_id,created_at) VALUES(?,?,?)",
            (self.user_id, favorite_book_id, server.now()),
        )
        self.conn.commit()

        rows = server.recommendations(self.conn, self.user_id, 10)

        self.assertGreater(len(rows), 0)
        self.assertTrue(any(row["recommendation_method"] == "svd_collaborative_filtering" for row in rows))
        self.assertTrue(all(row["id"] != favorite_book_id for row in rows))

    def test_search_history_activates_content_cold_start_when_model_available(self) -> None:
        self.conn.execute(
            "INSERT INTO search_history(user_id,keyword,created_at) VALUES(?,?,?)",
            (self.user_id, "space galaxy", server.now()),
        )
        self.conn.commit()

        rows = server.recommendations(self.conn, self.user_id, 10)

        self.assertGreater(len(rows), 0)
        self.assertTrue(any(row["recommendation_method"] == "content_cold_start" for row in rows))
