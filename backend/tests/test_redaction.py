import asyncio
import unittest
from unittest.mock import patch

from finforge_cache import FINFORGE_DATA
from llm_client import llm_call
from agents.remediation import run_remediation
from redaction import redactor
from redaction.redactor import RedactionError, mask_secret, redact, redact_for_llm


class RedactionTests(unittest.TestCase):
    def test_known_secret_is_replaced_everywhere_with_fixed_width_mask(self):
        secret = "AKIAIOSFODNN7EXAMPLE"
        payload = f"first={secret}\nsecond={secret}"
        result = redact(payload, [{"raw_secret": secret}])
        self.assertNotIn(secret, result)
        self.assertEqual(result.count("AKIA****************MPLE"), 2)

    def test_entropy_fallback_masks_unknown_secret_shaped_assignment(self):
        secret = "Qx7mP2vN9aBcDeFgHiJkLmNoPqRsTuVw"
        result = redact(f"api_key={secret}", [])
        self.assertNotIn(secret, result)
        self.assertIn(mask_secret(secret), result)

    def test_final_assertion_blocks_when_a_secret_survives_redaction(self):
        secret = "Qx7mP2vN9aBcDeFgHiJkLmNoPqRsTuVw"
        with patch.object(redactor, "_redact_entropy_fallback", lambda value: value):
            with self.assertRaises(RedactionError):
                redact_for_llm(f"api_key={secret}", [])

    def test_redacted_prompt_cannot_be_constructed_directly(self):
        with self.assertRaises(TypeError):
            redactor.RedactedPrompt("raw prompt")


class LlmTransportRedactionIntegrationTests(unittest.IsolatedAsyncioTestCase):
    async def test_llm_transport_rejects_missing_findings_context(self):
        with self.assertRaises(TypeError):
            await llm_call("api_key=Qx7mP2vN9aBcDeFgHiJkLmNoPqRsTuVw")

    async def test_full_finforge_remediation_pipeline_never_sends_raw_values(self):
        captured = []

        async def fake_gemini(prompt, system):
            captured.extend([prompt.text, system.text])
            return "{}"

        async def broadcast(_event):
            return None

        raw_values = [finding["raw_secret"] for finding in FINFORGE_DATA["findings"] if finding.get("raw_secret")]
        with patch("llm_client._call_gemini", fake_gemini):
            await run_remediation(".", FINFORGE_DATA["findings"], None, broadcast)

        self.assertEqual(len(captured), len(FINFORGE_DATA["findings"]) * 2)
        for payload in captured:
            for value in raw_values:
                self.assertNotIn(value, payload)
