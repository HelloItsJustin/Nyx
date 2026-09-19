"""
Nyx Backend - FastAPI server bound to 127.0.0.1 only.
Trust model: all data stays local. No Nyx team servers involved.
"""
import os
import json
import asyncio
import tempfile
from copy import deepcopy
from pathlib import Path
from typing import Optional, Dict, Any, List
from datetime import datetime

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
import uvicorn

from dotenv import load_dotenv
load_dotenv(dotenv_path=Path(__file__).parent.parent / '.env')

from agents.detection import run_detection, public_finding
from agents.blast_radius import run_blast_radius
from agents.phantom import run_phantom
from agents.honey_mesh import run_honey_mesh
from agents.remediation import run_remediation
from finforge_cache import FINFORGE_DATA, FINFORGE_REPO_URL
from pdf_generator import generate_pdf
from redaction.redactor import redact
from github_token import GitHubTokenValidationError, validate_github_token

app = FastAPI(title="Nyx Local Backend", version="2.0.0")

_session_github_login = os.environ.get("NYX_GITHUB_LOGIN", "").strip()
_github_identity: Dict[str, Any] = {
    "connected": bool(os.environ.get("GITHUB_ACCESS_TOKEN") and _session_github_login),
    "login": _session_github_login or None,
    "scopes": os.environ.get("NYX_GITHUB_SCOPES", "").strip() or None,
}

# CORS - only allow localhost origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173",
                   "http://localhost:3000", "http://127.0.0.1:3000",
                   "http://localhost:8000", "http://127.0.0.1:8000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve the dashboard static files
DASHBOARD_DIST = Path(__file__).parent.parent / "dashboard" / "dist"
if DASHBOARD_DIST.exists():
    app.mount("/assets", StaticFiles(directory=str(DASHBOARD_DIST / "assets")), name="assets")

# Active WebSocket connections
_ws_clients: List[WebSocket] = []
_last_event: Dict[str, Any] = {}
_scan_status: Dict[str, Any] = {"phase": "idle", "event": None}

# Accumulated scan state for PDF/PR lookups
_scan_state: Dict[str, Any] = {
    "findings": [], "fixes": [], "blast_graph": None,
    "phantom": None, "honey": None, "trust_score": 75, "repo_url": None,
    "scan_dir": None,
}
_sensitive_findings: List[Dict[str, Any]] = []  # Never sent through WebSocket/API state.

# Gate: a completed phase stays on screen until the user explicitly proceeds.
# The expected phase prevents a second/stale click from unlocking a later phase.
_proceed_event: asyncio.Event = asyncio.Event()
_awaiting_proceed_phase: Optional[str] = None
_active_pipeline: Optional[asyncio.Task] = None

def reset_proceed_gate():
    """Close any outstanding manual-progression gate."""
    global _awaiting_proceed_phase
    _awaiting_proceed_phase = None
    _proceed_event.clear()

def open_proceed_gate(phase: str):
    """Open a gate for one specific completed phase before notifying the UI."""
    global _awaiting_proceed_phase
    _proceed_event.clear()
    _awaiting_proceed_phase = phase

def _redact_public_value(value: Any) -> Any:
    """Keep raw findings inside the local worker boundary, never UI/PDF state."""
    if isinstance(value, str):
        return redact(value, _sensitive_findings)
    if isinstance(value, list):
        return [_redact_public_value(item) for item in value]
    if isinstance(value, dict):
        return {key: _redact_public_value(item) for key, item in value.items() if key not in {"raw_secret", "raw_value"}}
    return value

async def broadcast_completion_and_wait(phase: str, event: Dict[str, Any]):
    """Broadcast phase completion, then pause indefinitely for that phase's Proceed click."""
    global _awaiting_proceed_phase
    open_proceed_gate(phase)
    await broadcast(event)
    await _proceed_event.wait()
    _proceed_event.clear()
    _awaiting_proceed_phase = None

