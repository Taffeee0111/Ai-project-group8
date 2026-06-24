# Interactions Summary

- Source: UCSD Goodreads Book Graph interaction data
- Source URL: https://cseweb.ucsd.edu/~jmcauley/datasets/goodreads.html
- Permitted use: academic use only; do not redistribute or use commercially
- Selected Goodreads book IDs: 10000
- Matched internal interaction book IDs: 9996
- Raw interaction rows scanned: 6107259
- Filtered interaction rows kept: 1129910
- Books with at least one kept interaction: 9995
- Unique users in kept interactions: 12022
- Max interactions per book: 500

## Notes
- user_id_csv is the anonymized integer user ID from the Goodreads interaction CSV.
- book_id is the Goodreads book ID used in books_10k.csv.
- book_id_csv is the internal integer ID used by the original interaction CSV.
- These rows are used for offline collaborative filtering training by `backend/ml/train_recommender.py`; they are not imported into SQLite during normal server startup.
- A trained model is written to `backend/data/models/recommender.joblib` and can be regenerated from this CSV plus `books_10k.csv`.
