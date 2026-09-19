import os
from pathlib import Path
import unittest

from agents.blast_radius import build_blast_graph
from finforge_cache import FINFORGE_DATA


class FinForgeEvidenceGraphTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        configured = os.environ.get("FINFORGE_REPO_DIR")
        local_inspection = Path("C:/tmp/nyx-finforge-inspect")
        cls.repo_dir = Path(configured) if configured else local_inspection
        if not cls.repo_dir.is_dir():
            raise unittest.SkipTest("Set FINFORGE_REPO_DIR to a fresh FinForge clone to run the live repository test.")

    def test_every_node_and_edge_has_current_repository_evidence(self):
        graph = build_blast_graph(str(self.repo_dir), FINFORGE_DATA["findings"])
        self.assertGreater(len(graph["nodes"]), 0)
        self.assertGreater(len(graph["edges"]), 0)
        for node in graph["nodes"]:
            self.assertTrue((self.repo_dir / node["backing_file"]).is_file(), node)
            self.assertTrue(node.get("evidence"), node)
        for edge in graph["edges"]:
            evidence = edge.get("evidence", {})
            self.assertTrue(evidence.get("match"), edge)
            self.assertTrue(evidence.get("description"), edge)
            self.assertNotIn("Linked because", evidence["description"])
            self.assertTrue((self.repo_dir / evidence["source"]["file"]).is_file(), edge)
            self.assertTrue((self.repo_dir / evidence["target"]["file"]).is_file(), edge)
            source_lines = (self.repo_dir / evidence["source"]["file"]).read_text(encoding="utf-8", errors="ignore").splitlines()
            self.assertIn(evidence["match"], source_lines[evidence["source"]["line"] - 1], edge)
