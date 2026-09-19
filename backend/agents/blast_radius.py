"""Evidence-first blast-radius graph construction.

Nodes are local repository files only. Edges exist only when a traversal extracts a
specific shared reference or import and records the files, lines, and matching token.
"""
from __future__ import annotations

import asyncio
import hashlib
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Dict, Iterable, List


SKIP_DIRECTORIES = {".git", "node_modules", "__pycache__", "dist", "build", ".venv", "venv"}
SKIP_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".woff", ".woff2", ".pdf", ".zip", ".lock"}
ENV_ASSIGNMENT = re.compile(r"\b([A-Z][A-Z0-9_]{2,})\s*[=:]")
PYTHON_IMPORT = re.compile(r"^\s*(?:from\s+([\w.]+)\s+import|import\s+([\w.]+))")
JS_IMPORT = re.compile(r"(?:from\s+|require\()['\"]([^'\"]+)['\"]")


@dataclass(frozen=True)
class FileLine:
    path: str
    line: int
    text: str


def _safe_relpath(scan_dir: Path, path: Path) -> str:
    return path.relative_to(scan_dir).as_posix()


def _read_files(scan_dir: str) -> Dict[str, List[str]]:
    root = Path(scan_dir).resolve()
    if not root.is_dir():
        raise ValueError("Blast-radius traversal requires a readable repository directory.")
    files: Dict[str, List[str]] = {}
    for directory, directories, names in os.walk(root):
        directories[:] = [name for name in directories if name not in SKIP_DIRECTORIES and not name.startswith(".")]
        for name in names:
            path = Path(directory) / name
            if path.suffix.lower() in SKIP_EXTENSIONS or (path.name.startswith(".") and path.name not in {".env.example", ".env.example.demo"}):
                continue
            try:
                files[_safe_relpath(root, path)] = path.read_text(encoding="utf-8", errors="ignore").splitlines()
            except (OSError, UnicodeError):
                continue
    return files


def _node_type(path: str) -> str:
    lower = path.lower()
    if lower.endswith((".json", ".yaml", ".yml", ".toml", ".ini", ".env", ".example", ".txt")) or "/config" in lower:
        return "config"
    if "test" in lower:
        return "test"
    if "route" in lower or "api" in lower:
        return "route"
    if "model" in lower or "database" in lower:
        return "model"
    return "source"


def _risk_for(path: str, findings: Iterable[Dict[str, Any]]) -> str:
    severity = {"CRITICAL": 4, "HIGH": 3, "MEDIUM": 2, "LOW": 1}
    reverse = {4: "CRITICAL", 3: "HIGH", 2: "MEDIUM", 1: "LOW"}
    value = 1
    for finding in findings:
        if finding.get("file") == path:
            value = max(value, severity.get(str(finding.get("blast_radius_tier") or finding.get("severity") or "LOW"), 1))
    return reverse[value]


def _line_references(lines: List[str], reference: str) -> list[FileLine]:
    pattern = re.compile(rf"(?<![A-Z0-9_]){re.escape(reference)}(?![A-Z0-9_])")
    return [FileLine("", index, line) for index, line in enumerate(lines, 1) if pattern.search(line)]


def _finding_reference_lines(path: str, lines: List[str], finding: Dict[str, Any]) -> list[FileLine]:
    """Extract only a real assignment key from the finding's current source line.

    Uppercase words inside comments/values (for example ``NYX`` or ``DEMO``) are not
    configuration keys and must never create a graph connection.
    """
    line_number = int(finding.get("line") or 0)
    if not 1 <= line_number <= len(lines):
        return []
    match = ENV_ASSIGNMENT.search(lines[line_number - 1])
    return [FileLine(path, line_number, match.group(1))] if match else []


def _resolve_import(scan_dir: Path, source_path: str, module: str, *, allow_absolute: bool = False) -> str | None:
    if not module or (not module.startswith(".") and not allow_absolute):
        return None
    module_path = module.lstrip(".").replace(".", "/")
    source_base = (scan_dir / source_path).parent
    bases = [source_base / module_path]
    if allow_absolute and not module.startswith("."):
        bases.append(scan_dir / module_path)
    candidates = list(bases)
    for candidate_base in bases:
        if not candidate_base.suffix:
            candidates.extend([
                candidate_base.with_suffix(".js"), candidate_base.with_suffix(".ts"), candidate_base.with_suffix(".tsx"),
                candidate_base.with_suffix(".py"), candidate_base / "index.js", candidate_base / "__init__.py",
            ])
    for candidate in candidates:
        try:
            rel = candidate.relative_to(scan_dir.resolve())
        except ValueError:
            continue
        if candidate.is_file():
            return rel.as_posix()
    return None


def _edge(source: str, target: str, kind: str, match: str, source_line: int, target_line: int) -> dict[str, Any]:
    description = (
        f"{source}:{source_line} and {target}:{target_line} reference {match}"
        if kind == "shared_reference"
        else f"{source}:{source_line} imports {target} via {match}"
    )
    digest = hashlib.sha256(f"{source}|{target}|{kind}|{match}|{source_line}|{target_line}".encode()).hexdigest()[:16]
    return {
        "id": f"edge-{digest}", "source": source, "target": target, "type": kind,
        "evidence": {
            "kind": kind, "match": match,
            "source": {"file": source, "line": source_line},
            "target": {"file": target, "line": target_line},
            "description": description,
        },
    }


