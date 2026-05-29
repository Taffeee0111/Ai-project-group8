from __future__ import annotations

import csv
import tempfile
import unittest
from pathlib import Path

from backend.ml.train_recommender import train_recommender


BOOK_COLUMNS = [
    "book_id",
    "work_id",
    "title",
    "original_title",
    "authors",
    "author_ids",
    "publisher",
    "publication_year",
    "original_publication_year",
    "language_code",
    "isbn",
    "isbn13",
    "format",
    "num_pages",
    "estimated_word_count",
    "word_count_source",
    "average_rating",
    "ratings_count",
    "text_reviews_count",
    "work_ratings_count",
    "work_text_reviews_count",
    "rating_5_count",
    "rating_4_count",
    "rating_3_count",
    "rating_2_count",
    "rating_1_count",
    "rating_total_count",
    "genres",
    "top_shelves",
    "description",
    "url",
    "image_url",
]


class MlRecommenderTrainingTest(unittest.TestCase):
    def test_training_writes_svd_and_content_model(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            tempdir = Path(temp)
            books_csv = tempdir / "books.csv"
            interactions_csv = tempdir / "interactions.csv"
            output_path = tempdir / "recommender.joblib"
            self.write_books(books_csv)
            self.write_interactions(interactions_csv)

            result = train_recommender(
                books_csv=books_csv,
                interactions_csv=interactions_csv,
                output_path=output_path,
                n_components=2,
                max_features=32,
            )

            self.assertTrue(output_path.exists())
            self.assertEqual(result["book_count"], 4)
            self.assertEqual(result["interaction_count"], 7)
            self.assertEqual(result["embedding_dim"], 2)
            self.assertGreaterEqual(result["mean_positive_similarity"], 0)
            self.assertLessEqual(result["mean_positive_similarity"], 1)

            model = result["model"]
            self.assertEqual(set(model["book_id_to_index"]), {"1", "2", "3", "4"})
            self.assertEqual(model["item_factors"].shape, (4, 2))
            self.assertIn("tfidf_vectorizer", model)
            self.assertEqual(model["content_matrix"].shape[0], 4)
            self.assertEqual(model["metadata"]["algorithm"], "truncated_svd_collaborative_filtering")

    @staticmethod
    def write_books(path: Path) -> None:
        rows = [
            {"book_id": "1", "title": "Space Journey", "authors": "Ada Star", "average_rating": "4.5", "ratings_count": "1000", "genres": "science_fiction", "top_shelves": "space:10", "description": "space ship adventure"},
            {"book_id": "2", "title": "Galaxy Wars", "authors": "Ada Star", "average_rating": "4.2", "ratings_count": "800", "genres": "science_fiction", "top_shelves": "space:8", "description": "galaxy adventure"},
            {"book_id": "3", "title": "Garden Poems", "authors": "Lin Green", "average_rating": "3.9", "ratings_count": "300", "genres": "poetry", "top_shelves": "poetry:5", "description": "quiet garden poems"},
            {"book_id": "4", "title": "Forest Poems", "authors": "Lin Green", "average_rating": "4.1", "ratings_count": "200", "genres": "poetry", "top_shelves": "poetry:6", "description": "forest nature poems"},
        ]
        with path.open("w", newline="", encoding="utf-8") as file:
            writer = csv.DictWriter(file, fieldnames=BOOK_COLUMNS)
            writer.writeheader()
            for row in rows:
                writer.writerow({column: row.get(column, "") for column in BOOK_COLUMNS})

    @staticmethod
    def write_interactions(path: Path) -> None:
        rows = [
            {"user_id_csv": "10", "book_id": "1", "book_id_csv": "1", "is_read": "1", "rating": "5", "is_reviewed": "1"},
            {"user_id_csv": "10", "book_id": "2", "book_id_csv": "2", "is_read": "1", "rating": "4", "is_reviewed": "0"},
            {"user_id_csv": "11", "book_id": "1", "book_id_csv": "1", "is_read": "1", "rating": "5", "is_reviewed": "0"},
            {"user_id_csv": "11", "book_id": "2", "book_id_csv": "2", "is_read": "1", "rating": "5", "is_reviewed": "1"},
            {"user_id_csv": "12", "book_id": "3", "book_id_csv": "3", "is_read": "1", "rating": "5", "is_reviewed": "1"},
            {"user_id_csv": "12", "book_id": "4", "book_id_csv": "4", "is_read": "1", "rating": "4", "is_reviewed": "0"},
            {"user_id_csv": "13", "book_id": "4", "book_id_csv": "4", "is_read": "1", "rating": "5", "is_reviewed": "1"},
        ]
        with path.open("w", newline="", encoding="utf-8") as file:
            writer = csv.DictWriter(file, fieldnames=["user_id_csv", "book_id", "book_id_csv", "is_read", "rating", "is_reviewed"])
            writer.writeheader()
            writer.writerows(rows)
