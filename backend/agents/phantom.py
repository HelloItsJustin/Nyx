"""Real Docker-only Phantom Runtime with decoy substitution and egress capture."""
from __future__ import annotations

import asyncio
import inspect
import json
import os
import re
import shutil
import subprocess
import tempfile
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Dict, Iterable, List

from redaction.redactor import redact


PYTHON_IMAGE = os.environ.get("NYX_PHANTOM_IMAGE", "python:3.12-slim")
NETWORK_MODE = os.environ.get("SANDBOX_NETWORK_MODE", "none")
RUN_TIMEOUT_SECONDS = int(os.environ.get("NYX_PHANTOM_TIMEOUT_SECONDS", "30"))

# This lives only inside the disposable container. It captures Python socket calls,
# then raises before any payload can leave even the already-disabled Docker network.
SITECUSTOMIZE = r'''
import json
import socket
import sys

def _destination(address):
    if isinstance(address, tuple):
        return f"{address[0]}:{address[1]}" if len(address) > 1 else str(address[0])
    return str(address)

def _blocked(address, *args, **kwargs):
    print("NYX_PHANTOM_EVENT " + json.dumps({"destination": _destination(address), "action": "connect"}), file=sys.stderr, flush=True)
    raise OSError("NYX_NETWORK_BLOCKED: outbound connection intercepted")

socket.create_connection = _blocked
socket.socket.connect = lambda self, address: _blocked(address)
'''

RUN_TARGET = r'''
import pathlib
import runpy
import sys

target = pathlib.Path(sys.argv[1]).resolve()
try:
    runpy.run_path(str(target), run_name="__nyx_phantom_target__")
    print("NYX_PHANTOM_TARGET_LOADED actual repository module with decoy substitutions", flush=True)
    print("NYX_PHANTOM_TARGET_EXIT clean", flush=True)
except SystemExit as exc:
    print(f"NYX_PHANTOM_TARGET_EXIT system-exit={exc.code}", flush=True)
except Exception as exc:
    print(f"NYX_PHANTOM_TARGET_ERROR {type(exc).__name__}: {str(exc)[:180]}", flush=True)
'''

NETWORK_PROBE = r'''
import socket
try:
    socket.create_connection(("1.1.1.1", 443), timeout=3)
    print("NYX_NETWORK_PROBE_UNEXPECTED_SUCCESS")
except OSError as exc:
    print("NYX_NETWORK_PROBE_BLOCKED " + type(exc).__name__ + ": " + str(exc)[:160])
'''


def _docker_binary() -> str:
    configured = os.environ.get("DOCKER_BINARY_PATH", "").strip()
    if configured:
        return configured
    discovered = shutil.which("docker")
    if discovered:
        return discovered
    windows_default = Path(os.environ.get("LOCALAPPDATA", "")) / "Programs" / "DockerDesktop" / "resources" / "bin" / "docker.exe"
    return str(windows_default) if windows_default.is_file() else "docker"


def _run(command: list[str], timeout: int = 15) -> subprocess.CompletedProcess[bytes]:
    return subprocess.run(command, capture_output=True, timeout=timeout)


def _docker_ready() -> tuple[bool, str]:
    try:
        result = _run([_docker_binary(), "version", "--format", "{{.Server.Version}}"], 10)
    except (OSError, subprocess.TimeoutExpired):
        return False, "Docker could not be started."
    if result.returncode != 0:
        diagnostic = (result.stderr or result.stdout).decode("utf-8", errors="ignore").strip().replace("\r", " ").replace("\n", " ")
        diagnostic = diagnostic[:240] or "Docker daemon is unavailable or this user cannot access it."
        return False, f"Docker unavailable: {diagnostic}"
    return True, result.stdout.decode("utf-8", errors="ignore").strip()


def _running_container_count() -> int | None:
    try:
        result = _run([_docker_binary(), "ps", "-q"], 10)
        if result.returncode == 0:
            return len([line for line in result.stdout.decode("utf-8", errors="ignore").splitlines() if line.strip()])
    except (OSError, subprocess.TimeoutExpired):
        pass
    return None


def _same_shape_decoy(value: str) -> str:
    """Match length/character classes without retaining one credential character."""
    result: list[str] = []
    for char in value:
        if char.isupper(): result.append("N")
        elif char.islower(): result.append("n")
        elif char.isdigit(): result.append("7")
        elif char in "-_./:=@+?&%#": result.append(char)
        else: result.append("x")
    return "".join(result) or "NYX_PHANTOM_DECOY"


def _environment_key(root: Path, finding: Dict[str, Any]) -> str | None:
    raw = str(finding.get("raw_secret") or "")
    path = root / str(finding.get("file") or "")
    if not raw or not path.is_file(): return None
    try:
        for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
            if raw in line:
                match = re.match(r"\s*([A-Za-z_][A-Za-z0-9_]*)\s*=", line)
                return match.group(1) if match else None
    except OSError:
        return None
    return None


