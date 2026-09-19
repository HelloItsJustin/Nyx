// Detection Phase - Monaco code panel + findings list streaming in

import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNyxStore } from '../../store/nyxStore'
import SignalRing from '../SignalRing'
import AgentSpinner from '../AgentSpinner'

const SEV_COLORS: Record<string, string> = {
  CRITICAL: '#cc2222',
  HIGH: '#c05010',
  MEDIUM: '#9a7900',
  LOW: '#3a7a3a',
}

const ENGINE_LABELS: Record<string, string> = {
  'trufflehog': 'TruffleHog',
  'custom-entropy': 'Entropy',
  'custom-mcp': 'Config Rule',
}

function FindingCard({ finding, index }: { finding: any; index: number }) {
  const sevColor = SEV_COLORS[finding.severity] || '#6B6B6B'
  const isVerified = finding.status === 'verified-live'
  
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05, ease: 'easeOut' }}
      className="finding-card"
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div className="sev-dot" style={{ background: sevColor, marginTop: 5 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, fontSize: 13, color: sevColor }}>{finding.severity}</span>
            <span className={`badge-${isVerified ? 'verified' : 'unverified'}`} style={{
              fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 4,
            }}>
              {isVerified ? 'LIVE VERIFIED' : 'UNVERIFIED'}
            </span>
            <span style={{
              fontSize: 10, color: '#6B6B6B',
              background: '#F3F3F1',
              padding: '2px 6px', borderRadius: 4,
            }}>
              {ENGINE_LABELS[finding.engine] || finding.engine}
            </span>
          </div>
          <div style={{ fontSize: 13, color: '#111111', fontWeight: 500, marginTop: 4 }}>
            {finding.description}
          </div>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11,
            color: '#6B6B6B',
            marginTop: 3,
          }}>
            {finding.file}:{finding.line}
          </div>
          {finding.secret_preview && (
            <div style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11,
              color: sevColor,
              marginTop: 4,
              background: `${sevColor}10`,
              padding: '3px 7px',
              borderRadius: 4,
              display: 'inline-block',
            }}>
              {finding.secret_preview}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )
}

