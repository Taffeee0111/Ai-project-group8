from __future__ import annotations

import unittest

import backend.server as server


class ServerStartupMessagesTest(unittest.TestCase):
    def test_port_bind_error_message_mentions_port_and_alternate_port(self) -> None:
        message = server.port_bind_error_message(8000)

        self.assertIn("Port 8000 is already in use", message)
        self.assertIn("PORT=8001", message)
        self.assertIn("127.0.0.1:8000", message)

    def test_main_prints_database_initialization_progress_messages(self) -> None:
        source = server.Path(server.__file__).read_text(encoding="utf-8")

        self.assertIn("Checking and preparing the local database", source)
        self.assertIn("Importing book data", source)
        self.assertIn("Database is ready", source)


if __name__ == "__main__":
    unittest.main()
