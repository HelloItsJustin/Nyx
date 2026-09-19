"""
Remediation Agent
Generates fixes for findings and creates real GitHub PRs.
For FinForge: uses hardcoded fixes from finforge_cache.py.
For other repos: uses LLM to generate fix suggestions.
"""
import os
import asyncio
import base64
import json
import re
import uuid
from urllib.parse import quote
from typing import List, Dict, Any, Callable, Optional
from llm_client import llm_call
from redaction.redactor import redact


def _formal_pr_metadata_fallback(fix_data: Dict[str, Any], known_findings: List[Dict[str, str]]) -> tuple[str, str, str]:
    """Local formal metadata when both configured LLM providers are unavailable.

    The GitHub change is still exact-line verified below. This fallback has no network
    dependency and is generated only from redacted finding metadata, never source text.
    """
    title = str(fix_data.get("title") or "Remediate security finding").strip()
    file_path = str(fix_data.get("file") or "the affected file").strip()
    severity = str(fix_data.get("severity") or "security").strip().upper()
    change = str(fix_data.get("fix") or "Replace the exposed value with safe configuration.").strip()
    body = (
        "## Summary\n"
        f"Addresses the {severity} finding: {title}.\n\n"
        "## Changes\n"
        f"Updates `{file_path}` with the targeted remediation. {change}\n\n"
        "## Verification\n"
        "- Nyx verified the exact scanned source line before creating this change.\n"
        "- The change contains no credential value.\n"
        "- Review the branch before merging and rotate any affected credential."
    )
    return (
        redact(f"Security: {title}", known_findings)[:240],
        redact(body, known_findings),
        redact(f"security: remediate {title}", known_findings)[:240],
    )


async def generate_pr_metadata_with_llm(fix_data: Dict[str, Any]) -> tuple[str, str, str]:
    """Create formal PR metadata through the mandatory redacted LLM boundary."""
    before = str(fix_data.get("diff", {}).get("before", ""))
    known_findings = [{"raw_secret": before}] if before else []
    prompt = f"""
Generate formal GitHub pull-request metadata for a security remediation.

Finding metadata only:
- File: {fix_data.get('file', 'unknown')}
- Severity: {fix_data.get('severity', 'unknown')}
- Finding title: {fix_data.get('title', 'Security remediation')}
- Intended change: {fix_data.get('fix', 'Remove the exposed value and use local configuration.')}

Never include, infer, quote, or reconstruct a credential value. Return JSON only:
{{
  "title": "Security: concise formal title",
  "body": "## Summary\\n...\\n\\n## Changes\\n...\\n\\n## Verification\\n...",
  "commit_message": "security: concise imperative message"
}}
"""
    try:
        response = await llm_call(
            prompt,
            system="You write formal security pull requests. Use only supplied metadata. Never mention raw credentials.",
            known_findings=known_findings,
        )
        text = response["text"].strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.lstrip().startswith("json"):
                text = text.lstrip()[4:]
        data = json.loads(text.strip())
        title = str(data.get("title") or "").strip()
        body = str(data.get("body") or "").strip()
        commit_message = str(data.get("commit_message") or "").strip()
        if not title or not commit_message or not all(section in body for section in ("## Summary", "## Changes", "## Verification")):
            raise ValueError("the response did not contain the required formal PR sections")
        return title[:240], body, commit_message[:240]
    except Exception:
        # Gemini/Groq remains the primary author. A provider outage must not prevent
        # an exact, redacted fix from being reviewable through Auto-PR.
        return _formal_pr_metadata_fallback(fix_data, known_findings)


