import unittest
from unittest.mock import patch

from agents.remediation import generate_pr_metadata_with_llm


class RemediationMetadataTests(unittest.IsolatedAsyncioTestCase):
    async def test_provider_outage_uses_formal_redacted_local_metadata(self):
        fix = {
            "title": "Remove demo MongoDB URI fixture",
            "file": "config/mongo-demo.txt",
            "severity": "HIGH",
            "fix": "Remove the demo URI from source.",
            "diff": {"before": "mongodb://demo-user:secret@db.example.test/app"},
        }
        with patch("agents.remediation.llm_call", side_effect=RuntimeError("provider unavailable")):
            title, body, commit = await generate_pr_metadata_with_llm(fix)
        self.assertTrue(title.startswith("Security:"))
        self.assertIn("## Summary", body)
        self.assertIn("## Changes", body)
        self.assertIn("## Verification", body)
        self.assertNotIn(fix["diff"]["before"], title + body + commit)

