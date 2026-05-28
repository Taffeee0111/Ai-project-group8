from pathlib import Path
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[1]
APP_JS = PROJECT_ROOT / "frontend" / "static" / "app.js"


class BookCardMarkupTest(unittest.TestCase):
    def test_search_book_cards_have_collapsible_details(self) -> None:
        source = APP_JS.read_text(encoding="utf-8")

        self.assertIn("book-card-summary", source)
        self.assertIn("book-card-details", source)
        self.assertIn("data-book-details-toggle", source)
        self.assertIn("aria-expanded", source)