async def generate_fix_with_llm(finding: Dict[str, Any]) -> Dict[str, Any]:
    """Generate a remediation fix using LLM for non-FinForge repos."""
    prompt = f"""
You are a security engineer reviewing a credential exposure finding.

Finding:
- File: {finding.get('file', 'unknown')}
- Line: {finding.get('line', 0)}
- Detector: {finding.get('detector', 'unknown')}
- Severity: {finding.get('severity', 'MEDIUM')}
- Verification status: {finding.get('status', 'unverified')}
- Masked preview: {finding.get('secret_preview', '[not applicable]')}

Do not ask for or reconstruct credential values. You may reason only from the metadata
above and must use a generic environment-variable replacement where a secret is involved.

Provide a JSON response with these exact fields:
{{
  "title": "Brief fix title (max 60 chars)",
  "fix": "1-2 sentence plain English fix description",
  "before": "the problematic line of code (exactly as it appears)",
  "after": "the fixed replacement line",
  "branch": "nyx/fix-brief-slug",
  "commit_message": "security: brief description of fix",
  "pr_title": "Security: Brief PR title",
  "pr_body": "2-3 sentence PR description explaining the risk and fix"
}}

Respond ONLY with the JSON object, no markdown, no explanation.
"""
    try:
        result = await llm_call(
            prompt,
            system="You are a security engineer. Respond only with valid JSON.",
            known_findings=[finding],
        )
        import json
        text = result["text"].strip()
        # Strip markdown code blocks if present
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        return json.loads(text.strip())
    except Exception as e:
        return {
            "title": f"Fix {finding.get('detector', 'credential')} exposure",
            "fix": f"Remove {finding.get('detector', 'credential')} from version control and inject via environment variables.",
            "before": finding.get("secret_preview", "# sensitive value redacted"),
            "after": "# Value injected via environment variable",
            "branch": f"nyx/fix-{finding['id'][:20]}",
            "commit_message": f"security: remediate {finding.get('detector', 'credential')} exposure",
            "pr_title": f"Security: Fix {finding.get('detector', 'Secret')} exposure",
            "pr_body": f"Removes exposed {finding.get('detector', 'credential')} from {finding.get('file', 'codebase')}. Severity: {finding.get('severity', 'MEDIUM')}.",
        }


async def run_remediation(scan_dir: str, findings: List[Dict], repo_url: Optional[str], broadcast: Callable) -> Dict[str, Any]:
    """Generate fixes for all findings."""
    fixes = []
    
    # Focus on HIGH/CRITICAL findings first
    priority_findings = sorted(findings, key=lambda f: {
        "CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3
    }.get(f.get("severity", "LOW"), 3))[:10]  # Cap at 10 fixes
    
    for finding in priority_findings:
        fix_data = await generate_fix_with_llm(finding)
        fix = {
            "id": f"fix-{finding['id']}",
            "finding_id": finding["id"],
            "severity": finding.get("severity", "MEDIUM"),
            "file": finding.get("file", "unknown"),
            "issue": finding.get("description", ""),
            "diff": {
                "before": fix_data.get("before", finding.get("secret_preview", "")),
                "after": fix_data.get("after", "# See fix description"),
            },
            **fix_data
        }
        fixes.append(fix)
        await broadcast({
            "phase": "remediation",
            "status": "fix",
            "fix": fix,
            "index": len(fixes) - 1,
            "message": f"Fix ready: {fix.get('title', 'Fix generated')}"
        })
        await asyncio.sleep(0.5)

    return {"fixes": fixes}


