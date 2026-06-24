# Goodreads 10k Dataset Summary

- Books: 10000
- Minimum ratings_count: 2718
- Median ratings_count: 21168
- Maximum ratings_count: 4784860
- Books with page counts: 9101
- Median pages: 337

## Provenance and usage conditions

These files are processed academic-use subsets derived from two related sources:

1. **Goodbooks-10k**, created by Zygmunt Zajac, provides the popular-book
   selection used to define the 10,000-book scope.
   - Repository: https://github.com/zygmuntz/goodbooks-10k
   - License: Creative Commons Attribution-ShareAlike 4.0 International
   - License URL: https://creativecommons.org/licenses/by-sa/4.0/

2. **UCSD Goodreads Book Graph**, collected in late 2017 by Mengting Wan and
   Julian McAuley's research group, provides detailed book metadata, public shelf
   information, and anonymized user-book interactions.
   - Dataset page: https://cseweb.ucsd.edu/~jmcauley/datasets/goodreads.html
   - Usage conditions: academic use only; the source page asks users not to
     redistribute the data or use it commercially.
   - Privacy: the source states that only public shelves were collected and user
     and review IDs were anonymized.

The two sources do not share one common license. Goodbooks-10k is CC BY-SA 4.0,
while the UCSD-derived fields and interactions remain subject to the UCSD academic
use restrictions. Do not publicly or commercially redistribute these derived CSV
files without confirming permission.

## Processing performed for this project

- `books_10k.csv` combines the selected book IDs with processed UCSD metadata,
  shelf tags, descriptions, ratings, and project-inferred genre labels.
- `interactions_10k.csv` was filtered from the UCSD interaction data to selected
  books, with a maximum of 500 retained interactions per book.
- `user_id_csv` remains an anonymized source identifier.
- `estimated_word_count` is calculated by this project as `num_pages * 275`; it
  is not an observed Goodreads or UCSD field.

## Citation-ready references

Use these references in the report and presentation:

- Zajac, Z. (2017). *Goodbooks-10k: Ten thousand books, six million ratings*.
  GitHub repository. https://github.com/zygmuntz/goodbooks-10k
  (accessed 10 June 2026).
- Wan, M. and McAuley, J. (2018). "Item Recommendation on Monotonic Behavior
  Chains." In *Proceedings of the 12th ACM Conference on Recommender Systems
  (RecSys '18)*. https://doi.org/10.1145/3240323.3240369
- Wan, M., Misra, R., Nakashole, N. and McAuley, J. (2019). "Fine-Grained
  Spoiler Detection from Large-Scale Review Corpora." In *Proceedings of ACL
  2019*. https://doi.org/10.18653/v1/P19-1248
- Wan, M. and McAuley, J. *Goodreads Book Graph Datasets*. UCSD.
  https://cseweb.ucsd.edu/~jmcauley/datasets/goodreads.html
  (accessed 10 June 2026).

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
- interactions_10k.csv: sampled user-book interactions used by `backend/ml/train_recommender.py` to train the SVD collaborative filtering model.
- interactions_summary.md: interaction sample statistics.
- README.md: this summary.

## Notes
- interactions_10k.csv was sampled from the first 100MB range of the public Goodreads interactions CSV, with a cap of 500 kept interactions per selected book.
- Goodreads shelf tags needed by the app and content recommender are stored in the `top_shelves` column of `books_10k.csv`.
- The app does not import `interactions_10k.csv` into SQLite at startup. This CSV is consumed only by offline model training.
- Train the recommender from the project root with `python3 backend/ml/train_recommender.py`, or run the project setup script and choose model training when prompted. The generated `backend/data/models/recommender.joblib` file is local output and is ignored by Git.
- Model training is optional for first-time users. If the model is missing, the app still runs and uses popular high-rated books as fallback recommendations.
