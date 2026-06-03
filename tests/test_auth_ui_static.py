from pathlib import Path
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[1]
INDEX_HTML = PROJECT_ROOT / "frontend" / "static" / "index.html"
APP_JS = PROJECT_ROOT / "frontend" / "static" / "app.js"


class AuthUiStaticTest(unittest.TestCase):
    def test_registration_ui_uses_sign_up_copy(self) -> None:
        html = INDEX_HTML.read_text(encoding="utf-8")
        script = APP_JS.read_text(encoding="utf-8")

        self.assertIn('<button class="tab" id="registerTab">Sign Up</button>', html)
        self.assertIn('login: ["Sign In / Sign Up", ""]', script)
        self.assertIn('submitButton.textContent = isRegister ? "Signing up..." : "Signing in...";', script)
        self.assertIn('qs("#authSubmit").textContent = register ? "Sign Up" : "Sign In";', script)
        self.assertIn('qs("#authMessage").textContent = register ? "Create a new account." : "Demo account: demo / demo123";', script)
        self.assertNotIn(">Register<", html)
        self.assertNotIn("Sign In / Register", script)
        self.assertNotIn('"Register"', script)