async def broadcast(event: dict):
    """Send event to all connected dashboard clients and accumulate state."""
    # WebSocket events power the dashboard and PDF state; both receive a deep,
    # irreversible redacted copy. Internal workers retain their local finding values.
    event = _redact_public_value(deepcopy(event))
    _last_event.update(event)
    _scan_status["event"] = event.get("message", "")

    # Accumulate findings
    if event.get("status") == "finding" and event.get("finding"):
        _scan_state["findings"].append(event["finding"])

    # Accumulate fixes
    if event.get("status") == "fix" and event.get("fix"):
        _scan_state["fixes"].append(event["fix"])
    if event.get("status") == "complete" and event.get("fixes"):
        _scan_state["fixes"] = event["fixes"]

    # Accumulate blast graph
    if event.get("phase") == "blast_radius" and event.get("graph"):
        _scan_state["blast_graph"] = event["graph"]

    # Accumulate phantom/honey
    if event.get("phase") == "phantom" and event.get("result"):
        _scan_state["phantom"] = event["result"]
    if event.get("phase") == "honey_mesh" and event.get("result"):
        _scan_state["honey"] = event["result"]

    # Trust score
    if event.get("trust_score"):
        _scan_state["trust_score"] = event["trust_score"]

    disconnected = []
    for ws in _ws_clients:
        try:
            await ws.send_json(event)
        except Exception:
            disconnected.append(ws)
    for ws in disconnected:
        _ws_clients.remove(ws)


# ---- HEALTH ----

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "version": "2.1.0",
        "trust": "local-only",
        "pr_fix_catalog": "current-repository-paths",
    }


# ---- STATUS (polled by CLI) ----

@app.get("/api/status")
async def status():
    return _scan_status


# ---- WEBSOCKET ----

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    _ws_clients.append(websocket)
    # Send current state immediately on connect
    if _last_event:
        await websocket.send_json(_last_event)
    try:
        while True:
            await websocket.receive_text()  # keep alive
    except WebSocketDisconnect:
        if websocket in _ws_clients:
            _ws_clients.remove(websocket)


# ---- SCAN REQUEST ----

class ScanRequest(BaseModel):
    repo_url: str

@app.post("/api/scan")
async def start_scan(req: ScanRequest):
    """Kick off a full 5-phase scan pipeline in the background."""
    global _active_pipeline
    if _active_pipeline and not _active_pipeline.done():
        raise HTTPException(status_code=409, detail="A scan is already in progress. Finish it or restart Nyx before starting another.")
    # Reset accumulated state for fresh scan
    _scan_state.update({
        "findings": [], "fixes": [], "blast_graph": None,
        "phantom": None, "honey": None, "trust_score": 75,
        "repo_url": req.repo_url, "scan_dir": None,
    })
    _sensitive_findings.clear()
    reset_proceed_gate()  # Fresh gate for new scan
    _active_pipeline = asyncio.create_task(run_pipeline(repo_url=req.repo_url))
    return {"status": "started", "repo_url": req.repo_url}


class ProceedRequest(BaseModel):
    phase: str

@app.post("/api/scan/proceed")
async def scan_proceed(req: ProceedRequest):
    """Advance only the phase currently waiting for an explicit user action."""
    if _awaiting_proceed_phase is None:
        raise HTTPException(status_code=409, detail="No phase is currently waiting for Proceed.")
    if req.phase != _awaiting_proceed_phase:
        raise HTTPException(
            status_code=409,
            detail=f"{_awaiting_proceed_phase} is waiting for Proceed, not {req.phase}."
        )
    if _proceed_event.is_set():
        return {"status": "already_proceeding", "phase": req.phase}
    _proceed_event.set()
    return {"status": "proceeding", "phase": req.phase}


@app.post("/api/scan/upload")
async def scan_upload(file: UploadFile = File(...)):
    """Accept a zip upload, extract, and scan."""
    global _active_pipeline
    if _active_pipeline and not _active_pipeline.done():
        raise HTTPException(status_code=409, detail="A scan is already in progress. Finish it or restart Nyx before starting another.")
    tmp = tempfile.mkdtemp()
    zip_path = os.path.join(tmp, file.filename or "upload.zip")
    with open(zip_path, "wb") as f:
        f.write(await file.read())
    import zipfile
    with zipfile.ZipFile(zip_path, 'r') as z:
        z.extractall(tmp)
    os.remove(zip_path)
    reset_proceed_gate()  # Fresh gate for new scan
    _active_pipeline = asyncio.create_task(run_pipeline(local_path=tmp))
    return {"status": "started", "mode": "upload"}


# ---- PIPELINE ----

