"""
Detection Agent - TruffleHog + supplementary entropy/MCP pass.
For FinForge: returns pre-computed findings.
For all other repos: runs live TruffleHog scan + custom passes.
"""
import os
import json
import math
import re
import subprocess
import asyncio
from typing import List, Dict, Any, Callable
from redaction.redactor import mask_secret, redact

TRUFFLEHOG_FLAGS = [
    "--results=verified,unverified,unknown,filtered_unverified",
    "--filter-entropy=3.0",
    "--include-detectors=all",
    "--allow-verification-overlap",
    "--max-decode-depth=8",
    "--json",
    "--no-update",
]

# High-entropy string patterns (Shannon entropy > 4.5 threshold)
ENTROPY_THRESHOLD = 4.5
MIN_SECRET_LEN = 20

# MCP/config structural patterns
MCP_PATTERNS = [
    (re.compile(r'"Access-Control-Allow-Origin"\s*:\s*"\*"'), "Permissive CORS wildcard", "MEDIUM"),
    (re.compile(r'\bdebug\s*[=:]\s*true', re.IGNORECASE), "Debug mode enabled", "LOW"),
    (re.compile(r'\bRATE_LIMIT\b', re.IGNORECASE), None, None),  # absence check
    (re.compile(r'ssl\s*[=:]\s*false', re.IGNORECASE), "SSL disabled", "HIGH"),
    (re.compile(r'verify\s*[=:]\s*false', re.IGNORECASE), "SSL verification disabled", "HIGH"),
]

SKIP_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2',
                   '.ttf', '.eot', '.mp4', '.mp3', '.pdf', '.zip', '.lock'}


def shannon_entropy(s: str) -> float:
    if not s:
        return 0.0
    counts = {}
    for c in s:
        counts[c] = counts.get(c, 0) + 1
    length = len(s)
    return -sum((v / length) * math.log2(v / length) for v in counts.values())


def public_finding(finding: Dict[str, Any]) -> Dict[str, Any]:
    """Remove raw detector output before a finding reaches the browser or report."""
    safe = {key: value for key, value in finding.items() if key not in {"raw_secret", "raw_value"}}
    if finding.get("raw_secret"):
        safe["secret_preview"] = mask_secret(str(finding["raw_secret"]))
        safe["context"] = redact(str(finding.get("context", "")), [finding])
    return safe


def supplementary_pass(scan_dir: str) -> List[Dict[str, Any]]:
    """Run entropy scoring + MCP structural rules on files."""
    findings = []
    string_pattern = re.compile(r'["\']([A-Za-z0-9+/=_\-]{20,})["\']')
    
    for root, dirs, files in os.walk(scan_dir):
        # Skip hidden dirs and node_modules
        dirs[:] = [d for d in dirs if not d.startswith('.') and d not in ('node_modules', '__pycache__', '.git', 'dist', 'build')]
        
        for fname in files:
            ext = os.path.splitext(fname)[1].lower()
            if ext in SKIP_EXTENSIONS:
                continue
            
            fpath = os.path.join(root, fname)
            rel_path = os.path.relpath(fpath, scan_dir)
            
            try:
                with open(fpath, 'r', encoding='utf-8', errors='ignore') as f:
                    content = f.read()
                    lines = content.split('\n')
            except Exception:
                continue
            
            # Entropy scan
            for line_no, line in enumerate(lines, 1):
                for match in string_pattern.finditer(line):
                    candidate = match.group(1)
                    if len(candidate) < MIN_SECRET_LEN:
                        continue
                    ent = shannon_entropy(candidate)
                    if ent >= ENTROPY_THRESHOLD:
                        findings.append({
                            "id": f"entropy-{rel_path}-{line_no}",
                            "engine": "custom-entropy",
                            "detector": "HighEntropyString",
                            "severity": "MEDIUM",
                            "verified": False,
                            "status": "unverified",
                            "file": rel_path,
                            "line": line_no,
                            "description": f"High-entropy string (entropy={ent:.2f}) in {fname}",
                            "secret_preview": mask_secret(candidate),
                            "context": line.strip()[:120],
                            "raw_secret": candidate,
                            "recommendation": "Review this value. If it is a secret, move it to environment variables.",
                            "blast_radius_tier": "MEDIUM",
                        })
            
            # MCP structural rules
            for pattern, description, severity in MCP_PATTERNS:
                if description is None:
                    continue
                for line_no, line in enumerate(lines, 1):
                    if pattern.search(line):
                        findings.append({
                            "id": f"mcp-{rel_path}-{line_no}",
                            "engine": "custom-mcp",
                            "detector": "MCPConfig",
                            "severity": severity,
                            "verified": False,
                            "status": "unverified",
                            "file": rel_path,
                            "line": line_no,
                            "description": description + f" in {fname}",
                            "secret_preview": line.strip()[:60],
                            "context": line.strip()[:120],
                            "recommendation": "Review this configuration setting for security implications.",
                            "blast_radius_tier": severity,
                        })
    
    return findings


