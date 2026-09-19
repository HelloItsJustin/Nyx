// Summary Phase - final screen with PDF download and full results overview

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Download, CheckCircle } from 'lucide-react'
import SignalRing from '../SignalRing'
import { useNyxStore } from '../../store/nyxStore'



export default function SummaryPhase() {
  const findings = useNyxStore(s => s.findings)
  const fixes = useNyxStore(s => s.fixes)
  const trustScore = useNyxStore(s => s.trustScore)
  const repoUrl = useNyxStore(s => s.repoUrl)
  const phantomResult = useNyxStore(s => s.phantomResult)
  const honeyResult = useNyxStore(s => s.honeyResult)
  const blastGraph = useNyxStore(s => s.blastGraph)
  const [downloadState, setDownloadState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')

  const handleDownloadPDF = async () => {
    setDownloadState('loading')
    try {
      const res = await fetch('/api/report/pdf')
      if (!res.ok) throw new Error('PDF generation failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'nyx_security_report.pdf'
      a.click()
      URL.revokeObjectURL(url)
      setDownloadState('done')
    } catch (e: any) {
      setDownloadState('error')
    }
  }

  const critCount = findings.filter(f => f.severity === 'CRITICAL').length
  const highCount = findings.filter(f => f.severity === 'HIGH').length
  const verifiedCount = findings.filter(f => f.verified).length
  const prCount = fixes.filter(f => f.pr_url).length

  const timeline = [
    { phase: 'detection', label: 'Detection Agent', result: `${findings.length} findings (${verifiedCount} verified live)`, ok: true },
    { phase: 'blast_radius', label: 'Blast-Radius Mapper', result: blastGraph ? `${blastGraph.summary.reach} nodes, ${blastGraph.summary.tier} tier` : 'Complete', ok: true },
    { phase: 'phantom', label: 'Phantom Runtime', result: phantomResult ? `${phantomResult.captured_events} events captured` : 'Complete', ok: true },
    { phase: 'honey_mesh', label: 'Deception Honey Mesh', result: honeyResult ? `${honeyResult.tokens.length} honeytokens deployed` : 'Complete', ok: true },
    { phase: 'remediation', label: 'Remediation Agent', result: `${fixes.length} fixes generated, ${prCount} PRs opened`, ok: true },
  ]

  return (
    <div className="phase-layout" style={{
      display: 'flex',
      gap: 40,
      alignItems: 'flex-start',
      width: '100%',
      maxWidth: 1100,
      padding: '0 32px',
    }}>
      {/* Left: ring + download */}
      <div className="phase-rail" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 32 }}>
        <SignalRing phase="summary" size={180} active={false} />

        {/* Trust score big display */}
        <div className="sidebar-stat-card final-score-card" style={{
          textAlign: 'center',
          background: 'rgba(46,204,113,0.06)',
          border: '1px solid rgba(46,204,113,0.2)',
          borderRadius: 16,
          padding: '24px 32px',
        }}>
          <div style={{ fontSize: 11, color: '#6B6B6B', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
            Final Trust Score
          </div>
          <div style={{ fontSize: 56, fontWeight: 900, color: '#2ECC71', letterSpacing: '-0.04em', lineHeight: 1 }}>
            {trustScore}
          </div>
          <div style={{ fontSize: 13, color: '#6B6B6B', marginTop: 4 }}>/100</div>
        </div>

        {/* PDF Download */}
        <button
          onClick={handleDownloadPDF}
          disabled={downloadState === 'loading'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '12px 24px',
            borderRadius: 10,
            border: '1.5px solid #111111',
            background: downloadState === 'done' ? '#2ECC71' : 'white',
            color: downloadState === 'done' ? 'white' : '#111111',
            fontSize: 14,
            fontWeight: 600,
            cursor: downloadState === 'loading' ? 'default' : 'pointer',
            fontFamily: 'Inter, sans-serif',
            transition: 'all 0.3s ease',
            boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
          }}
        >
          {downloadState === 'done' ? (
            <><CheckCircle size={16} /> Downloaded</>
          ) : downloadState === 'loading' ? (
            <>Generating PDF...</>
          ) : (
            <><Download size={16} /> Download Detailed Summary</>
          )}
        </button>
        {downloadState === 'error' && (
          <div style={{ fontSize: 12, color: '#FF6B6B', textAlign: 'center' }}>PDF generation failed. Backend may be offline.</div>
        )}
        <div style={{ fontSize: 11, color: '#9B9B9B', textAlign: 'center', maxWidth: 180 }}>
          Saved locally only. Never uploaded anywhere.
        </div>
      </div>

      {/* Right: summary */}
      <div className="phase-content" style={{ flex: 1, minWidth: 0 }}>
        <div className="phase-heading" style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: '#111111', letterSpacing: '-0.02em' }}>
            Assessment Complete
          </h2>
          <p style={{ fontSize: 13, color: '#6B6B6B', marginTop: 4 }}>
            {repoUrl}
          </p>
        </div>

        {/* Key metrics */}
        <div className="summary-metrics" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
          {[
            { label: 'Total Findings', value: findings.length, color: '#111111' },
            { label: 'Critical / High', value: `${critCount} / ${highCount}`, color: '#cc2222' },
            { label: 'Live Verified', value: verifiedCount, color: '#F5A623' },
            { label: 'Files in Blast Radius', value: blastGraph?.summary.affected_files || 0, color: '#F5A623' },
            { label: 'Fixes Generated', value: fixes.length, color: '#2ECC71' },
            { label: 'PRs Opened', value: prCount, color: '#6C5CE7' },
          ].map(m => (
            <div className="summary-metric" key={m.label} style={{
              background: 'white',
              border: '1px solid #E5E5E3',
              borderRadius: 10,
              padding: '14px 16px',
            }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: m.color }}>{m.value}</div>
              <div style={{ fontSize: 11, color: '#6B6B6B', marginTop: 2 }}>{m.label}</div>
            </div>
          ))}
        </div>

        {/* Timeline */}
        <div className="timeline-card" style={{
          background: 'white',
          border: '1px solid #E5E5E3',
          borderRadius: 12,
          overflow: 'hidden',
        }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #E5E5E3' }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#111111' }}>Phase Timeline</h3>
          </div>
          {timeline.map((t, i) => (
            <motion.div
              key={t.phase}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1, duration: 0.4 }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '12px 18px',
                borderBottom: i < timeline.length - 1 ? '1px solid #F3F3F1' : 'none',
              }}
            >
              <CheckCircle size={16} style={{ color: '#2ECC71', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#111111' }}>{t.label}</div>
                <div style={{ fontSize: 11, color: '#6B6B6B', marginTop: 2 }}>{t.result}</div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Footer trust statement */}
        <div className="assessment-note" style={{ marginTop: 20, padding: '14px 16px', background: '#F8F8F7', borderRadius: 10 }}>
          <div style={{ fontSize: 12, color: '#6B6B6B', lineHeight: 1.5 }}>
            This assessment ran entirely on your local machine. No code, repository contents, or secrets were transmitted to any Nyx-operated server. The only outbound calls were to your own GitHub, Gemini, and Groq accounts.
          </div>
        </div>
      </div>
    </div>
  )
}
