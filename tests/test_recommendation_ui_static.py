from pathlib import Path
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[1]
APP_JS = PROJECT_ROOT / "frontend" / "static" / "app.js"


class RecommendationUiStaticTest(unittest.TestCase):
    def test_recommendation_ui_omits_hybrid_score_breakdown(self) -> None:
        source = APP_JS.read_text(encoding="utf-8")

        self.assertNotIn("modelWeights", source)
        self.assertNotIn("score_breakdown", source)
        self.assertNotIn("recommendation-score-breakdown", source)
        self.assertIn("profileGenres", source)
        self.assertIn("modelStatus", source)
        self.assertIn("bookCard(book, { favoriteToggle: true })", source)
        self.assertNotIn("Recommendation reason:", source)
        self.assertIn("data.summary ? `<div class=\"ml-summary\">", source)

    def test_profile_keywords_hide_debug_weights_but_genres_keep_counts(self) -> None:
        source = APP_JS.read_text(encoding="utf-8")
        keyword_block = source[source.index('<div class="ml-keywords">') : source.index('<div class="ml-keywords profile-genres">')]
        genre_block = source[source.index('<div class="ml-keywords profile-genres">') : source.index("</div>", source.index('<div class="ml-keywords profile-genres">'))]

        self.assertIn("${escapeHtml(item.term)}", keyword_block)
        self.assertNotIn("${item.weight}", keyword_block)
        self.assertIn("${item.weight}", genre_block)

    def test_recommendations_are_deduped_and_not_refreshed_by_passive_search(self) -> None:
        source = APP_JS.read_text(encoding="utf-8")

        search_page_block = source[source.index('if (page === "search")') : source.index('if (page === "pickup")')]
        search_books_block = source[source.index("async function searchBooks") : source.index("function searchFilterParams")]
        self.assertNotIn("loadRecommendations()", search_page_block)
        self.assertNotIn("loadRecommendations()", search_books_block)
        self.assertIn("scheduleRecommendationRefresh", source)
        self.assertIn("recommendationRequestId", source)

    def test_favorite_buttons_update_optimistically(self) -> None:
        source = APP_JS.read_text(encoding="utf-8")

        self.assertIn("setFavoriteButtonsState", source)
        self.assertIn("button.disabled = disabled", source)
        self.assertIn("scheduleRecommendationRefresh", source)

    def test_model_unavailable_state_explains_fallback_recommendations(self) -> None:
        source = APP_JS.read_text(encoding="utf-8")

        self.assertIn("You can use the app without a trained model. Popular highly rated books are shown now.", source)
        self.assertIn("Model loading failed. Showing popular recommendations instead.", source)
        self.assertIn("modelStatus.reason", source)