def _execution_target(root: Path, finding: Dict[str, Any]) -> Path | None:
    """Use the actual finding file or code that reads its configuration key."""
    direct = root / str(finding.get("file") or "")
    if direct.is_file() and direct.suffix == ".py": return direct
    raw, key = str(finding.get("raw_secret") or ""), _environment_key(root, finding)
    for candidate in root.rglob("*.py"):
        if any(part in {".git", "node_modules", "__pycache__"} for part in candidate.parts): continue
        try: text = candidate.read_text(encoding="utf-8", errors="ignore")
        except OSError: continue
        if raw and raw in text: return candidate
        if key and re.search(rf"(?:getenv|environ\s*\[)\s*\(?[\"']{re.escape(key)}[\"']", text): return candidate
    return None


def _copy_with_decoys(source: Path, findings: Iterable[Dict[str, Any]], destination: Path) -> list[dict[str, str]]:
    shutil.copytree(source, destination, ignore=shutil.ignore_patterns(".git", "node_modules", "__pycache__", "dist", "build"))
    substitutions: list[dict[str, str]] = []
    for finding in findings:
        raw = str(finding.get("raw_secret") or "")
        if not raw: continue
        decoy = _same_shape_decoy(raw)
        for path in destination.rglob("*"):
            if not path.is_file() or path.suffix.lower() in {".png", ".jpg", ".pdf", ".zip"}: continue
            try: content = path.read_text(encoding="utf-8")
            except (OSError, UnicodeDecodeError): continue
            if raw in content: path.write_text(content.replace(raw, decoy), encoding="utf-8")
        substitutions.append({"detector": str(finding.get("detector") or "credential"), "decoy": decoy})
    return substitutions


def _write_import_stubs(support: Path) -> None:
    """Add disposable no-op import shims for analysis-only module loading.

    The target code remains the repository's decoy-substituted file. These shims
    exist solely to let its top-level imports resolve in the minimal Docker image;
    they are not installed into the repository or used by the host application.
    """
    generic = """class _Placeholder:\n    def __init__(self, *args, **kwargs): pass\n    def __call__(self, *args, **kwargs): return self\n    def __getattr__(self, name): return self\n\ndef __getattr__(name): return _Placeholder\n"""
    files = {
        "networkx.py": "class DiGraph: pass\n" + generic,
        "pandas.py": "class DataFrame: pass\n" + generic,
        "reportlab/__init__.py": "",
        "reportlab/lib/__init__.py": "",
        "reportlab/lib/colors.py": generic,
        "reportlab/lib/pagesizes.py": "A4 = (595, 842)\n",
        "reportlab/lib/styles.py": "def getSampleStyleSheet(): return {}\nclass ParagraphStyle:\n    def __init__(self, *args, **kwargs): pass\n",
        "reportlab/lib/units.py": "inch = 72\nmm = 2.83465\n",
        "reportlab/platypus.py": "class _Placeholder:\n    def __init__(self, *args, **kwargs): pass\n    def __call__(self, *args, **kwargs): return self\nSimpleDocTemplate = Paragraph = Spacer = Table = TableStyle = _Placeholder\n",
    }
    for relative_path, content in files.items():
        path = support / relative_path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")


async def _stream_container(command: list[str], timeout: int, on_line: Callable[[str], Any]) -> int:
    process = await asyncio.create_subprocess_exec(*command, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT)
    async def reader() -> None:
        assert process.stdout is not None
        while line := await process.stdout.readline():
            outcome = on_line(line.decode("utf-8", errors="replace").rstrip())
            if inspect.isawaitable(outcome):
                await outcome
    task = asyncio.create_task(reader())
    try:
        return await asyncio.wait_for(process.wait(), timeout=timeout)
    except asyncio.TimeoutError:
        process.kill(); await process.wait(); raise
    finally:
        await task


