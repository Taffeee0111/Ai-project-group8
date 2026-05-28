from pathlib import Path
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[1]
APP_JS = PROJECT_ROOT / "frontend" / "static" / "app.js"


class RecommendationUiStaticTest(unittest.TestCase):
    def test_recommendation_ui_renders_hybrid_breakdown_without_details_toggle(self) -> None:
        source = APP_JS.read_text(encoding="utf-8")

        self.assertIn("modelWeights", source)
        self.assertIn("score_breakdown", source)
        self.assertIn("recommendation-score-breakdown", source)
        self.assertIn("profileGenres", source)
        self.assertIn("bookCard(book, { favoriteToggle: true, recommendationMeta: true })", source)