def _finforge_cache_matches_snapshot(scan_dir: str, findings: List[Dict[str, Any]]) -> bool:
    """Only pace FinForge findings when every cached datum matches the fresh clone."""
    root = Path(scan_dir).resolve()
    for finding in findings:
        path = root / str(finding.get("file") or "")
        if not path.is_file():
            return False
        try:
            lines = path.read_text(encoding="utf-8", errors="ignore").splitlines()
        except OSError:
            return False
        line_number = int(finding.get("line") or 0)
        if line_number < 1 or line_number > len(lines):
            return False
        raw_secret = str(finding.get("raw_secret") or "")
        if raw_secret and raw_secret not in path.read_text(encoding="utf-8", errors="ignore"):
            return False
    return True

async def run_pipeline(repo_url: str = None, local_path: str = None):
    """
    Execute all 5 phases sequentially, broadcasting progress via WebSocket.
    FinForge findings may be paced from a cache only after they match a fresh clone.
    The graph is always live-traversed from the current repository snapshot.
    """
    is_finforge = repo_url and (
        "HelloItsJustin/FinForge" in repo_url or
        repo_url.rstrip("/") == FINFORGE_REPO_URL.rstrip("/")
    )

    scan_dir = local_path
    clone_tmp = None

    try:
        # Clone every remote repository before any cache lookup. A FinForge pacing
        # fixture is permitted only when it still validates against this exact tree.
        if repo_url:
            import subprocess
            clone_tmp = tempfile.mkdtemp(prefix="nyx-scan-")
            await broadcast({"phase": "detection", "status": "cloning", "message": "Cloning repository snapshot..."})
            result = await asyncio.to_thread(
                subprocess.run,
                ["git", "clone", "--depth=1", repo_url, clone_tmp],
                capture_output=True,
                timeout=120,
            )
            if result.returncode != 0:
                await broadcast({"phase": "detection", "status": "error", "message": "Clone failed: " + result.stderr.decode(errors="ignore")[:200]})
                return
            scan_dir = clone_tmp
        if not scan_dir or not Path(scan_dir).is_dir():
            raise ValueError("No readable repository snapshot was supplied for scanning.")
        _scan_state["scan_dir"] = scan_dir

        # PHASE 1: Detection
        await broadcast({"phase": "detection", "status": "running", "message": "Detection Agent starting..."})
        _scan_status["phase"] = "detection"

        if is_finforge and _finforge_cache_matches_snapshot(scan_dir, FINFORGE_DATA["findings"]):
            findings = FINFORGE_DATA["findings"]
            await asyncio.sleep(0.5)
            for i, f in enumerate(findings):
                await asyncio.sleep(0.9)  # stagger reveals
                await broadcast({
                    "phase": "detection",
                    "status": "finding",
                    "finding": public_finding(f),
                    "index": i,
                    "total": len(findings),
                    "message": f"Found: {f['description'][:60]}"
                })
        else:
            findings = await run_detection(scan_dir, broadcast)

        _sensitive_findings[:] = findings

        await broadcast_completion_and_wait("detection", {
            "phase": "detection",
            "status": "complete", "findings": [public_finding(f) for f in findings],
            "count": len(findings),
            "message": f"Detection complete. {len(findings)} findings."
        })

        # PHASE 2: Blast Radius
        await asyncio.sleep(0.3)
        await broadcast({"phase": "blast_radius", "status": "running", "message": "Mapping blast radius..."})
        _scan_status["phase"] = "blast_radius"

        # Never use fixture graph data: traversal and integrity validation always run
        # against the cloned/current repository snapshot.
        blast = await run_blast_radius(scan_dir, findings, broadcast)

        await broadcast_completion_and_wait("blast_radius", {
            "phase": "blast_radius", "status": "complete", "graph": blast,
            "message": "Blast radius mapped."
        })

        # PHASE 3: Phantom Runtime
        await asyncio.sleep(0.3)
        await broadcast({"phase": "phantom", "status": "running", "message": "Phantom Runtime initializing sandbox..."})
        _scan_status["phase"] = "phantom"

        # Phantom is never replayed from fixture data: every result comes from the
        # real Docker sandbox or an explicit unavailable/error state.
        phantom = await run_phantom(scan_dir, findings, broadcast)

        await broadcast_completion_and_wait("phantom", {
            "phase": "phantom", "status": "complete", "result": phantom,
            "message": "Sandbox detonation complete."
        })

        # PHASE 4: Honey Mesh
        await asyncio.sleep(0.3)
        await broadcast({"phase": "honey_mesh", "status": "running", "message": "Deploying honey tokens..."})
        _scan_status["phase"] = "honey_mesh"

        if is_finforge:
            honey = FINFORGE_DATA["honey_mesh"]
        else:
            honey = await run_honey_mesh(findings, broadcast)

        await broadcast_completion_and_wait("honey_mesh", {
            "phase": "honey_mesh", "status": "complete", "result": honey,
            "message": "Honey mesh deployed."
        })

        # PHASE 5: Remediation
        await asyncio.sleep(0.3)
        await broadcast({"phase": "remediation", "status": "running", "message": "Remediation Agent preparing fixes..."})
        _scan_status["phase"] = "remediation"

        if is_finforge:
            remediation = FINFORGE_DATA["remediation"]
            for i, fix in enumerate(remediation["fixes"]):
                await asyncio.sleep(0.7)
                await broadcast({
                    "phase": "remediation",
                    "status": "fix",
                    "fix": fix,
                    "index": i,
                    "message": f"Fix ready: {fix['title']}"
                })
        else:
            remediation = await run_remediation(scan_dir, findings, repo_url, broadcast)

        await broadcast_completion_and_wait("remediation", {
            "phase": "remediation",
            "status": "complete",
            "fixes": remediation.get("fixes", []),
            "message": "All fixes ready."
        })

        # FINAL SUMMARY
        await asyncio.sleep(0.3)
        trust_score = 95 if len(findings) == 0 else max(60, 95 - len([f for f in findings if f.get("severity") in ["HIGH", "CRITICAL"]]) * 8)
        await broadcast({
            "phase": "summary",
            "status": "complete",
            "trust_score": trust_score,
            "findings_count": len(findings),
            "fixes_count": len(remediation.get("fixes", [])),
            "message": f"Scan complete. Trust score: {trust_score}/100"
        })
        _scan_status["phase"] = "summary"

    except Exception as e:
        await broadcast({"phase": "error", "status": "error", "message": str(e)})
    finally:
        global _active_pipeline
        if asyncio.current_task() is _active_pipeline:
            _active_pipeline = None
            reset_proceed_gate()
        # Keep this local snapshot for the in-dashboard evidence viewer until the next
        # scan/session. It is the source of truth for every shown node and edge.


