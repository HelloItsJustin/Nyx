"""Session-only personal-access-token validation for GitHub Auto-PR."""
from __future__ import annotations

import os
import re
from dataclasses import dataclass
from typing import Any

import httpx

API_ROOT = "https://api.github.com"


@dataclass
class GitHubTokenValidationError(ValueError):
    message: str
    status_code: int = 400

    def __str__(self) -> str:
        return self.message


def configured_target(repo_url: str | None = None) -> tuple[str, str]:
    if repo_url:
        match = re.search(r"github\.com[/:]([^/]+)/([^/#?\s]+?)(?:\.git)?/?(?:[?#].*)?$", repo_url.strip())
        if not match:
            raise GitHubTokenValidationError("Nyx can validate Auto-PR access only for a GitHub repository URL.")
        return match.group(1), match.group(2)
    return os.environ.get("GITHUB_TARGET_OWNER", "HelloItsJustin"), os.environ.get("GITHUB_TARGET_REPO", "FinForge")


def _headers(token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "User-Agent": "Nyx-Local/2.0",
        "X-GitHub-Api-Version": "2022-11-28",
    }


def _token_kind(response: httpx.Response) -> str:
    """Only labels errors; X-OAuth-Scopes is never used for authorization."""
    return "classic" if response.headers.get("x-oauth-scopes", "").strip() else "fine-grained"


def _missing_write_access(token_kind: str) -> GitHubTokenValidationError:
    message = (
        "Token is valid but missing write access — Auto-PR will not work. For a classic token, add the 'repo' scope."
        if token_kind == "classic"
        else "Token is valid but missing write access — Auto-PR will not work. For a fine-grained token, add this repository and grant Contents: Read and write and Pull requests: Read and write (Metadata: Read-only)."
    )
    return GitHubTokenValidationError(message, 403)


async def validate_github_token(token: str, repo_url: str | None = None) -> dict[str, Any]:
    """Authorize against the exact target repo; no raw token is persisted or returned."""
    token = token.strip()
    if not token:
        raise GitHubTokenValidationError("A GitHub personal access token is required.")
    owner, repo = configured_target(repo_url)
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            # This endpoint's permissions.push property works for both PAT kinds.
            repository = await client.get(f"{API_ROOT}/repos/{owner}/{repo}", headers=_headers(token))
            token_kind = _token_kind(repository)
            if repository.status_code == 401:
                raise GitHubTokenValidationError("Invalid or expired GitHub token. Paste a current personal access token and try again.", 401)
            if repository.status_code == 404:
                raise GitHubTokenValidationError(f"Token is valid but cannot read {owner}/{repo}. Add that repository to the token's repository access.", 404)
            if repository.status_code == 403:
                raise _missing_write_access(token_kind)
            if not repository.is_success:
                raise GitHubTokenValidationError(f"GitHub could not validate access to {owner}/{repo} (HTTP {repository.status_code}).", 502)
            permissions = repository.json().get("permissions") or {}
            if not permissions.get("push"):
                raise _missing_write_access(token_kind)

            # Identity is shown only after repo authorization succeeds.
            profile = await client.get(f"{API_ROOT}/user", headers=_headers(token))
            if profile.status_code == 401:
                raise GitHubTokenValidationError("Invalid or expired GitHub token. Paste a current personal access token and try again.", 401)
            if not profile.is_success:
                raise GitHubTokenValidationError(f"GitHub validated repository access but could not read the authenticated user (HTTP {profile.status_code}).", 502)
            login = str(profile.json().get("login") or "")
            if not login:
                raise GitHubTokenValidationError("GitHub returned no authenticated username for this token.", 502)
            scopes = [scope.strip() for scope in repository.headers.get("x-oauth-scopes", "").split(",") if scope.strip()]
            label = f"Classic PAT: {', '.join(scopes)}" if token_kind == "classic" else "Fine-grained PAT: repository write access verified"
            return {
                "login": login,
                "scopes": label,
                "token_kind": token_kind,
                "target": f"{owner}/{repo}",
                "permissions": {"pull": bool(permissions.get("pull")), "push": True},
            }
    except GitHubTokenValidationError:
        raise
    except httpx.TimeoutException as error:
        raise GitHubTokenValidationError("GitHub validation timed out. Check your network connection and try again.", 504) from error
    except httpx.RequestError as error:
        raise GitHubTokenValidationError("GitHub validation could not reach GitHub. Check your network connection and try again.", 503) from error