def _import_edges(scan_dir: Path, files: Dict[str, List[str]]) -> list[dict[str, Any]]:
    edges: list[dict[str, Any]] = []
    for path, lines in files.items():
        suffix = Path(path).suffix.lower()
        for line_number, line in enumerate(lines, 1):
            target: str | None = None
            matched = ""
            if suffix == ".py":
                match = PYTHON_IMPORT.search(line)
                if match:
                    module = match.group(1) or match.group(2) or ""
                    target = _resolve_import(scan_dir, path, module, allow_absolute=True)
                    matched = module
            elif suffix in {".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"}:
                match = JS_IMPORT.search(line)
                if match:
                    matched = match.group(1)
                    target = _resolve_import(scan_dir, path, matched)
            if target and target in files:
                edges.append(_edge(path, target, "imports", matched, line_number, 1))
    return edges


def _validate_graph(scan_dir: str, graph: Dict[str, Any]) -> None:
    root = Path(scan_dir).resolve()
    node_ids = {node["id"] for node in graph["nodes"]}
    for node in graph["nodes"]:
        backing_file = node.get("backing_file")
        if not backing_file or not (root / backing_file).is_file() or not node.get("evidence"):
            raise ValueError(f"Blast-radius integrity failure: missing backing file for node {node.get('id')!r}.")
    for edge in graph["edges"]:
        evidence = edge.get("evidence") or {}
        if edge.get("source") not in node_ids or edge.get("target") not in node_ids or not evidence.get("match") or not evidence.get("description"):
            raise ValueError("Blast-radius integrity failure: edge lacks verifiable evidence.")


def build_blast_graph(scan_dir: str, findings: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Build a sparse graph entirely from the current repository snapshot."""
    root = Path(scan_dir).resolve()
    files = _read_files(scan_dir)
    edges: list[dict[str, Any]] = []
    included_paths: set[str] = set()
    source_hits: dict[str, list[FileLine]] = {}

    for finding in findings:
        path = str(finding.get("file") or "").replace("\\", "/").lstrip("/")
        if path not in files:
            continue
        included_paths.add(path)
        hits = _finding_reference_lines(path, files[path], finding)
        if hits:
            source_hits.setdefault(path, []).extend(hits)

    for source, hits in source_hits.items():
        for hit in hits:
            for target, target_lines in files.items():
                if target == source:
                    continue
                for target_hit in _line_references(target_lines, hit.text):
                    included_paths.update({source, target})
                    edges.append(_edge(source, target, "shared_reference", hit.text, hit.line, target_hit.line))

    for edge in _import_edges(root, files):
        if edge["source"] in included_paths or edge["target"] in included_paths:
            included_paths.update({edge["source"], edge["target"]})
            edges.append(edge)

    unique_edges = {edge["id"]: edge for edge in edges}
    node_evidence: dict[str, list[dict[str, Any]]] = {
        path: [
            {"file": path, "line": int(finding.get("line") or 0), "match": finding.get("detector", "finding")}
            for finding in findings if finding.get("file") == path
        ]
        for path in included_paths
    }
    # Import-connected files can be nodes even without a direct detector finding.
    # Give them a click target from the concrete traversal evidence that admitted them.
    for edge in unique_edges.values():
        evidence = edge["evidence"]
        for endpoint in ("source", "target"):
            location = evidence[endpoint]
            node_evidence.setdefault(location["file"], []).append({
                "file": location["file"], "line": location["line"], "match": evidence["match"],
            })
    nodes = [
        {
            "id": path, "backing_file": path, "type": _node_type(path), "risk": _risk_for(path, findings),
            "label": Path(path).name, "description": "Verified repository file",
            "evidence": node_evidence.get(path, []),
        }
        for path in sorted(included_paths)
    ]
    tier = "CRITICAL" if any(node["risk"] == "CRITICAL" for node in nodes) else "HIGH" if any(node["risk"] == "HIGH" for node in nodes) else "MEDIUM"
    graph = {
        "nodes": nodes, "edges": list(unique_edges.values()),
        "summary": {
            "tier": tier, "reach": len(nodes), "external_services": 0, "affected_files": len(nodes),
            "description": f"Evidence-backed blast radius spans {len(nodes)} repository files and {len(unique_edges)} verified links.",
        },
    }
    _validate_graph(scan_dir, graph)
    return graph


async def run_blast_radius(scan_dir: str, findings: List[Dict[str, Any]], broadcast: Callable) -> Dict[str, Any]:
    graph = await asyncio.to_thread(build_blast_graph, scan_dir, findings)
    for node in graph["nodes"]:
        await asyncio.sleep(0.15)
        await broadcast({"phase": "blast_radius", "status": "node", "node": node, "message": f"Verified file node: {node['id']}"})
    return graph
