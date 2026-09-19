"""
LLM Client - Gemini primary, Groq fallback.
Every LLM call goes through this module. Never call providers directly.
Logs which provider served each response.
"""
import os
import asyncio
import httpx
from typing import Any, Mapping, Optional, Sequence

from redaction.redactor import RedactedPrompt, redact, redact_for_llm

GEMINI_MODEL = "gemini-2.0-flash-exp"
_groq_model_cache: Optional[str] = None


async def _get_groq_model() -> str:
    """Dynamically select Groq model at runtime. Cached per session."""
    global _groq_model_cache
    if _groq_model_cache:
        return _groq_model_cache

    api_key = os.environ.get("GROQ_API_KEY", "")
    async with httpx.AsyncClient(timeout=10.0) as client:
        r = await client.get(
            "https://api.groq.com/openai/v1/models",
            headers={"Authorization": f"Bearer {api_key}"}
        )
        r.raise_for_status()
        models = r.json().get("data", [])
        # Filter for chat-completion capable models, prefer llama3
        chat_models = [m for m in models if "llama" in m["id"].lower() or "mixtral" in m["id"].lower()]
        if not chat_models:
            chat_models = models
        # Prefer largest context / latest
        preferred = sorted(chat_models, key=lambda m: m.get("context_window", 0), reverse=True)
        _groq_model_cache = preferred[0]["id"] if preferred else "llama3-8b-8192"
        print(f"[LLM] Groq model selected: {_groq_model_cache}")
        return _groq_model_cache


async def _call_gemini(prompt: RedactedPrompt, system: RedactedPrompt) -> str:
    """Transport only prompts constructed by the deterministic redactor."""
    if not isinstance(prompt, RedactedPrompt) or not isinstance(system, RedactedPrompt):
        raise TypeError("Gemini transport requires RedactedPrompt inputs.")
    from google import genai
    from google.genai import types
    api_key = os.environ.get("GOOGLE_GEMINI_API_KEY", "")
    client = genai.Client(api_key=api_key)
    response = await asyncio.to_thread(
        client.models.generate_content,
        model=GEMINI_MODEL,
        contents=prompt.text,
        config=types.GenerateContentConfig(system_instruction=system.text)
    )
    return response.text


async def _call_groq(prompt: RedactedPrompt, system: RedactedPrompt) -> str:
    """Transport only prompts constructed by the deterministic redactor."""
    if not isinstance(prompt, RedactedPrompt) or not isinstance(system, RedactedPrompt):
        raise TypeError("Groq transport requires RedactedPrompt inputs.")
    api_key = os.environ.get("GROQ_API_KEY", "")
    model_id = await _get_groq_model()
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}"},
            json={
                "model": model_id,
                "messages": [
                    {"role": "system", "content": system.text},
                    {"role": "user", "content": prompt.text}
                ],
                "max_tokens": 1024,
                "temperature": 0.3,
            }
        )
        r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"]


async def llm_call(
    prompt: str,
    system: str = "",
    context: str = "",
    known_findings: Sequence[Mapping[str, Any]] | None = None,
) -> dict:
    """
    Call LLM with Gemini-first, Groq-fallback strategy.
    Returns {"text": str, "provider": str}
    """
    if known_findings is None:
        raise TypeError("llm_call() requires the current findings for mandatory secret redaction.")
    full_prompt = (context + "\n\n" + prompt).strip() if context else prompt
    # This is deliberately adjacent to provider transport.  Both the user content and
    # system instruction must become RedactedPrompt instances before an HTTP/SDK call.
    safe_prompt = redact_for_llm(full_prompt, known_findings)
    safe_system = redact_for_llm(
        system or "You are Nyx, a security analysis assistant. Be concise and technical.",
        known_findings,
    )

    # Try Gemini first
    try:
        text = await asyncio.wait_for(_call_gemini(safe_prompt, safe_system), timeout=25.0)
        print(f"[LLM] Served by: Gemini ({GEMINI_MODEL})")
        return {"text": redact(text, known_findings), "provider": "gemini"}
    except Exception as e:
        print(f"[LLM] Gemini failed: {e}. Falling back to Groq...")

    # Fallback to Groq
    try:
        text = await asyncio.wait_for(_call_groq(safe_prompt, safe_system), timeout=25.0)
        model = _groq_model_cache or "groq"
        print(f"[LLM] Served by: Groq ({model})")
        return {"text": redact(text, known_findings), "provider": "groq"}
    except Exception as e:
        raise RuntimeError(f"Both Gemini and Groq failed. Last error: {e}")
