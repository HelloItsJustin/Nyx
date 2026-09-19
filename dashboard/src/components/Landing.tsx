// Landing screen - repo input + folder upload, split pill button, corner glows

import { useState, useRef } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, FolderOpen } from 'lucide-react'
import { useNyxStore } from '../store/nyxStore'

const FINFORGE_URL = 'https://github.com/HelloItsJustin/FinForge.git'

export default function Landing() {
  const [repoUrl, setRepoUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const setScreen = useNyxStore(s => s.setScreen)
  const setRepoUrlStore = useNyxStore(s => s.setRepoUrl)
  const reset = useNyxStore(s => s.reset)

  const startScan = async (url: string) => {
    if (!url.trim()) { setError('Paste a GitHub repo URL to begin.'); return }
    setError('')
    setLoading(true)
    reset()
    setRepoUrlStore(url.trim())
    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo_url: url.trim() }),
      })
      if (!res.ok) throw new Error('Backend error ' + res.status)
      setScreen('scan')
    } catch (e: any) {
      setError(e.message || 'Could not reach the local backend. Is Nyx running?')
      setLoading(false)
    }
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setLoading(true)
    setError('')
    reset()
    setRepoUrlStore(file.name)
    const form = new FormData()
    form.append('file', file)
    try {
      const res = await fetch('/api/scan/upload', { method: 'POST', body: form })
      if (!res.ok) throw new Error('Upload failed: ' + res.status)
      setScreen('scan')
    } catch (e: any) {
      setError(e.message)
      setLoading(false)
    }
  }

  return (
    <motion.div
      className="landing-shell"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Corner glows */}
      <div className="glow-corner-bl" style={{ background: 'rgba(108,92,231,0.12)' }} />
      <div className="glow-corner-tr" style={{ background: 'rgba(108,92,231,0.10)' }} />

      {/* Large stroked circles */}
      <div style={{
        position: 'absolute', bottom: -200, left: -200,
        width: 600, height: 600, borderRadius: '50%',
        border: '1px solid rgba(108,92,231,0.12)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', top: -200, right: -200,
        width: 600, height: 600, borderRadius: '50%',
        border: '1px solid rgba(108,92,231,0.08)',
        pointerEvents: 'none',
      }} />

      {/* Hero content */}
      <motion.div
        className="landing-hero"
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.1, duration: 0.6, ease: 'easeOut' }}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
          textAlign: 'center',
          maxWidth: 640,
          padding: '0 24px',
          position: 'relative',
          zIndex: 10,
        }}
      >
        {/* Eyebrow */}
        <div className="landing-eyebrow" style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '4px 14px', borderRadius: 999,
          border: '1px solid rgba(108,92,231,0.3)',
          fontSize: 11, fontWeight: 600, color: '#6C5CE7',
          letterSpacing: '0.1em', textTransform: 'uppercase',
          marginBottom: 8,
        }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#6C5CE7' }} />
          Credential Containment Platform
        </div>

        {/* Headline */}
        <h1 className="landing-title" style={{
          fontSize: 'clamp(36px, 5vw, 60px)',
          fontWeight: 800,
          color: '#111111',
          letterSpacing: '-0.03em',
          lineHeight: 1.1,
        }}>
          Find and fix exposed<br />credentials before they<br />become breaches.
        </h1>

        {/* Subhead */}
        <p className="landing-subtitle" style={{ fontSize: 16, color: '#6B6B6B', lineHeight: 1.6, maxWidth: 480, marginTop: 4 }}>
          Five autonomous agents scan your repo, map the blast radius, sandbox-detonate leaked keys, deploy honey traps, and open real PRs with fixes.
        </p>

        {/* Input + upload */}
        <div style={{
          marginTop: 24,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
          width: '100%',
          maxWidth: 520,
        }}>
          <div className="landing-input" style={{
            display: 'flex',
            width: '100%',
            border: '1.5px solid #D1D1CE',
            borderRadius: 12,
            overflow: 'hidden',
            background: 'white',
            boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
            transition: 'border-color 0.2s',
          }}>
            <input
              type="text"
              value={repoUrl}
              onChange={e => setRepoUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && startScan(repoUrl)}
              placeholder="Paste your GitHub repo link"
              style={{
                flex: 1,
                padding: '14px 18px',
                border: 'none',
                outline: 'none',
                fontSize: 14,
                fontFamily: 'Inter, sans-serif',
                color: '#111111',
                background: 'transparent',
              }}
            />
            <button
              onClick={() => fileRef.current?.click()}
              title="Upload folder as zip"
              style={{
                padding: '0 16px',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                color: '#6B6B6B',
                display: 'flex',
                alignItems: 'center',
                transition: 'color 0.2s',
              }}
            >
              <FolderOpen size={18} />
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".zip"
              onChange={handleUpload}
              style={{ display: 'none' }}
            />
          </div>

          {error && (
            <div style={{ fontSize: 13, color: '#FF6B6B', marginTop: -4 }}>{error}</div>
          )}

          {/* Split pill button */}
          <div className="pill-btn" style={{ opacity: loading ? 0.6 : 1 }}>
            <button
              className="pill-primary"
              onClick={() => startScan(repoUrl)}
              disabled={loading}
              style={{ background: 'none', border: 'none', cursor: loading ? 'default' : 'pointer' }}
            >
              {loading ? 'Starting...' : 'Scan Now'}
              <ArrowRight size={14} />
            </button>
            <div className="pill-divider" />
            <button
              className="pill-secondary"
              onClick={() => { setRepoUrl(FINFORGE_URL); startScan(FINFORGE_URL) }}
              disabled={loading}
              style={{ background: 'none', border: 'none', cursor: loading ? 'default' : 'pointer', fontFamily: 'Inter, sans-serif' }}
            >
              See Example
            </button>
          </div>

          {/* Caption */}
          <p style={{ fontSize: 12, color: '#9B9B9B', textAlign: 'center', lineHeight: 1.5, marginTop: 4 }}>
            Five-phase autonomous pipeline. Everything runs locally on your machine with your own API keys.
          </p>
        </div>
      </motion.div>

      {/* Footer trust statement */}
      <div className="landing-footer" style={{
        position: 'fixed',
        bottom: 20,
        left: '50%',
        transform: 'translateX(-50%)',
        fontSize: 11,
        color: '#9B9B9B',
        textAlign: 'center',
      }}>
        Your code and secrets never leave your machine. Nyx operates entirely locally.
      </div>
    </motion.div>
  )
}
