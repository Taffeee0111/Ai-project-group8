from pathlib import Path
import importlib.util
import unittest
from unittest.mock import patch


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SERVER_PATH = PROJECT_ROOT / "backend" / "server.py"

spec = importlib.util.spec_from_file_location("library_server", SERVER_PATH)
server = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(server)


class PickupConstraintLayerTest(unittest.TestCase):
    def test_branch_bound_is_not_a_valid_order_method(self) -> None:
        self.assertEqual(server.normalize_order_method("branch_bound"), "branch_bound")
        self.assertEqual(server.normalize_method("branch_bound"), "greedy")
        self.assertEqual(server.normalize_method("csp"), "greedy")

    def test_redundant_constraint_layers_are_removed(self) -> None:
        self.assertFalse(hasattr(server, "build_constraint_context"))
        self.assertFalse(hasattr(server, "apply_arc_consistency"))
        self.assertFalse(hasattr(server, "build_candidate_edge_context"))
        self.assertFalse(hasattr(server, "build_library_gate_index"))

    def test_pre_path_context_reports_saved_path_queries_before_search(self) -> None:
        targets = [
            {"id": 1, "book_id": "A", "title": "A", "shelf_id": "S1", "row": 2, "col": 2, "pickup": [2, 1]},
            {"id": 2, "book_id": "B", "title": "B", "shelf_id": "S1", "row": 2, "col": 2, "pickup": [2, 1]},
            {"id": 3, "book_id": "C", "title": "C", "shelf_id": "S1", "row": 2, "col": 2, "pickup": [2, 1]},
            {"id": 4, "book_id": "D", "title": "D", "shelf_id": "S1", "row": 2, "col": 2, "pickup": [2, 1]},
            {"id": 5, "book_id": "E", "title": "E", "shelf_id": "S2", "row": 2, "col": 6, "pickup": [2, 5]},
            {"id": 6, "book_id": "F", "title": "F", "shelf_id": "S3", "row": 2, "col": 10, "pickup": [2, 9]},
            {"id": 7, "book_id": "G", "title": "G", "shelf_id": "S4", "row": 2, "col": 14, "pickup": [2, 13]},
            {"id": 8, "book_id": "H", "title": "H", "shelf_id": "S5", "row": 2, "col": 18, "pickup": [2, 17]},
        ]

        context = server.build_pre_path_constraint_context(targets)

        self.assertEqual(len(context["targets"]), 5)
        self.assertEqual(context["stats"]["originalTargets"], 8)
        self.assertEqual(context["stats"]["reducedTargets"], 5)
        self.assertEqual(context["stats"]["mergedBooks"], 3)
        self.assertEqual(context["stats"]["pathQueriesOriginal"], 90)
        self.assertEqual(context["stats"]["pathQueriesBaseline"], 42)
        self.assertEqual(context["stats"]["pathQueriesSaved"], 48)

    def test_constraints_skip_precompute_for_constrained_greedy_2opt(self) -> None:
        targets = [
            {"id": 1, "book_id": "A", "title": "A", "shelf_id": "S1", "row": 2, "col": 2, "pickup": [2, 1]},
            {"id": 2, "book_id": "B", "title": "B", "shelf_id": "S1", "row": 2, "col": 2, "pickup": [2, 1]},
            {"id": 3, "book_id": "C", "title": "C", "shelf_id": "S1", "row": 2, "col": 2, "pickup": [2, 1]},
            {"id": 4, "book_id": "D", "title": "D", "shelf_id": "S1", "row": 2, "col": 2, "pickup": [2, 1]},
            {"id": 5, "book_id": "E", "title": "E", "shelf_id": "S2", "row": 2, "col": 6, "pickup": [2, 5]},
            {"id": 6, "book_id": "F", "title": "F", "shelf_id": "S3", "row": 2, "col": 10, "pickup": [2, 9]},
            {"id": 7, "book_id": "G", "title": "G", "shelf_id": "S4", "row": 2, "col": 14, "pickup": [2, 13]},
            {"id": 8, "book_id": "H", "title": "H", "shelf_id": "S5", "row": 2, "col": 18, "pickup": [2, 17]},
        ]
        searched = []

        def fake_search_path(start, target, algorithm):
            searched.append((start, target))
            return {"distance": abs(start[0] - target[0]) + abs(start[1] - target[1]) + 1, "path": [[start[0], start[1]], [target[0], target[1]]], "expanded": 1, "runtimeMs": 0}

        with (
            patch.object(server, "pickup_targets", return_value=targets),
            patch.object(server, "precompute_paths", side_effect=AssertionError("constrained 2-opt should use lazy path queries")),
            patch.object(server, "search_path", side_effect=fake_search_path),
        ):
            plan = server.solve_pickup(None, [target["id"] for target in targets], "astar_manhattan", "greedy_2opt", server.DEFAULT_SEAT, True)

        self.assertEqual(plan["constraintStats"]["pathQueriesSaved"], 48)
        self.assertEqual(plan["precomputeExpanded"], 0)
        self.assertLess(plan["constraintStats"]["pathQueriesExecuted"], plan["constraintStats"]["pathQueriesOriginal"])
        self.assertLess(len(searched), plan["constraintStats"]["pathQueriesOriginal"])

    def test_constrained_greedy_uses_reduced_targets_without_all_pairs_precompute(self) -> None:
        targets = [
            {"id": 1, "book_id": "A", "title": "A", "shelf_id": "S1", "row": 2, "col": 2, "pickup": [2, 1]},
            {"id": 2, "book_id": "B", "title": "B", "shelf_id": "S1", "row": 2, "col": 2, "pickup": [2, 1]},
            {"id": 3, "book_id": "C", "title": "C", "shelf_id": "S2", "row": 2, "col": 6, "pickup": [2, 5]},
        ]
        searched = []

        def fake_search_path(start, target, algorithm):
            searched.append((start, target))
            return {"distance": abs(start[0] - target[0]) + abs(start[1] - target[1]) + 1, "path": [[start[0], start[1]], [target[0], target[1]]], "expanded": 1, "runtimeMs": 0}

        with (
            patch.object(server, "pickup_targets", return_value=targets),
            patch.object(server, "precompute_paths", side_effect=AssertionError("greedy should not precompute all pairs")),
            patch.object(server, "search_path", side_effect=fake_search_path),
        ):
            plan = server.solve_pickup(None, [1, 2, 3], "astar_manhattan", "greedy", server.DEFAULT_SEAT, True)

        self.assertEqual(plan["constraintStats"]["reducedTargets"], 2)
        self.assertEqual(plan["constraintStats"]["pathQueriesSaved"], 8)
        self.assertEqual([book["id"] for book in plan["visitOrder"]], [1, 2, 3])
        self.assertLessEqual(len(searched), 4)

    def test_constrained_greedy_2opt_uses_lazy_path_queries(self) -> None:
        targets = [
            {"id": idx, "book_id": str(idx), "title": str(idx), "shelf_id": f"S{idx}", "row": 2, "col": idx * 2, "pickup": [2, idx * 2 - 1]}
            for idx in range(1, 7)
        ]
        searched = []

        def fake_search_path(start, target, algorithm):
            searched.append((start, target))
            return {"distance": abs(start[0] - target[0]) + abs(start[1] - target[1]) + 1, "path": [[start[0], start[1]], [target[0], target[1]]], "expanded": 1, "runtimeMs": 0}

        with (
            patch.object(server, "pickup_targets", return_value=targets),
            patch.object(server, "precompute_paths", side_effect=AssertionError("constrained 2-opt should not precompute all pairs")),
            patch.object(server, "search_path", side_effect=fake_search_path),
        ):
            plan = server.solve_pickup(None, [target["id"] for target in targets], "astar_manhattan", "greedy_2opt", server.DEFAULT_SEAT, True)

        self.assertEqual([book["id"] for book in plan["visitOrder"]], [target["id"] for target in targets])
        self.assertEqual(plan["precomputeExpanded"], 0)
        self.assertLess(plan["constraintStats"]["pathQueriesExecuted"], plan["constraintStats"]["pathQueriesBaseline"])
        self.assertLess(len(searched), server.directed_path_query_count(len(targets)))

    def test_constraint_and_path_timings_are_reported_separately(self) -> None:
        targets = [
            {"id": 1, "book_id": "A", "title": "A", "shelf_id": "S1", "row": 2, "col": 2, "pickup": [2, 1]},
            {"id": 2, "book_id": "B", "title": "B", "shelf_id": "S2", "row": 2, "col": 6, "pickup": [2, 5]},
        ]

        def fake_search_path(start, target, algorithm):
            return {"distance": 1, "path": [[start[0], start[1]], [target[0], target[1]]], "expanded": 1, "runtimeMs": 2.5}

        server.PICKUP_PATH_CACHE.clear()
        unconstrained_plan = {"runtimeMs": 7.5, "pathExpanded": 3, "solverExpanded": 3}
        with patch.object(server, "pickup_targets", return_value=targets), patch.object(server, "search_path", side_effect=fake_search_path):
            constrained = server.solve_pickup(None, [1, 2], "astar_manhattan", "greedy", server.DEFAULT_SEAT, True)

        self.assertIn("cspRuntimeMs", constrained)
        self.assertIn("pathSearchRuntimeMs", constrained)
        self.assertGreaterEqual(constrained["cspRuntimeMs"], 0)
        self.assertEqual(constrained["pathSearchRuntimeMs"], constrained["constraintStats"]["pathSearchRuntimeMs"])
        self.assertEqual(constrained["constraintStats"]["pathQueriesExecuted"], 4)
        self.assertEqual(constrained["pathSearchRuntimeMs"], 10.0)

        with patch.object(server, "plan_pickup", return_value=dict(unconstrained_plan)):
            unconstrained = server.solve_pickup(None, [1, 2], "astar_manhattan", "greedy", server.DEFAULT_SEAT, False)

        self.assertIsNone(unconstrained["cspRuntimeMs"])
        self.assertEqual(unconstrained["pathSearchRuntimeMs"], unconstrained["runtimeMs"])

    def test_grid_is_cached_between_walkability_checks(self) -> None:
        first = server.grid()
        second = server.grid()

        self.assertIs(first, second)

    def test_state_astar_is_removed_from_pickup_methods(self) -> None:
        self.assertEqual(server.normalize_order_method("state_astar"), "state_astar")
        self.assertEqual(server.normalize_method("state_astar"), "greedy")
        self.assertEqual(server.normalize_method("planning"), "greedy")
        self.assertFalse(hasattr(server, "state_space_astar_pickup_order"))

    def test_pickup_groups_add_batch_metadata_for_same_shelf_channel(self) -> None:
        targets = [
            {"id": 3, "book_id": "C", "title": "C", "shelf_id": "S1", "row": 2, "col": 2, "pickup": [2, 1]},
            {"id": 1, "book_id": "A", "title": "A", "shelf_id": "S1", "row": 2, "col": 2, "pickup": [2, 1]},
            {"id": 2, "book_id": "B", "title": "B", "shelf_id": "S2", "row": 2, "col": 6, "pickup": [2, 5]},
        ]

        context = server.build_pickup_groups(targets)

        self.assertEqual(context["stats"]["batchGroups"], 1)
        self.assertEqual(context["stats"]["mergedBooks"], 1)
        grouped = next(target for target in context["targets"] if target["pickup"] == [2, 1])
        self.assertEqual(grouped["groupKey"], "pickup:2:1")
        self.assertEqual(grouped["constraintReason"], "same_pickup")
        self.assertEqual(grouped["pickupCandidates"], [[2, 1]])
        self.assertEqual([book["id"] for book in grouped["books"]], [1, 3])


if __name__ == "__main__":
    unittest.main()
