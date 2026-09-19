// Honey Mesh Phase - hexagon grid + simulate attacker interaction button
// SIMULATION LABEL DISPLAYED PROMINENTLY AND HONESTLY

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import SignalRing from '../SignalRing'
import { useNyxStore } from '../../store/nyxStore'
import AgentSpinner from '../AgentSpinner'

function Hexagon({ filled, active, index }: { filled: boolean; active: boolean; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.08, duration: 0.4, ease: 'easeOut' }}
      style={{
        width: 60,
        height: 60,
        clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
        background: filled
          ? 'rgba(232,185,35,0.8)'
          : 'rgba(232,185,35,0.1)',
        border: 'none',
        transition: 'background 0.5s ease',
        position: 'relative',
        outline: active ? `2px solid #E8B923` : 'none',
        outlineOffset: 4,
      }}
    >
      {active && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: [1, 2.5], opacity: [0.6, 0] }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(circle, rgba(232,185,35,0.6) 0%, transparent 70%)',
            clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
          }}
        />
      )}
    </motion.div>
  )
}

export default function HoneyMeshPhase() {
  const honeyResult = useNyxStore(s => s.honeyResult)
  const honeyTriggered = useNyxStore(s => s.honeyTriggered)
  const setHoneyTriggered = useNyxStore(s => s.setHoneyTriggered)
  const phase = useNyxStore(s => s.displayPhase)
  const isActive = phase === 'honey_mesh'
  const [simulating, setSimulating] = useState(false)
  const [simResult, setSimResult] = useState('')

  const tokens = honeyResult?.tokens || []
  const numHexes = Math.max(6, tokens.length + 3)

  const triggerSimulation = async () => {
    setSimulating(true)
    setSimResult('')
    try {
      await fetch('/api/honey/trigger', { method: 'POST' })
      setHoneyTriggered(true)
      setSimResult('Honeytoken accessed. Confidence: HIGH. Abuse confirmed, not assumed.')
    } catch {
      setSimResult('Simulation failed. Is the backend running?')
    } finally {
      setSimulating(false)
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
      {/* Left: ring */}
      <div className="phase-rail" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 32 }}>
        <SignalRing phase="honey_mesh" active={isActive} />

        {/* Token count */}
        {tokens.length > 0 && (
          <div className="sidebar-stat-card" style={{
            textAlign: 'center',
            background: 'rgba(232,185,35,0.08)',
            border: '1px solid rgba(232,185,35,0.25)',
            borderRadius: 12,
            padding: '16px 24px',
          }}>
            <div style={{ fontSize: 32, fontWeight: 800, color: '#E8B923', lineHeight: 1 }}>{tokens.length}</div>
            <div style={{ fontSize: 12, color: '#6B6B6B', marginTop: 4 }}>honeytokens deployed</div>
          </div>
        )}
      </div>

      {/* Right: hexagons + sim button */}
      <div className="phase-content" style={{ flex: 1 }}>
        <div className="phase-heading" style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: '#111111', letterSpacing: '-0.02em' }}>
            Deception Honey Mesh
          </h2>
          <p style={{ fontSize: 13, color: '#6B6B6B', marginTop: 4 }}>
            Fake credentials deployed near real ones. Any access triggers instant detection.
          </p>
        </div>

        {/* Hexagon grid */}
        {tokens.length === 0 && isActive ? (
          <div className="agent-loading" style={{
            border: '1px solid rgba(232,185,35,0.15)',
            borderRadius: 12,
            marginBottom: 24,
            background: 'rgba(232,185,35,0.04)',
          }}>
            <AgentSpinner color="#E8B923" />
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>
              Deploying honeytokens...
            </div>
          </div>
        ) : (
          <div className="honey-grid" style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            marginBottom: 24,
            padding: '20px',
            background: 'rgba(232,185,35,0.04)',
            border: '1px solid rgba(232,185,35,0.15)',
            borderRadius: 12,
          }}>
            {Array.from({ length: numHexes }).map((_, i) => (
              <Hexagon
                key={i}
                filled={i < tokens.length}
                active={honeyTriggered && i < tokens.length}
                index={i}
              />
            ))}
          </div>
        )}

        {/* Token list */}
        {tokens.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
            {tokens.map(token => (
              <div className="token-card" key={token.id} style={{
                background: 'white',
                border: '1px solid #E5E5E3',
                borderRadius: 10,
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}>
                <div style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: '#E8B923',
                  flexShrink: 0,
                  boxShadow: '0 0 6px rgba(232,185,35,0.5)',
                }} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#111111' }}>{token.description}</div>
                  <div style={{ fontSize: 11, color: '#6B6B6B', fontFamily: "'JetBrains Mono', monospace", marginTop: 2 }}>
                    {token.deployed_at}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Simulation button - HONESTLY LABELED */}
        <div className="simulation-card" style={{
          background: 'rgba(232,185,35,0.06)',
          border: '1px dashed rgba(232,185,35,0.4)',
          borderRadius: 12,
          padding: '20px',
        }}>
          <div style={{ fontSize: 11, color: '#9a7900', marginBottom: 12, fontWeight: 600, letterSpacing: '0.08em' }}>
            SIMULATION ONLY -- No live attacker present. Interaction trigger is for demonstration.
          </div>

          <button
            onClick={triggerSimulation}
            disabled={simulating || honeyTriggered}
            style={{
              padding: '10px 24px',
              borderRadius: 8,
              border: '1.5px solid #E8B923',
              background: honeyTriggered ? 'rgba(46,204,113,0.1)' : 'transparent',
              color: honeyTriggered ? '#2ECC71' : '#E8B923',
              fontSize: 13,
              fontWeight: 600,
              cursor: simulating || honeyTriggered ? 'default' : 'pointer',
              fontFamily: 'Inter, sans-serif',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            {simulating ? 'Simulating...' : honeyTriggered ? 'Honeytoken Triggered' : 'Simulate Attacker Interaction'}
          </button>

          <AnimatePresence>
            {simResult && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                style={{
                  marginTop: 12,
                  fontSize: 13,
                  color: '#2ECC71',
                  fontWeight: 500,
                }}
              >
                {simResult}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
