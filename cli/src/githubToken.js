// GitHub PAT validation for one Nyx session. Never persist or log token values.

const API_ROOT = 'https://api.github.com'

function targetRepository() {
  return {
    owner: process.env.GITHUB_TARGET_OWNER || 'HelloItsJustin',
    repo: process.env.GITHUB_TARGET_REPO || 'FinForge',
  }
}

function headers(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'Nyx-CLI/2.0',
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

function scopesFrom(response) {
  return (response.headers.get('x-oauth-scopes') || '').split(',').map(scope => scope.trim()).filter(Boolean)
}

function tokenKind(response) {
  // Header metadata is used only for helpful error text. Fine-grained PATs do
  // not return it, so authorization always uses repository.permissions.push.
  return scopesFrom(response).length ? 'classic' : 'fine-grained'
}

function missingWriteAccess(kind) {
  if (kind === 'classic') {
    return "Token is valid but missing write access — Auto-PR will not work. For a classic token, add the 'repo' scope."
  }
  return 'Token is valid but missing write access — Auto-PR will not work. For a fine-grained token, add this repository and grant Contents: Read and write and Pull requests: Read and write (Metadata: Read-only).'
}

function networkError(error) {
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') return 'GitHub validation timed out. Check your network connection and try again.'
  return 'GitHub validation could not reach GitHub. Check your network connection and try again.'
}

/**
 * GET /repos/{owner}/{repo} is the sole permission gate. This supports both
 * classic and fine-grained PATs; X-OAuth-Scopes is never an access check.
 */
export async function validateGithubToken(token, target = targetRepository()) {
  const { default: fetch } = await import('node-fetch')
  const request = url => fetch(url, { headers: headers(token), signal: AbortSignal.timeout(15000) })
  const targetName = `${target.owner}/${target.repo}`
  let repositoryResponse
  try {
    repositoryResponse = await request(`${API_ROOT}/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}`)
  } catch (error) {
    return { ok: false, reason: networkError(error) }
  }
  const kind = tokenKind(repositoryResponse)
  if (repositoryResponse.status === 401) return { ok: false, reason: 'Invalid or expired GitHub token. Paste a current personal access token and try again.' }
  if (repositoryResponse.status === 404) return { ok: false, reason: `Token is valid but cannot read ${targetName}. Add that repository to the token's repository access.` }
  if (repositoryResponse.status === 403) return { ok: false, reason: missingWriteAccess(kind) }
  if (!repositoryResponse.ok) return { ok: false, reason: `GitHub could not validate access to ${targetName} (HTTP ${repositoryResponse.status}).` }

  const repository = await repositoryResponse.json().catch(() => ({}))
  if (!repository?.permissions?.push) return { ok: false, reason: missingWriteAccess(kind) }

  let profileResponse
  try {
    profileResponse = await request(`${API_ROOT}/user`)
  } catch (error) {
    return { ok: false, reason: networkError(error) }
  }
  if (profileResponse.status === 401) return { ok: false, reason: 'Invalid or expired GitHub token. Paste a current personal access token and try again.' }
  if (!profileResponse.ok) return { ok: false, reason: `GitHub validated repository access but could not read the authenticated user (HTTP ${profileResponse.status}).` }
  const profile = await profileResponse.json().catch(() => ({}))
  const scopes = scopesFrom(repositoryResponse)
  return {
    ok: true,
    user: `@${profile.login}`,
    login: profile.login,
    scopes: kind === 'classic' ? `Classic PAT: ${scopes.join(', ')}` : 'Fine-grained PAT: repository write access verified',
    tokenKind: kind,
    permissions: { pull: Boolean(repository.permissions?.pull), push: true },
    target: targetName,
  }
}

export { targetRepository, missingWriteAccess }