// Animated code panel simulating a scan line
function CodePanel() {
  // Show a representative file snippet with scan markers
  const lines = [
    { n: 1,  text: '# FinForge Backend Environment Configuration', type: 'comment' },
    { n: 2,  text: '',                                              type: 'blank' },
    { n: 3,  text: 'STRIPE_SECRET_KEY=sk_live_*****',             type: 'critical' },
    { n: 4,  text: 'STRIPE_PUBLISHABLE_KEY=pk_live_*****',        type: 'normal' },
    { n: 5,  text: '',                                              type: 'blank' },
    { n: 6,  text: '# Database',                                  type: 'comment' },
    { n: 7,  text: 'MONGODB_URI=mongodb+srv://admin:****@...',     type: 'critical' },
    { n: 8,  text: 'DB_NAME=finforge_production',                 type: 'normal' },
    { n: 9,  text: '',                                              type: 'blank' },
    { n: 10, text: '# Auth',                                       type: 'comment' },
    { n: 11, text: 'JWT_SECRET=supe****************e123',         type: 'high' },
    { n: 12, text: 'SESSION_TIMEOUT=3600',                         type: 'normal' },
    { n: 13, text: '',                                              type: 'blank' },
    { n: 14, text: '# Optional',                                   type: 'comment' },
    { n: 15, text: 'DEBUG=true',                                   type: 'medium' },
    { n: 16, text: 'PORT=3000',                                    type: 'normal' },
  ]

  const dotColors: Record<string, string> = {
    critical: '#2ECC71',
    high: '#F5A623',
    medium: '#3AC7D9',
  }

  return (
    <div className="code-panel" style={{
      background: '#0E0E0E',
      borderRadius: 12,
      border: '1px solid #2A2A2A',
      overflow: 'hidden',
      flex: 1,
      maxWidth: 480,
    }}>
      {/* Titlebar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '10px 14px',
        borderBottom: '1px solid #2A2A2A',
        background: '#151515',
      }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#FF5F57' }} />
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#FEBC2E' }} />
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#28C840' }} />
        <span style={{ marginLeft: 8, fontSize: 11, color: '#555', fontFamily: "'JetBrains Mono', monospace" }}>
          backend/.env.example.demo
        </span>
      </div>

      {/* Code lines */}
      <div style={{ padding: '12px 0', overflow: 'auto', maxHeight: 380 }}>
        {lines.map(line => (
          <div key={line.n} style={{
            display: 'flex',
            alignItems: 'center',
            padding: '2px 14px',
            background: line.type !== 'normal' && line.type !== 'comment' && line.type !== 'blank'
              ? `${dotColors[line.type] || 'transparent'}08`
              : 'transparent',
          }}>
            <span style={{
              width: 24, minWidth: 24,
              fontSize: 11, color: '#555',
              fontFamily: "'JetBrains Mono', monospace",
              userSelect: 'none',
            }}>{line.n}</span>
            
            {dotColors[line.type] && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: line.n * 0.15, duration: 0.2 }}
                style={{
                  width: 7, height: 7,
                  borderRadius: '50%',
                  background: dotColors[line.type],
                  marginRight: 8,
                  flexShrink: 0,
                  boxShadow: `0 0 4px ${dotColors[line.type]}80`,
                }}
              />
            )}
            {!dotColors[line.type] && <div style={{ width: 15 }} />}

            <span style={{
              fontSize: 12,
              fontFamily: "'JetBrains Mono', monospace",
              color: line.type === 'comment' ? '#555' : line.type === 'blank' ? 'transparent' : '#E8E8E8',
              whiteSpace: 'nowrap',
            }}>
              {line.text || '.'}
            </span>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div style={{
        borderTop: '1px solid #2A2A2A',
        padding: '8px 14px',
        display: 'flex', gap: 16, alignItems: 'center',
      }}>
        {[
          { color: '#2ECC71', label: 'Verified Live' },
          { color: '#F5A623', label: 'Unverified' },
          { color: '#3AC7D9', label: 'Config/Entropy' },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: color, boxShadow: `0 0 4px ${color}80` }} />
            <span style={{ fontSize: 10, color: '#555', fontFamily: "'JetBrains Mono', monospace" }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function DetectionPhase() {
  const findings = useNyxStore(s => s.findings)
  const phase = useNyxStore(s => s.displayPhase)
  const isActive = phase === 'detection'
  const listRef = useRef<HTMLDivElement>(null)

  // Auto-scroll findings list
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [findings.length])

  return (
    <div className="phase-layout" style={{
      display: 'flex',
      gap: 40,
      alignItems: 'flex-start',
      width: '100%',
      maxWidth: 1100,
      padding: '0 32px',
    }}>
      {/* Left: ring + code panel */}
      <div className="phase-rail" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 40 }}>
        <SignalRing phase="detection" active={isActive} />
        <CodePanel />
      </div>

      {/* Right: findings list */}
      <div className="phase-content" style={{ flex: 1, minWidth: 0 }}>
        <div className="phase-heading" style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: '#111111', letterSpacing: '-0.02em' }}>
            Detection Agent
          </h2>
          <p style={{ fontSize: 13, color: '#6B6B6B', marginTop: 4 }}>
            TruffleHog + entropy analysis + config rules
          </p>
          <p style={{ fontSize: 11, color: '#6B6B6B', marginTop: 8, lineHeight: 1.45 }}>
            Full credential values are never transmitted to any AI provider — only masked previews and metadata are used for analysis.
          </p>
        </div>

        {/* Stats */}
        <div className="metric-strip" style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
          {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map(sev => {
            const count = findings.filter(f => f.severity === sev).length
            return (
              <div className="metric-card" key={sev} style={{
                padding: '6px 12px',
                borderRadius: 8,
                background: count > 0 ? `${SEV_COLORS[sev]}10` : '#F3F3F1',
                border: `1px solid ${count > 0 ? SEV_COLORS[sev] + '30' : '#E5E5E3'}`,
                textAlign: 'center',
              }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: count > 0 ? SEV_COLORS[sev] : '#9B9B9B' }}>
                  {count}
                </div>
                <div style={{ fontSize: 10, color: '#6B6B6B', fontWeight: 500, letterSpacing: '0.06em' }}>
                  {sev}
                </div>
              </div>
            )
          })}
          <div className="metric-card" style={{
            padding: '6px 12px',
            borderRadius: 8,
            background: '#F3F3F1',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#111111' }}>{findings.length}</div>
            <div style={{ fontSize: 10, color: '#6B6B6B', fontWeight: 500, letterSpacing: '0.06em' }}>TOTAL</div>
          </div>
        </div>

        {/* Findings list */}
        <div
          ref={listRef}
          className="panel-scroll"
          style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 420, overflowY: 'auto' }}
        >
          <AnimatePresence>
            {findings.map((f, i) => (
              <FindingCard key={f.id} finding={f} index={i} />
            ))}
          </AnimatePresence>

          {findings.length === 0 && isActive && (
            <div className="agent-loading">
              <AgentSpinner color="#6C5CE7" />
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>
                Scanning for secrets...
              </div>
              <div style={{ fontSize: 12 }}>Findings will appear here as they are discovered.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