# ---- HONEY MESH TRIGGER ----

@app.post("/api/honey/trigger")
async def honey_trigger():
    """Simulate an attacker interacting with a honeytoken. Labeled as simulation."""
    await broadcast({
        "phase": "honey_mesh",
        "status": "triggered",
        "simulated": True,
        "message": "SIMULATION: Honeytoken accessed. Confidence: HIGH. Abuse confirmed, not assumed."
    })
    return {"simulated": True, "message": "Attacker simulation triggered"}


# ---- AUTO-PR ----

@app.get("/api/github/status")
async def github_status():
    return {"configured": True, "token_required": not _github_identity["connected"], **_github_identity}


class GitHubTokenRequest(BaseModel):
    token: str
    repo_url: Optional[str] = None


@app.post("/api/github/token")
async def connect_github_token(req: GitHubTokenRequest):
    """Validate a manually entered token before retaining it for this process only."""
    try:
        identity = await validate_github_token(req.token, req.repo_url)
    except GitHubTokenValidationError as error:
        raise HTTPException(status_code=error.status_code, detail=str(error)) from error
    # The raw value is intentionally never logged, returned, or persisted.
    os.environ["GITHUB_ACCESS_TOKEN"] = req.token.strip()
    _github_identity.update({"connected": True, **identity})
    return {"connected": True, **identity}

class EvidenceRequest(BaseModel):
    file: str
    line: int

