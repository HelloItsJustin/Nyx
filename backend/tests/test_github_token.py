import unittest
from unittest.mock import patch

import httpx

import github_token


class FakeGitHubClient:
    def __init__(self, responses):
        self.responses = responses

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    async def get(self, url, headers):
        return self.responses.pop(0)


def response(status_code, payload, headers=None):
    return httpx.Response(status_code, json=payload, headers=headers or {}, request=httpx.Request("GET", "https://api.github.com/test"))


class GitHubTokenValidationTests(unittest.IsolatedAsyncioTestCase):
    async def test_classic_pat_is_accepted_from_repository_push_permission(self):
        responses = [
            response(200, {"permissions": {"pull": True, "push": True}}, {"x-oauth-scopes": "repo"}),
            response(200, {"login": "classic-user"}),
        ]
        with patch("github_token.httpx.AsyncClient", return_value=FakeGitHubClient(responses)):
            result = await github_token.validate_github_token("classic-token")
        self.assertEqual(result["token_kind"], "classic")
        self.assertTrue(result["permissions"]["push"])
        self.assertEqual(result["login"], "classic-user")

    async def test_fine_grained_pat_is_accepted_without_scope_header(self):
        responses = [
            response(200, {"permissions": {"pull": True, "push": True}}),
            response(200, {"login": "fine-grained-user"}),
        ]
        with patch("github_token.httpx.AsyncClient", return_value=FakeGitHubClient(responses)):
            result = await github_token.validate_github_token("fine-grained-token")
        self.assertEqual(result["token_kind"], "fine-grained")
        self.assertTrue(result["permissions"]["push"])
        self.assertEqual(result["login"], "fine-grained-user")

    async def test_fine_grained_token_without_push_gets_fine_grained_guidance(self):
        responses = [response(200, {"permissions": {"pull": True, "push": False}})]
        with patch("github_token.httpx.AsyncClient", return_value=FakeGitHubClient(responses)):
            with self.assertRaises(github_token.GitHubTokenValidationError) as error:
                await github_token.validate_github_token("read-only-fine-grained-token")
        self.assertIn("Contents: Read and write", str(error.exception))

    async def test_classic_token_without_push_gets_repo_scope_guidance(self):
        responses = [response(200, {"permissions": {"pull": True, "push": False}}, {"x-oauth-scopes": "read:user"})]
        with patch("github_token.httpx.AsyncClient", return_value=FakeGitHubClient(responses)):
            with self.assertRaises(github_token.GitHubTokenValidationError) as error:
                await github_token.validate_github_token("read-only-classic-token")
        self.assertIn("'repo' scope", str(error.exception))