async def create_github_pr(repo_url: str, fix_data: Dict, broadcast: Callable) -> str:
    """
    Create a real GitHub pull request for a fix.
    Steps: create branch -> commit file change -> open PR.
    Returns the real PR URL.
    """
    import httpx
    token = os.environ.get("GITHUB_ACCESS_TOKEN", "")
    
    if not token:
        raise ValueError("GitHub token is not validated for this session. Paste and validate a personal access token before creating a PR.")
    
    # Handles HTTPS and SSH GitHub URLs, including a trailing slash or query string.
    m = re.search(r'github\.com[/:]([^/]+)/([^/#?\s]+?)(?:\.git)?/?(?:[?#].*)?$', repo_url.strip())
    if not m:
        raise ValueError(f"Cannot parse GitHub repo from URL: {repo_url}")
    owner, repo = m.group(1), m.group(2)

    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "User-Agent": "Nyx-CLI/2.0",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    base_url = f"https://api.github.com/repos/{owner}/{repo}"

    def github_error(response: Any, action: str) -> ValueError:
        """Return an actionable error without exposing credentials or response internals."""
        try:
            message = response.json().get("message", "")
        except Exception:
            message = response.text[:300]
        suffix = f": {message}" if message else ""
        return ValueError(f"GitHub could not {action} (HTTP {response.status_code}){suffix}")

    def safe_branch_name(value: str) -> str:
        value = re.sub(r"[^A-Za-z0-9._/-]+", "-", value.strip()).strip("./-")
        return (value or f"nyx/fix-{fix_data.get('finding_id', 'security-issue')}")[:180]

    async with httpx.AsyncClient(timeout=30.0) as client:
        # Get default branch
        r = await client.get(f"{base_url}", headers=headers)
        if not r.is_success:
            raise github_error(r, "read the repository")
        default_branch = r.json().get("default_branch", "main")

        # Get base branch SHA
        base_ref = quote(default_branch, safe="")
        r = await client.get(f"{base_url}/git/ref/heads/{base_ref}", headers=headers)
        if not r.is_success:
            raise github_error(r, f"read the {default_branch} branch")
        base_sha = r.json()["object"]["sha"]

        # Generate the formal PR text before making any GitHub write. The wrapper accepts
        # only redacted prompts and never receives the credential value from the source.
        pr_title, pr_body, commit_message = await generate_pr_metadata_with_llm(fix_data)

        # Reuse an existing open PR for this exact fix instead of creating duplicates.
        branch_name = safe_branch_name(fix_data.get("branch", f"nyx/fix-{fix_data.get('finding_id', 'issue')}"))
        r = await client.get(
            f"{base_url}/pulls",
            headers=headers,
            params={"state": "open", "head": f"{owner}:{branch_name}"},
        )
        if r.is_success and r.json():
            pr_url = r.json()[0]["html_url"]
            await broadcast({
                "phase": "remediation",
                "status": "pr_created",
                "fix_id": fix_data.get("id"),
                "finding_id": fix_data.get("finding_id"),
                "pr_url": pr_url,
                "message": f"Existing PR found: {pr_url}",
            })
            return pr_url

        # Never write a new change onto a stale branch. A retry gets its own branch.
        existing_ref = await client.get(
            f"{base_url}/git/ref/heads/{quote(branch_name, safe='')}", headers=headers
        )
        if existing_ref.status_code == 200:
            branch_name = f"{branch_name[:165]}-{uuid.uuid4().hex[:8]}"
        elif existing_ref.status_code != 404:
            raise github_error(existing_ref, "check the fix branch")

        # Create a branch from the repository's current default branch.
        await broadcast({"phase": "remediation", "status": "pr", "message": f"Creating branch: {branch_name}"})
        r = await client.post(f"{base_url}/git/refs", headers=headers, json={
            "ref": f"refs/heads/{branch_name}",
            "sha": base_sha
        })
        if r.status_code != 201:
            raise github_error(r, "create the fix branch")

        # Get the exact current target file. Nyx never substitutes an unrelated
        # .gitignore edit when a stale finding points at a removed file.
        file_path = str(fix_data.get("file", "")).strip().lstrip("/")
        if not file_path or ".." in file_path.split("/"):
            raise ValueError("The generated fix has an invalid target file path.")
        r = await client.get(
            f"{base_url}/contents/{quote(file_path, safe='/')}",
            headers=headers,
            params={"ref": branch_name},
        )
        if not r.is_success:
            if r.status_code == 404:
                raise ValueError(f"Nyx could not safely apply this fix: {file_path} is no longer tracked. Rescan the repository before creating a PR.")
            raise github_error(r, f"read {file_path}")
        file_info = r.json()
        if not isinstance(file_info, dict) or not file_info.get("sha"):
            raise ValueError(f"{file_path} is not a file that Nyx can safely update.")
        try:
            current_content = base64.b64decode(file_info.get("content", "")).decode("utf-8")
        except (UnicodeDecodeError, ValueError) as error:
            raise ValueError(f"{file_path} is not valid UTF-8 text and cannot be safely patched.") from error
        current_sha = file_info["sha"]

        # Normal fixes require an exact source match. Appending a placeholder comment
        # would create a real PR that does not contain the promised security fix.
        before_code = fix_data.get("diff", {}).get("before", "")
        after_code = fix_data.get("diff", {}).get("after", "")
        if not before_code:
            raise ValueError("The generated fix does not include source text to replace.")
        if before_code not in current_content:
            raise ValueError(
                f"Nyx could not safely apply this fix: {file_path} no longer matches the scanned source."
            )
        new_content = current_content.replace(before_code, after_code, 1)

        # Commit the change
        commit_payload = {
            "message": commit_message,
            "content": base64.b64encode(new_content.encode("utf-8")).decode("utf-8"),
            "branch": branch_name,
        }
        if current_sha:
            commit_payload["sha"] = current_sha

        await broadcast({"phase": "remediation", "status": "pr", "message": "Committing fix..."})
        r = await client.put(
            f"{base_url}/contents/{quote(file_path, safe='/')}", headers=headers, json=commit_payload
        )
        if r.status_code not in (200, 201):
            raise github_error(r, f"commit the change to {file_path}")

        # Create PR
        await broadcast({"phase": "remediation", "status": "pr", "message": "Opening pull request..."})
        r = await client.post(f"{base_url}/pulls", headers=headers, json={
            "title": pr_title,
            "body": pr_body,
            "head": branch_name,
            "base": default_branch,
        })
        if r.status_code != 201:
            raise github_error(r, "open the pull request")
        pr_url = r.json()["html_url"]
        
        await broadcast({
            "phase": "remediation",
            "status": "pr_created",
            "fix_id": fix_data.get("id"),
            "finding_id": fix_data.get("finding_id"),
            "pr_url": pr_url,
            "message": f"PR created: {pr_url}"
        })
        return pr_url