async def run_phantom(scan_dir: str, findings: List[Dict], broadcast: Callable) -> Dict[str, Any]:
    """Run a real code path in Docker or return an explicit unavailable/error state."""
    start, log_lines, captured = datetime.now(), [], []
    def timestamp() -> str:
        elapsed = (datetime.now() - start).total_seconds()
        return f"[{int(elapsed // 60):02d}:{elapsed % 60:05.2f}]"
    async def emit(message: str) -> None:
        line = f"{timestamp()} {message}"
        log_lines.append(line)
        await broadcast({"phase": "phantom", "status": "log", "line": line, "message": line})

    if NETWORK_MODE.lower() != "none":
        await emit("Sandbox configuration error: SANDBOX_NETWORK_MODE must be 'none'; no code was executed.")
        return {"log_lines": log_lines, "captured_events": 0, "confirmed_exploitable": False, "docker_used": False, "network_isolated": False, "error": "SANDBOX_NETWORK_MODE must be none."}
    ready, version = await asyncio.to_thread(_docker_ready)
    if not ready:
        await emit(f"Sandbox unavailable: {version} No code was executed.")
        return {"log_lines": log_lines, "captured_events": 0, "confirmed_exploitable": False, "docker_used": False, "network_isolated": False, "error": version}
    source = Path(scan_dir).resolve()
    finding = next((item for item in findings if _execution_target(source, item)), None)
    if finding is None:
        await emit("No executable Python code path references a detected credential; no simulated result was produced.")
        return {"log_lines": log_lines, "captured_events": 0, "confirmed_exploitable": False, "docker_used": False, "network_isolated": False, "error": "No executable Python code path found."}
    target = _execution_target(source, finding)
    assert target is not None
    baseline = await asyncio.to_thread(_running_container_count)
    root = Path(tempfile.mkdtemp(prefix="nyx-phantom-")); repo, support = root / "repo", root / "support"
    name = f"nyx-phantom-{uuid.uuid4().hex[:12]}"
    try:
        substitutions = await asyncio.to_thread(_copy_with_decoys, source, findings, repo)
        support.mkdir()
        (support / "sitecustomize.py").write_text(SITECUSTOMIZE, encoding="utf-8")
        (support / "run_target.py").write_text(RUN_TARGET, encoding="utf-8")
        _write_import_stubs(support)
        relative_target = target.relative_to(source).as_posix()
        await emit(f"Docker {version} ready. Baseline running-container count: {baseline if baseline is not None else 'unavailable'}.")
        for item in substitutions: await emit(f"Substituted same-shape decoy for {item['detector']}; raw credential was not mounted into the container.")
        probe_lines: list[str] = []
        probe = [_docker_binary(), "run", "--rm", "--network", "none", "--cap-drop", "ALL", PYTHON_IMAGE, "python", "-c", NETWORK_PROBE]
        await emit("Verifying Docker network isolation with a direct outbound connection probe to 1.1.1.1:443.")
        probe_exit = await _stream_container(probe, 20, lambda line: probe_lines.append(line))
        isolated = probe_exit == 0 and "NYX_NETWORK_PROBE_BLOCKED" in "\n".join(probe_lines)
        if not isolated:
            await emit("Network-isolation verification failed; target code was not executed.")
            return {"log_lines": log_lines, "captured_events": 0, "confirmed_exploitable": False, "docker_used": True, "network_isolated": False, "error": "Docker did not block the outbound probe."}
        await emit("Network isolation verified: direct outbound connection was blocked by Docker's none network.")
        async def process_line(line: str) -> None:
            marker = "NYX_PHANTOM_EVENT "
            if marker in line:
                try:
                    destination = str(json.loads(line.split(marker, 1)[1]).get("destination") or "unknown destination")
                    captured.append({"destination": destination, "action": "connect"})
                    await emit(f"CAPTURED: Attempted outbound connection to {destination} — blocked by interceptor; Docker network=none.")
                except Exception: await emit("CAPTURED: Outbound connection attempt blocked; destination could not be decoded.")
            elif line:
                safe = redact(line, list(findings) + [{"raw_secret": item["decoy"]} for item in substitutions])
                await emit(f"Container: {safe[:240]}")
        command = [_docker_binary(), "run", "--rm", "--name", name, "--network", "none", "--cap-drop", "ALL", "--read-only", "--pids-limit", "128", "--memory", "256m", "--cpus", "0.5", "--tmpfs", "/tmp:rw,noexec,nosuid,size=32m", "-e", "PYTHONPATH=/nyx", "-v", f"{repo}:/workspace:ro", "-v", f"{support}:/nyx:ro", "-w", "/workspace", PYTHON_IMAGE, "python", "-u", "/nyx/run_target.py", f"/workspace/{relative_target}"]
        await emit(f"Executing actual code path {relative_target} inside the isolated Docker sandbox.")
        try: exit_code = await _stream_container(command, RUN_TIMEOUT_SECONDS, process_line)
        except asyncio.TimeoutError:
            await emit(f"Sandbox timed out after {RUN_TIMEOUT_SECONDS}s; container was terminated.")
            return {"log_lines": log_lines, "captured_events": len(captured), "confirmed_exploitable": bool(captured), "docker_used": True, "network_isolated": True, "error": "Sandbox execution timed out."}
        if exit_code != 0: await emit(f"Sandbox container exited with code {exit_code}.")
        await emit(f"Sandbox complete. {len(captured)} outbound connection attempt(s) captured from the executed code path.")
        return {"log_lines": log_lines, "captured_events": len(captured), "confirmed_exploitable": bool(captured), "docker_used": True, "network_isolated": True, "target": relative_target, "container_exit_code": exit_code, "summary": f"Executed {relative_target} with decoy credentials in Docker network=none; captured {len(captured)} blocked outbound attempt(s)."}
    except Exception as error:
        await emit(f"Sandbox error: {type(error).__name__}: {str(error)[:180]}")
        return {"log_lines": log_lines, "captured_events": len(captured), "confirmed_exploitable": bool(captured), "docker_used": True, "network_isolated": False, "error": "Sandbox execution failed."}
    finally:
        await asyncio.to_thread(_run, [_docker_binary(), "rm", "-f", name], 10)
        final = await asyncio.to_thread(_running_container_count)
        if baseline is not None and final is not None: await emit(f"Container cleanup check: running-container count {baseline} -> {final}.")
        shutil.rmtree(root, ignore_errors=True)
