// Phantom Runtime Phase - monospace terminal streaming sandbox activity

import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import SignalRing from '../SignalRing'
import { useNyxStore } from '../../store/nyxStore'
import AgentSpinner from '../AgentSpinner'

function TerminalLine({ line, index }: { line: string; index: number }) {
  const isCapture = line.includes('CAPTURED')
  const isResult  = line.includes('Result:')
  const isInit    = line.includes('initializing') || line.includes('Substituting')

  const color = isCapture ? '#FF6B6B'
    : isResult ? (line.includes('CONFIRMED') ? '#FF6B6B' : '#2ECC71')
    : isInit ? '#F5A623'
    : '#00FF88'

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2, delay: index * 0.03 }}
      className="terminal-line"
      style={{
        color,
        fontWeight: isCapture || isResult ? 700 : 400,
        borderLeft: isCapture ? '2px solid #FF6B6B40' : '2px solid transparent',
        paddingLeft: isCapture ? 8 : 0,
        marginLeft: isCapture ? -10 : 0,
      }}
    >
      {line}
    </motion.div>
  )
}

export default function PhantomPhase() {
  const terminalLines = useNyxStore(s => s.terminalLines)
  const phantomResult = useNyxStore(s => s.phantomResult)
  const phase = useNyxStore(s => s.displayPhase)
  const isActive = phase === 'phantom'
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [terminalLines.length])

  return (
    <div className="phase-layout" style={{
      display: 'flex',
      gap: 40,
      alignItems: 'flex-start',
      width: '100%',
      maxWidth: 1100,
      padding: '0 32px',
    }}>
      {/* Left: Ring + result card */}
      <div className="phase-rail" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 32 }}>
        <SignalRing phase="phantom" active={isActive} />

        {phantomResult && (
          <motion.div
            className="sidebar-stat-card phantom-result-card"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              background: phantomResult.confirmed_exploitable ? 'rgba(255,107,107,0.06)' : 'rgba(46,204,113,0.06)',
              border: `1px solid ${phantomResult.confirmed_exploitable ? 'rgba(255,107,107,0.3)' : 'rgba(46,204,113,0.3)'}`,
              borderRadius: 12,
              padding: 20,
              maxWidth: 200,
              textAlign: 'center',
            }}
          >
            <div style={{
              fontSize: 11,
              fontWeight: 600,
              color: phantomResult.confirmed_exploitable ? '#FF6B6B' : '#2ECC71',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              marginBottom: 8,
            }}>
              {phantomResult.confirmed_exploitable ? 'CONFIRMED EXPLOITABLE' : 'No Active Usage'}
            </div>
            <div style={{ fontSize: 32, fontWeight: 800, color: '#111111', marginBottom: 8 }}>
              {phantomResult.captured_events}
            </div>
            <div style={{ fontSize: 12, color: '#6B6B6B' }}>outbound events captured</div>
            <div style={{ fontSize: 11, color: '#6B6B6B', marginTop: 12, lineHeight: 1.4 }}>
              {phantomResult.summary}
            </div>
          </motion.div>
        )}
      </div>

      {/* Right: Terminal */}
      <div className="phase-content" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div className="phase-heading" style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: '#111111', letterSpacing: '-0.02em' }}>
            Phantom Runtime
          </h2>
          <p style={{ fontSize: 13, color: '#6B6B6B', marginTop: 4 }}>
            Isolated sandbox execution. Fake credentials substituted. No real network egress.
          </p>
        </div>

        {/* Terminal window */}
        <div className="terminal-window" style={{
          background: '#0A0A0A',
          borderRadius: 12,
          border: '1px solid #2A2A2A',
          overflow: 'hidden',
          flex: 1,
        }}>
          {/* Titlebar */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '10px 14px',
            borderBottom: '1px solid #2A2A2A',
            background: '#111111',
          }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#FF5F57' }} />
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#FEBC2E' }} />
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#28C840' }} />
            <span style={{ marginLeft: 8, fontSize: 11, color: '#555', fontFamily: "'JetBrains Mono', monospace" }}>
              phantom-sandbox -- bash
            </span>
            <div style={{ flex: 1 }} />
            <span style={{
              fontSize: 10,
              padding: '2px 8px',
              borderRadius: 4,
              background: isActive ? 'rgba(58,199,217,0.2)' : '#2A2A2A',
              color: isActive ? '#3AC7D9' : '#555',
              fontFamily: "'JetBrains Mono', monospace",
            }}>
              {isActive ? 'RUNNING' : phantomResult ? 'COMPLETE' : 'IDLE'}
            </span>
          </div>

          {/* Terminal content */}
          <div style={{
            padding: '16px',
            height: 380,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}>
            {terminalLines.length === 0 && isActive && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 32 }}>
                <AgentSpinner color="#3AC7D9" />
                <div className="terminal-line" style={{ color: '#3AC7D9' }}>
                  Initializing sandbox environment...
                </div>
              </div>
            )}
            {terminalLines.map((line, i) => (
              <TerminalLine key={i} line={line} index={i} />
            ))}
            <div ref={bottomRef} />
          </div>
        </div>

        {/* Disclaimer */}
        <div style={{ marginTop: 12, fontSize: 11, color: '#9B9B9B' }}>
          Real: code executed in isolated subprocess with fake credentials. No actual API calls leave the sandbox.
        </div>
      </div>
    </div>
  )
}
