// Remediation Phase - fix cards with real GitHub PR creation

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRight, ExternalLink, Download } from 'lucide-react'
import SignalRing from '../SignalRing'
import { useNyxStore } from '../../store/nyxStore'
import AgentSpinner from '../AgentSpinner'

const SEV_COLORS: Record<string, string> = {
  CRITICAL: '#cc2222',
  HIGH: '#c05010',
  MEDIUM: '#9a7900',
  LOW: '#3a7a3a',
}

function DiffBlock({ before, after }: { before: string; after: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 10 }}>
      {before && (
        <div className="diff-before">
          <span style={{ color: '#cc222280', marginRight: 8, userSelect: 'none' }}>-</span>
          {before}
        </div>
      )}
      {after && (
        <div className="diff-after">
          <span style={{ color: '#2ECC7180', marginRight: 8, userSelect: 'none' }}>+</span>
          {after}
        </div>
      )}
    </div>
  )
}

function FixCard({ fix, index, repoUrl, githubConnected }: { fix: any; index: number; repoUrl: string | null; githubConnected: boolean }) {
  const [prState, setPrState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [prUrl, setPrUrl] = useState<string>(fix.pr_url || '')
  const [errMsg, setErrMsg] = useState('')
  const updateFixPrUrl = useNyxStore(s => s.updateFixPrUrl)
  const sevColor = SEV_COLORS[fix.severity] || '#6B6B6B'

  const handleAutoPR = async () => {
    if (!repoUrl) return
    setPrState('loading')
    setErrMsg('')
    try {
      const res = await fetch('/api/pr/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          finding_id: fix.finding_id,
          repo_url: repoUrl,
          // The backend owns the selected fix. This prevents an old dashboard tab
          // from sending a stale file path to GitHub after scan data is updated.
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || 'PR creation failed')
      }
      const data = await res.json()
      setPrUrl(data.pr_url)
      updateFixPrUrl(fix.id, data.pr_url)
      setPrState('done')
    } catch (e: any) {
      setErrMsg(e.message)
      setPrState('error')
    }
  }

  return (
    <motion.div
      className="remediation-card"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.12, duration: 0.4, ease: 'easeOut' }}
      style={{
        background: 'white',
        border: '1px solid #E5E5E3',
        borderRadius: 12,
        padding: '18px 20px',
        borderLeft: `3px solid ${sevColor}`,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{
              fontSize: 10, fontWeight: 700,
              color: sevColor,
              background: `${sevColor}10`,
              border: `1px solid ${sevColor}30`,
              padding: '2px 7px', borderRadius: 4,
              letterSpacing: '0.06em',
            }}>
              {fix.severity}
            </span>
            <span style={{ fontSize: 11, color: '#6B6B6B', fontFamily: "'JetBrains Mono', monospace" }}>
              {fix.file}
            </span>
          </div>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#111111', marginBottom: 4 }}>
            {fix.title}
          </h3>
          <p style={{ fontSize: 12, color: '#6B6B6B', lineHeight: 1.5 }}>
            {fix.fix || fix.issue}
          </p>
        </div>

        {/* Action button */}
        <div style={{ flexShrink: 0 }}>
          {prState === 'done' || fix.pr_url ? (
            <a
              href={prUrl || fix.pr_url}
              target="_blank"
              rel="noopener noreferrer"
              className="pr-btn success"
              style={{ textDecoration: 'none' }}
            >
              <ExternalLink size={13} />
              View PR
            </a>
          ) : repoUrl && repoUrl.includes('github.com') && githubConnected ? (
            <button
              className="pr-btn"
              onClick={handleAutoPR}
              disabled={prState === 'loading'}
              style={{ opacity: prState === 'loading' ? 0.8 : 1, display: 'flex', alignItems: 'center', gap: 7 }}
            >
              {prState === 'loading' ? (
                <><AgentSpinner color="#6C5CE7" size={13} /> Creating PR...</>
              ) : (
                <>Create GitHub PR <ArrowRight size={12} /></>
              )}
            </button>
          ) : repoUrl && repoUrl.includes('github.com') ? (
            <span style={{ fontSize: 11, color: '#9B9B9B' }}>Validate a GitHub token to create a PR</span>
          ) : (
            <button className="pr-btn" style={{ borderColor: '#2ECC71', color: '#2ECC71' }}>
              <Download size={13} />
              Apply Fix
            </button>
          )}
        </div>
      </div>

      {/* Diff */}
      {fix.diff && (
        <DiffBlock before={fix.diff.before} after={fix.diff.after} />
      )}

      {/* Branch */}
      <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 10, color: '#9B9B9B', fontFamily: "'JetBrains Mono', monospace" }}>
          branch:
        </span>
        <span style={{ fontSize: 10, color: '#6C5CE7', fontFamily: "'JetBrains Mono', monospace" }}>
          {fix.branch}
        </span>
      </div>

      {prState === 'error' && (
        <div style={{ marginTop: 8, fontSize: 12, color: '#FF6B6B' }}>{errMsg}</div>
      )}
    </motion.div>
  )
}

