# Nyx v2.0 - Current Architecture State

Last updated: 2026-09-19

## Non-negotiable trust rules

- Full credential values never enter a Gemini or Groq request. LLM requests contain only finding metadata and masked previews.
- The dashboard, WebSocket events, PDF state, and live evidence reader use irreversible redacted copies of finding data.
- Blast-radius nodes are current repository files. Every edge has live traversal evidence; sparse graphs are expected and correct.
- Nyx asks for a fresh, masked GitHub personal access token for each session. The token is validated directly with GitHub, held only in process memory, and never written to disk.

## 1. Deterministic secret redaction

Implemented:

- `backend/redaction/redactor.py` is a standalone, offline module with no AI, HTTP, provider, or detection-engine import.
- `redact(text, known_findings)` replaces every known raw credential by exact substring matching. Its mask keeps the first 4 and last 4 characters with exactly 16 asterisks in between, for example `AKIA****************MPLE`.
- A second local Shannon-entropy pass checks security-relevant assignments (`api_key`, `secret`, `token`, `password`, connection strings, webhooks, and related key names) at entropy >= 3.0.
- A final defensive scan logs a secret-free critical diagnostic and blocks the request with `RedactionError` if secret-shaped content survives.
- `RedactedPrompt` cannot be constructed directly; Gemini and Groq transport functions accept only this type. `llm_call()` is the mandatory transport boundary.
- Detection UI and PDF methodology state that full credential values are never transmitted to an AI provider.

Verification:

- `python -m unittest discover -s tests -v` passes 13 tests, including isolated redaction tests, mandatory-findings transport enforcement, GitHub permission handling, Phantom support shims, remediation metadata fallback, and a full FinForge remediation/LLM-transport capture test. The capture confirms every provider-bound payload excludes all six FinForge raw values.

## 2. Evidence-first blast radius

Implemented:

- `backend/agents/blast_radius.py` traverses the current repository snapshot. It has no fabricated external-service nodes or cache graph shortcut.
- A node requires an existing backing file plus click-ready evidence. Graph integrity fails loudly otherwise.
- Edges require either an exact actual environment/config assignment reference or a resolved local import. Generic words such as `NYX` and `DEMO` are deliberately not treated as references.
- FinForge is freshly cloned before its findings cache may be used for pacing. The cache is rejected if the finding path, line, or raw detection value no longer matches the clone.
- The graph itself is always generated live, even for FinForge.
- The Blast Radius dashboard supports node/edge evidence actions and fetches masked local source context from `POST /api/blast/evidence`.

Current FinForge audit, against `C:\tmp\nyx-finforge-inspect`:

| Finding source | Direct shared credential/config reference found |
| --- | --- |
| `backend/.env.example.demo:2` (demo Stripe fixture) | None |
| `config/mongo-demo.txt:2` (demo Mongo URI) | None |
| `backend/.env.example.demo:4` (demo JWT fixture) | None |
| `backend/detector.py:18` (demo Google key) | None |
| `backend/main.py:32` (CORS configuration) | `backend/main.py:24` imports `backend/detector.py` via `detector` |
| `backend/main.py:17` (demo Slack webhook) | `backend/main.py:24` imports `backend/detector.py` via `detector` |

The only current graph edge is deliberately sparse and real: `backend/main.py:24 imports backend/detector.py via detector`. The test validates every node path exists and every edge has nonempty concrete evidence.

## 3. GitHub personal-access-token authorization

Implemented:

- CLI: `cli/src/keyCollection.js` asks for a fresh, masked GitHub personal access token every session and shows `Connected as @username` only after live validation. Tokens are not logged or stored on disk.
- Dashboard: Remediation uses a masked `Validate token` input. The browser submits it only to the local backend, which never returns or persists the raw value; browser state is cleared after validation.
- `GET /repos/{owner}/{repo}` is the permission authority for both classic and fine-grained PATs. Nyx requires `permissions.push == true` against the actual Auto-PR repository. `X-OAuth-Scopes` is never an authorization gate because GitHub omits it for fine-grained PATs; it is used only to tailor missing-permission guidance.
- For classic PATs, missing write access instructs the user to add `repo`; for fine-grained PATs, it instructs them to include the target repository and grant **Contents: Read and write**, **Pull requests: Read and write**, and **Metadata: Read-only**.
- OAuth Device Flow was attempted and is a valid future improvement. It was deferred because registering and configuring a GitHub OAuth App client ID before the deadline was not feasible.

Live status: unit tests simulate and accept both classic (`x-oauth-scopes: repo`) and fine-grained (no scope header) token responses when the target repository reports `permissions.push: true`. A live request using the only locally configured token reached GitHub and returned the observed error `401 Invalid or expired GitHub token`; it was correctly rejected without exposing it. Live acceptance of a valid classic PAT and valid fine-grained PAT remains blocked until their owners enter valid tokens locally.

## 4. Auto-PR

- Auto-PR creates a branch from the remote default branch, verifies an exact source-line match, commits only that target file, then opens a pull request. It refuses stale/missing findings rather than silently falling back to an unrelated `.gitignore` edit.
- PR title, body, and commit message are generated by the redaction-enforced Gemini/Groq wrapper before any GitHub write. If both providers are unavailable, Nyx creates the same formal `Summary`, `Changes`, and `Verification` metadata locally from redacted finding fields so an exact-line remediation is not blocked by a provider outage; raw credential values cannot cross either path.
- There is no `NEXT_PUBLIC_ENABLE_PR_FALLBACK_MODE` implementation in this repository.
- Live PR status: not yet exercised because the only local token is invalid. No PR URL can be truthfully reported until a valid token with FinForge write access is entered locally.

## 5. Phantom Runtime

- `backend/agents/phantom.py` now runs only a real Docker sandbox. It clones a disposable copy, substitutes same-shape decoys, executes a discovered Python credential-use path with `--network none`, streams socket-interceptor events over the existing WebSocket, enforces a timeout, and checks `docker ps` container count before and after cleanup.
- A direct connection probe to `1.1.1.1:443` must be blocked before target code runs. If Docker is absent, inaccessible, or the probe is not blocked, Nyx emits an explicit sandbox error and does not replay a simulated terminal log.
- Live runtime status: Docker Desktop 29.8.0 was reached successfully. A real FinForge `backend/detector.py` sandbox pass verified that a direct connection to `1.1.1.1:443` was blocked by `--network none`, and `docker ps` returned to the baseline `0 -> 0` after cleanup. The minimal image originally exposed its real `ModuleNotFoundError: networkx`; the current runtime adds disposable no-op import shims in the container only, so the decoy-substituted module can now load without installing packages or enabling networking.

## Current verification

- Backend unit/integration suite: passing.
- Python compilation: passing.
- Dashboard production build: passing.
- Live invalid-token API result: GitHub HTTP 401, correctly reported as invalid/expired.
- CLI-to-dashboard GitHub handoff: verified with a local backend status request returning `connected: true`, `token_required: false`, and the validated session username.