@app.post("/api/blast/evidence")
async def blast_evidence(req: EvidenceRequest):
    """Return masked local source context for a graph node/edge proof action."""
    scan_dir = _scan_state.get("scan_dir")
    if not scan_dir:
        raise HTTPException(status_code=409, detail="No repository snapshot is available for evidence.")
    root = Path(scan_dir).resolve()
    requested = (root / req.file).resolve()
    try:
        requested.relative_to(root)
    except ValueError as error:
        raise HTTPException(status_code=400, detail="Evidence path is outside the scanned repository.") from error
    if not requested.is_file():
        raise HTTPException(status_code=404, detail="The evidence file no longer exists in this snapshot.")
    try:
        lines = requested.read_text(encoding="utf-8", errors="ignore").splitlines()
    except OSError as error:
        raise HTTPException(status_code=500, detail="Nyx could not read the evidence file.") from error
    line_number = max(1, min(req.line or 1, max(1, len(lines))))
    start = max(1, line_number - 2)
    end = min(len(lines), line_number + 2)
    context = [
        {"line": index, "text": redact(lines[index - 1], _sensitive_findings), "highlight": index == line_number}
        for index in range(start, end + 1)
    ]
    return {"file": req.file, "line": line_number, "context": context}

class PRRequest(BaseModel):
    finding_id: str
    repo_url: str

@app.post("/api/pr/create")
async def create_pr(req: PRRequest):
    """Create a real GitHub pull request for a finding fix."""
    from agents.remediation import create_github_pr
    from copy import deepcopy
    try:
        fix_data = None  # Only server-side scan data is eligible for a GitHub write.

        # The FinForge showcase uses curated findings. Always use the server-side
        # canonical fix for it so a dashboard opened before a cache update cannot
        # send an obsolete path (for example backend/config.js) to GitHub.
        is_finforge = "helloitsjustin/finforge" in req.repo_url.lower()
        if is_finforge:
            for fix in FINFORGE_DATA["remediation"]["fixes"]:
                if fix.get("finding_id") == req.finding_id or fix.get("id") == req.finding_id:
                    fix_data = deepcopy(fix)
                    break

        # Fallback: look up from FinForge hardcoded data
        if fix_data is None:
            for fix in FINFORGE_DATA["remediation"]["fixes"]:
                if fix.get("finding_id") == req.finding_id or fix.get("id") == req.finding_id:
                    fix_data = fix
                    break

        # Final fallback: look in accumulated scan state
        if fix_data is None:
            for fix in _scan_state.get("fixes", []):
                if fix.get("finding_id") == req.finding_id or fix.get("id") == req.finding_id:
                    fix_data = fix
                    break

        if fix_data is None:
            raise HTTPException(status_code=404, detail=f"Fix not found for finding_id={req.finding_id}")

        # Ensure required PR fields have defaults if missing
        if "branch" not in fix_data:
            import re
            slug = re.sub(r'[^a-z0-9-]', '-', req.finding_id.lower())[:30]
            fix_data["branch"] = f"nyx/fix-{slug}"
        if "pr_title" not in fix_data:
            fix_data["pr_title"] = fix_data.get("title", "Security fix by Nyx")
        if "pr_body" not in fix_data:
            fix_data["pr_body"] = fix_data.get("fix", "Automated security fix by Nyx.")
        if "commit_message" not in fix_data:
            fix_data["commit_message"] = f"security: {fix_data.get('title', 'fix credential exposure')}"

        pr_url = await create_github_pr(req.repo_url, fix_data, broadcast)
        
        # Store pr_url in scan state
        for fix in _scan_state.get("fixes", []):
            if fix.get("finding_id") == req.finding_id:
                fix["pr_url"] = pr_url
        
        return {"pr_url": pr_url, "status": "created"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



# ---- PDF REPORT ----

@app.get("/api/report/pdf")
async def get_pdf_report():
    """Generate and serve the PDF executive report."""
    try:
        report_data = {
            "findings": _scan_state.get("findings", []),
            "fixes":    _scan_state.get("fixes", []),
            "trust_score": _scan_state.get("trust_score", 75),
            "repo_url": _scan_state.get("repo_url", "Unknown"),
        }
        pdf_path = await generate_pdf(report_data)
        return FileResponse(pdf_path, media_type="application/pdf", filename="nyx_report.pdf")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ---- SERVE DASHBOARD ----

@app.get("/{full_path:path}")
async def serve_dashboard(full_path: str):
    index = DASHBOARD_DIST / "index.html"
    if DASHBOARD_DIST.exists() and index.exists():
        return FileResponse(str(index))
    return JSONResponse({"nyx": "backend running", "dashboard": "not built yet - run: cd dashboard && npm run build"})


if __name__ == "__main__":
    port = int(os.environ.get("NYX_PORT", 8000))
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")