export default function RemediationPhase() {
  const fixes = useNyxStore(s => s.fixes)
  const repoUrl = useNyxStore(s => s.repoUrl)
  const phase = useNyxStore(s => s.displayPhase)
  const isActive = phase === 'remediation'
  const [github, setGithub] = useState({ connected: false, configured: false, login: '', scopes: '' })
  const [connectState, setConnectState] = useState<'idle' | 'validating' | 'error'>('idle')
  const [connectError, setConnectError] = useState('')
  const [githubToken, setGithubToken] = useState('')

  const refreshGithub = async () => {
    const response = await fetch('/api/github/status')
    if (response.ok) setGithub(await response.json())
  }

  useEffect(() => { void refreshGithub() }, [])

  const validateGithubToken = async () => {
    if (!githubToken.trim()) {
      setConnectError('Paste a GitHub personal access token to continue.')
      return
    }
    setConnectState('validating')
    setConnectError('')
    try {
      const response = await fetch('/api/github/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: githubToken, repo_url: repoUrl }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.detail || 'GitHub token validation failed.')
      setGithub(data)
      // Do not retain the raw token in browser state after the backend validates it.
      setGithubToken('')
      setConnectState('idle')
    } catch (error) {
      setConnectState('error')
      setConnectError(error instanceof Error ? error.message : 'GitHub token validation failed.')
    }
  }

  return (
    <div className="phase-layout" style={{
      display: 'flex',
      gap: 40,
      alignItems: 'flex-start',
      width: '100%',
      maxWidth: 1100,
      padding: '0 32px',
    }}>
      {/* Left: ring + stats */}
      <div className="phase-rail" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 32 }}>
        <SignalRing phase="remediation" active={isActive} />

        <div className="sidebar-stat-card" style={{
          background: 'rgba(46,204,113,0.06)',
          border: '1px solid rgba(46,204,113,0.2)',
          borderRadius: 12,
          padding: '16px 24px',
          textAlign: 'center',
          maxWidth: 180,
        }}>
          <div style={{ fontSize: 32, fontWeight: 800, color: '#2ECC71', lineHeight: 1 }}>{fixes.length}</div>
          <div style={{ fontSize: 12, color: '#6B6B6B', marginTop: 4 }}>fixes generated</div>
          <div style={{ marginTop: 12, fontSize: 11, color: '#9B9B9B', lineHeight: 1.4 }}>
            {repoUrl?.includes('github.com') ? 'Creates a branch and an open pull request — nothing is merged automatically.' : 'Click Apply Fix to download patches'}
          </div>
        </div>
      </div>

      {/* Right: fix cards */}
      <div className="phase-content" style={{ flex: 1, minWidth: 0 }}>
        <div className="phase-heading" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: '#111111', letterSpacing: '-0.02em' }}>
              Remediation Agent
            </h2>
            {github.connected ? (
              <span style={{ color: '#23834D', fontSize: 11, fontWeight: 700 }}>Connected as @{github.login} — {github.scopes || 'repo'} access</span>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <input
                  type="password"
                  value={githubToken}
                  onChange={(event) => setGithubToken(event.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  aria-label="GitHub personal access token"
                  placeholder="GitHub personal access token"
                  style={{ width: 230, padding: '9px 11px', border: '1px solid #D8D8D4', borderRadius: 8, fontSize: 12, color: '#111111', background: '#FFFFFF' }}
                />
                <button className="pr-btn" type="button" onClick={validateGithubToken} disabled={connectState === 'validating'}>
                  {connectState === 'validating' ? <><AgentSpinner color="#6C5CE7" size={13} /> Validating token...</> : 'Validate token'}
                </button>
              </div>
            )}
          </div>
          <p style={{ fontSize: 13, color: '#6B6B6B', marginTop: 4 }}>
            Each GitHub action creates a reviewable branch and pull request; Nyx never merges on your behalf.
          </p>
          {!github.connected && (
            <p style={{ fontSize: 11, color: '#6B6B6B', marginTop: 6, maxWidth: 760, lineHeight: 1.45 }}>
              Paste your GitHub personal access token. This stays on your machine only — Nyx never transmits it anywhere except directly to GitHub&apos;s own API. Create one at github.com/settings/tokens with &apos;repo&apos; scope.
            </p>
          )}
          {connectError && <p style={{ fontSize: 11, color: '#C0392B', marginTop: 6 }}>{connectError}</p>}
        </div>

        <div className="panel-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 480, overflowY: 'auto' }}>
          {fixes.length === 0 && isActive && (
            <div className="agent-loading">
              <AgentSpinner color="#2ECC71" />
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>
                Generating fixes...
              </div>
              <div style={{ fontSize: 12 }}>AI-crafted patches will appear here shortly.</div>
            </div>
          )}

          <AnimatePresence>
            {fixes.map((fix, i) => (
              <FixCard key={fix.id} fix={fix} index={i} repoUrl={repoUrl} githubConnected={github.connected} />
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