async def run_detection(scan_dir: str, broadcast: Callable) -> List[Dict[str, Any]]:
    """Run TruffleHog + supplementary pass. Broadcast findings as found."""
    findings = []
    trufflehog_bin = os.environ.get("TRUFFLEHOG_BINARY_PATH", "trufflehog")
    
    await broadcast({"phase": "detection", "status": "scanning", "message": "Running TruffleHog..."})
    
    try:
        cmd = [trufflehog_bin, "filesystem", scan_dir] + TRUFFLEHOG_FLAGS
        result = await asyncio.to_thread(
            subprocess.run, cmd,
            capture_output=True, timeout=120
        )
        
        # TruffleHog outputs one JSON object per line
        for line in result.stdout.decode('utf-8', errors='ignore').split('\n'):
            line = line.strip()
            if not line:
                continue
            try:
                data = json.loads(line)
                severity = "HIGH" if data.get("Verified", False) else "MEDIUM"
                finding = {
                    "id": f"th-{len(findings)}",
                    "engine": "trufflehog",
                    "detector": data.get("DetectorName", "Unknown"),
                    "severity": "CRITICAL" if data.get("Verified") else severity,
                    "verified": data.get("Verified", False),
                    "status": "verified-live" if data.get("Verified") else "unverified",
                    "file": data.get("SourceMetadata", {}).get("Data", {}).get("Filesystem", {}).get("file", "unknown"),
                    "line": data.get("SourceMetadata", {}).get("Data", {}).get("Filesystem", {}).get("line", 0),
                    "description": f"{data.get('DetectorName', 'Secret')} detected",
                    "secret_preview": mask_secret(data.get("RawV2") or data.get("Raw", "")),
                    "context": str(data.get("SourceMetadata", ""))[:120],
                    "raw_secret": data.get("RawV2") or data.get("Raw", ""),
                    "recommendation": "Rotate this credential immediately and remove from version control history.",
                    "blast_radius_tier": "CRITICAL" if data.get("Verified") else "HIGH",
                }
                findings.append(finding)
                await broadcast({
                    "phase": "detection",
                    "status": "finding",
                    "finding": public_finding(finding),
                    "index": len(findings) - 1,
                    "message": f"TruffleHog: {finding['description']}"
                })
                await asyncio.sleep(0.1)
            except json.JSONDecodeError:
                pass

    except subprocess.TimeoutExpired:
        await broadcast({"phase": "detection", "status": "warning", "message": "TruffleHog timed out after 120s"})
    except FileNotFoundError:
        await broadcast({"phase": "detection", "status": "warning", "message": "TruffleHog binary not found, running supplementary pass only"})
    except Exception as e:
        await broadcast({"phase": "detection", "status": "warning", "message": f"TruffleHog error: {str(e)[:100]}"})

    # Supplementary pass
    await broadcast({"phase": "detection", "status": "scanning", "message": "Running entropy + config analysis..."})
    supp = await asyncio.to_thread(supplementary_pass, scan_dir)
    
    for f in supp:
        findings.append(f)
        await broadcast({
            "phase": "detection",
            "status": "finding",
            "finding": public_finding(f),
            "index": len(findings) - 1,
            "message": f"Custom: {f['description'][:60]}"
        })
        await asyncio.sleep(0.2)

    return findings
