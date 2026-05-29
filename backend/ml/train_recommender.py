from __future__ import annotations

import argparse
import csv
from collections import defaultdict
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_BOOKS_CSV = PROJECT_ROOT / "backend" / "data" / "dataset" / "books_10k.csv"
DEFAULT_INTERACTIONS_CSV = PROJECT_ROOT / "backend" / "data" / "dataset" / "interactions_10k.csv"
DEFAULT_OUTPUT_PATH = PROJECT_ROOT / "backend" / "data" / "models" / "recommender.joblib"


def book_document(row: dict[str, str]) -> str:
    fields = (
        "title",
        "original_title",
        "authors",
        "publisher",
        "genres",
        "top_shelves",
        "description",
    )
    return " ".join(str(row.get(field) or "") for field in fields)


def interaction_strength(row: dict[str, str]) -> float:
    rating = int_or_zero(row.get("rating"))
    is_read = int_or_zero(row.get("is_read"))
    is_reviewed = int_or_zero(row.get("is_reviewed"))
    if rating <= 0 and not is_read and not is_reviewed:
        return 0.0
    return (rating / 5.0 if rating else 0.35) + (0.25 if is_read else 0.0) + (0.2 if is_reviewed else 0.0)


def int_or_zero(value: str | None) -> int:
    try:
        return int(float(value or 0))
    except ValueError:
        return 0


def load_books(path: Path) -> tuple[list[str], list[str], dict[str, dict[str, Any]]]:
    book_ids: list[str] = []
    documents: list[str] = []
    metadata: dict[str, dict[str, Any]] = {}
    with path.open(newline="", encoding="utf-8") as file:
        for row in csv.DictReader(file):
            book_id = str(row.get("book_id") or "").strip()
            if not book_id:
                continue
            book_ids.append(book_id)
            documents.append(book_document(row))
            metadata[book_id] = {
                "average_rating": float_or_zero(row.get("average_rating")),
                "ratings_count": int_or_zero(row.get("ratings_count")),
                "title": row.get("title") or row.get("original_title") or "",
            }
    return book_ids, documents, metadata


def float_or_zero(value: str | None) -> float:
    try:
        return float(value or 0)
    except ValueError:
        return 0.0


def train_recommender(
    books_csv: Path = DEFAULT_BOOKS_CSV,
    interactions_csv: Path = DEFAULT_INTERACTIONS_CSV,
    output_path: Path = DEFAULT_OUTPUT_PATH,
    n_components: int = 48,
    max_features: int = 12000,
) -> dict[str, Any]:
    import joblib
    import numpy as np
    from scipy.sparse import csr_matrix
    from sklearn.decomposition import TruncatedSVD
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.preprocessing import normalize

    book_ids, documents, book_metadata = load_books(books_csv)
    if not book_ids:
        raise ValueError(f"No books found in {books_csv}")

    book_id_to_index = {book_id: index for index, book_id in enumerate(book_ids)}
    user_id_to_index: dict[str, int] = {}
    row_indices: list[int] = []
    col_indices: list[int] = []
    strengths: list[float] = []
    positives_by_user: dict[str, list[str]] = defaultdict(list)

    with interactions_csv.open(newline="", encoding="utf-8") as file:
        for row in csv.DictReader(file):
            book_id = str(row.get("book_id") or "").strip()
            if book_id not in book_id_to_index:
                continue
            strength = interaction_strength(row)
            if strength <= 0:
                continue
            user_id = str(row.get("user_id_csv") or "").strip()
            if not user_id:
                continue
            user_index = user_id_to_index.setdefault(user_id, len(user_id_to_index))
            row_indices.append(book_id_to_index[book_id])
            col_indices.append(user_index)
            strengths.append(strength)
            positives_by_user[user_id].append(book_id)

    if not strengths:
        raise ValueError(f"No positive interactions found in {interactions_csv}")

    item_user = csr_matrix(
        (strengths, (row_indices, col_indices)),
        shape=(len(book_ids), len(user_id_to_index)),
        dtype=float,
    )
    max_components = max(1, min(n_components, min(item_user.shape) - 1))
    svd = TruncatedSVD(n_components=max_components, algorithm="arpack", random_state=42)
    item_factors = normalize(svd.fit_transform(item_user))

    vectorizer = TfidfVectorizer(max_features=max_features, token_pattern=r"(?u)\b\w\w+\b")
    content_matrix = normalize(vectorizer.fit_transform(documents))

    model = {
        "version": 1,
        "book_ids": book_ids,
        "book_id_to_index": book_id_to_index,
        "item_factors": item_factors,
        "tfidf_vectorizer": vectorizer,
        "content_matrix": content_matrix,
        "book_metadata": book_metadata,
        "metadata": {
            "algorithm": "truncated_svd_collaborative_filtering",
            "book_count": len(book_ids),
            "user_count": len(user_id_to_index),
            "interaction_count": len(strengths),
            "embedding_dim": int(item_factors.shape[1]),
            "content_max_features": max_features,
        },
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, output_path)

    mean_positive_similarity = positive_pair_similarity(item_factors, book_id_to_index, positives_by_user)
    return {
        "model": model,
        "output_path": str(output_path),
        "book_count": len(book_ids),
        "user_count": len(user_id_to_index),
        "interaction_count": len(strengths),
        "embedding_dim": int(item_factors.shape[1]),
        "mean_positive_similarity": mean_positive_similarity,
    }


def positive_pair_similarity(item_factors: Any, book_id_to_index: dict[str, int], positives_by_user: dict[str, list[str]]) -> float:
    import numpy as np

    values: list[float] = []
    for book_ids in positives_by_user.values():
        indices = [book_id_to_index[book_id] for book_id in book_ids if book_id in book_id_to_index]
        if len(indices) < 2:
            continue
        first = indices[0]
        for index in indices[1:4]:
            similarity = float(np.dot(item_factors[first], item_factors[index]))
            values.append(max(0.0, min(1.0, similarity)))
    if not values:
        return 0.0
    return round(float(sum(values) / len(values)), 4)


def main() -> None:
    parser = argparse.ArgumentParser(description="Train the library recommender model.")
    parser.add_argument("--books-csv", type=Path, default=DEFAULT_BOOKS_CSV)
    parser.add_argument("--interactions-csv", type=Path, default=DEFAULT_INTERACTIONS_CSV)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT_PATH)
    parser.add_argument("--components", type=int, default=48)
    parser.add_argument("--max-features", type=int, default=12000)
    args = parser.parse_args()

    result = train_recommender(
        books_csv=args.books_csv,
        interactions_csv=args.interactions_csv,
        output_path=args.output,
        n_components=args.components,
        max_features=args.max_features,
    )
    print(f"Model: {result['output_path']}")
    print(f"Books: {result['book_count']}")
    print(f"Users: {result['user_count']}")
    print(f"Positive interactions: {result['interaction_count']}")
    print(f"Embedding dim: {result['embedding_dim']}")
    print(f"Mean positive similarity: {result['mean_positive_similarity']}")


if __name__ == "__main__":
    main()
