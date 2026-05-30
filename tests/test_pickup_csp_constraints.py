from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch


PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

import backend.server as server


class PickupCspConstraintsTest(unittest.TestCase):
    def test_normal_search_does_not_emit_constraint_stats(self) -> None:
        result = server.search_path(server.ENTRANCE, server.DEFAULT_SEAT, "bfs")

        self.assertIsNotNone(result["distance"])
        self.assertNotIn("constraintStats", result)
        self.assertNotIn("constraintsEnabled", result)

    def test_enabled_search_adds_pruned_domain_stats(self) -> None:
        normal = server.search_path(server.ENTRANCE, server.DEFAULT_SEAT, "bfs")
        constrained = server.search_path(server.ENTRANCE, server.DEFAULT_SEAT, "bfs", constraints_enabled=True)
        stats = constrained["constraintStats"]

        self.assertTrue(constrained["constraintsEnabled"])
        self.assertEqual(normal["distance"], constrained["distance"])
        self.assertLess(stats["allowedCells"], stats["originalCells"])
        self.assertGreater(stats["prunedCells"], 0)
        self.assertIn("cspRuntimeMs", stats)

    def test_enabled_search_falls_back_when_pruned_domain_is_unreachable(self) -> None:
        start = server.ENTRANCE
        target = server.DEFAULT_SEAT
        normal = server.search_path(start, target, "bfs")
        forced_domain = {
            "allowed": {start},
            "originalCells": 10,
            "allowedCells": 1,
            "prunedCells": 9,
            "fallbackSegments": 0,
            "cspRuntimeMs": 0.0,
        }

        with patch.object(server, "csp_path_domain", return_value=forced_domain):
            result = server.search_path(start, target, "bfs", constraints_enabled=True)

        self.assertEqual(normal["distance"], result["distance"])
        self.assertEqual(1, result["constraintStats"]["fallbackSegments"])
        self.assertGreater(result["expanded"], normal["expanded"])

    def test_csp_runtime_is_subtracted_from_path_runtime(self) -> None:
        start = server.ENTRANCE
        target = server.DEFAULT_SEAT
        forced_domain = {
            "allowed": {start},
            "originalCells": 10,
            "allowedCells": 1,
            "prunedCells": 9,
            "fallbackSegments": 0,
            "cspRuntimeMs": 2.5,
        }

        with (
            patch.object(server, "csp_path_domain", return_value=forced_domain),
            patch.object(server, "elapsed", return_value=9.0),
        ):
            result = server.search_path(start, target, "bfs", constraints_enabled=True)

        self.assertEqual(6.5, result["runtimeMs"])
