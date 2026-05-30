# Goodreads 10k Dataset Summary

- Books: 10000
- Source XML files: local generation input, not required by the app at runtime
- Minimum ratings_count: 2718
- Median ratings_count: 21168
- Maximum ratings_count: 4784860
- Books with page counts: 9101
- Median pages: 337

## Top inferred genres
- fiction: 9994
- fantasy: 4417
- romance: 4282
- history_biography: 4244
- mystery_thriller_crime: 4204
- young_adult: 4069
- nonfiction: 3397
- science_fiction: 3194
- classics: 2631
- children: 1469
- horror: 1075
- comics_graphic: 991
- poetry: 386

## Files
- books_10k.csv: book metadata used by the app database import and by the TF-IDF cold-start recommender.
- book_shelves_10k.csv: top Goodreads shelf tags per book; shelf tags are also denormalized into `books_10k.csv` as `top_shelves`.
- interactions_10k.csv: sampled user-book interactions used by `backend/ml/train_recommender.py` to train the SVD collaborative filtering model.
- book_id_map_10k.csv: mapping between original interaction CSV book IDs and Goodreads book IDs.
- interactions_summary.md: interaction sample statistics.
- README.md: this summary.

## Notes
- estimated_word_count is derived from num_pages * 275 and is not an observed Goodreads field.
- interactions_10k.csv was sampled from the first 100MB range of the public Goodreads interactions CSV, with a cap of 500 kept interactions per selected book.
- The current app does not import `interactions_10k.csv`, `book_shelves_10k.csv`, or `book_id_map_10k.csv` into SQLite at startup. The interaction CSV is consumed by offline model training instead.
- Train the recommender from the project root with `python3 backend/ml/train_recommender.py`, or run the project setup script and choose model training when prompted. The generated `backend/data/models/recommender.joblib` file is local output and is ignored by Git.
- Model training is optional for first-time users. If the model is missing, the app still runs and uses popular high-rated books as fallback recommendations.
