# Goodreads 10k Dataset Summary

- Books: 10000
- Source XML files: /Users/tubai/Desktop/books_xml
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
- books_10k.csv: book metadata for recommendation features.
- book_shelves_10k.csv: top Goodreads shelf tags per book.
- interactions_10k.csv: sampled user-book interactions for the selected books.
- book_id_map_10k.csv: mapping between original interaction CSV book IDs and Goodreads book IDs.
- interactions_summary.md: interaction sample statistics.
- README.md: this summary.

## Notes
- estimated_word_count is derived from num_pages * 275 and is not an observed Goodreads field.
- interactions_10k.csv was sampled from the first 100MB range of the public Goodreads interactions CSV, with a cap of 500 kept interactions per selected book.
