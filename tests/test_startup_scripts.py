from __future__ import annotations

import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]


class StartupScriptsTest(unittest.TestCase):
    def read_text(self, relative_path: str) -> str:
        return (PROJECT_ROOT / relative_path).read_text(encoding="utf-8")

    def test_unix_setup_script_creates_venv_installs_requirements_and_offers_model_training(self) -> None:
        script = self.read_text("setup.command")

        self.assertIn("python3 -m venv .venv", script)
        self.assertIn(".venv/bin/python -m pip install -r requirements.txt", script)
        self.assertIn("This may take a few minutes", script)
        self.assertIn("backend/ml/train_recommender.py", script)
        self.assertIn("Train recommender model now?", script)
        self.assertIn("You can skip this and still use the app", script)
        self.assertIn("rerun setup later", script)

    def test_windows_setup_script_creates_venv_installs_requirements_and_offers_model_training(self) -> None:
        script = self.read_text("setup.bat")

        self.assertIn("python -m venv .venv", script)
        self.assertIn("py -3 -m venv .venv", script)
        self.assertIn(".venv\\Scripts\\python.exe -m pip install -r requirements.txt", script)
        self.assertIn("This may take a few minutes", script)
        self.assertIn("backend\\ml\\train_recommender.py", script)
        self.assertIn("Train recommender model now?", script)
        self.assertIn("You can skip this and still use the app", script)
        self.assertIn("rerun setup later", script)

    def test_start_scripts_require_local_virtual_environment(self) -> None:
        unix_script = self.read_text("start_server.command")
        windows_script = self.read_text("start_server.bat")

        self.assertIn(".venv/bin/python", unix_script)
        self.assertIn("Run ./setup.command first", unix_script)
        self.assertNotIn("python3 backend/server.py", unix_script)

        self.assertIn(".venv\\Scripts\\python.exe", windows_script)
        self.assertIn("Run setup.bat first", windows_script)
        self.assertNotIn("C:\\Users\\Lenovo", windows_script)

    def test_gitignore_excludes_local_environment_outputs(self) -> None:
        gitignore = self.read_text(".gitignore")

        self.assertIn(".venv/", gitignore)
        self.assertIn("backend/data/library.db", gitignore)
        self.assertIn("backend/data/models/*.joblib", gitignore)


if __name__ == "__main__":
    unittest.main()
