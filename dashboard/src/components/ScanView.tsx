// ScanView - Shows one phase at a time. User clicks "Proceed" to advance.
// displayPhase = what user sees. dataPhase = backend progress.

import { AnimatePresence, motion } from 'framer-motion'
import { Clock } from 'lucide-react'
import { useNyxStore, type Phase, PHASE_ORDER } from '../store/nyxStore'
import { PHASE_CONFIG } from './SignalRing'
import DetectionPhase from './phases/Detection'
import BlastRadiusPhase from './phases/BlastRadius'
import PhantomPhase from './phases/PhantomRuntime'
import HoneyMeshPhase from './phases/HoneyMesh'
import RemediationPhase from './phases/Remediation'
import SummaryPhase from './phases/Summary'

const GLOW_COLORS: Record<string, string> = {
  idle:        'rgba(108,92,231,0.10)',
  detection:   'rgba(108,92,231,0.10)',
  blast_radius:'rgba(245,166,35,0.10)',
  phantom:     'rgba(58,199,217,0.10)',
  honey_mesh:  'rgba(232,185,35,0.10)',
  remediation: 'rgba(46,204,113,0.10)',
  summary:     'rgba(46,204,113,0.10)',
  error:       'rgba(255,107,107,0.10)',
}

function PhaseContent({ phase }: { phase: Phase }) {
  switch (phase) {
    case 'detection':    return <DetectionPhase />
    case 'blast_radius': return <BlastRadiusPhase />
    case 'phantom':      return <PhantomPhase />
    case 'honey_mesh':   return <HoneyMeshPhase />
    case 'remediation':  return <RemediationPhase />
    case 'summary':      return <SummaryPhase />
    default:             return <DetectionPhase />
  }
}

// Top progress bar
function PhaseBar({ current }: { current: Phase }) {
  const idx = PHASE_ORDER.indexOf(current)
  const color = PHASE_CONFIG[current]?.color || '#6C5CE7'
  return (
    <div className="phase-progress-rail" style={{ position: 'fixed', top: 56, left: 0, right: 0, height: 2, background: '#F0F0EE', zIndex: 99 }}>
      <motion.div
        animate={{ width: `${((idx + 1) / PHASE_ORDER.length) * 100}%` }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
        className="phase-progress-value"
        style={{ height: '100%', background: color, transition: 'background 0.6s ease' }}
      />
    </div>
  )
}

// Phase stepper shown at the bottom
function PhaseStepper({ display, complete }: {
  display: Phase
  complete: Record<string, boolean>
}) {
  const displayIdx = PHASE_ORDER.indexOf(display)

  return (
    <div className="phase-stepper" style={{
      position: 'fixed',
      bottom: 24,
      left: '50%',
      transform: 'translateX(-50%)',
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      zIndex: 90,
      background: 'rgba(250,250,249,0.92)',
      backdropFilter: 'blur(10px)',
      padding: '8px 16px',
      borderRadius: 999,
      border: '1px solid #E5E5E3',
      boxShadow: '0 2px 16px rgba(0,0,0,0.06)',
    }}>
      {PHASE_ORDER.map((p, i) => {
        const isCurrent = p === display
        const isDone = complete[p]
        const isPast = i < displayIdx
        const phaseColor = PHASE_CONFIG[p]?.color || '#6C5CE7'

        return (
          <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <motion.div
              className="phase-step"
              title={PHASE_CONFIG[p]?.label}
              animate={{
                width: isCurrent ? 20 : 7,
                background: isPast || isDone
                  ? '#2ECC71'
                  : isCurrent
                  ? phaseColor
                  : '#D1D1CE',
              }}
              transition={{ duration: 0.3 }}
              style={{ height: 7, borderRadius: 4 }}
            />
            {i < PHASE_ORDER.length - 1 && (
              <div style={{ width: 6, height: 1, background: '#E5E5E3' }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// "Proceed" banner - appears at bottom-right when a phase is complete
function ProceedBanner({
  phase,
  onProceed,
  isProceeding,
  error,
}: {
  phase: Phase
  onProceed: () => void
  isProceeding: boolean
  error: string | null
}) {
  const color = PHASE_CONFIG[phase]?.color || '#6C5CE7'
  const nextLabel = 'Proceed'

  return (
    <div
      className="proceed-dock"
      style={{
        position: 'fixed',
        right: 24,
        bottom: 24,
        zIndex: 1000,
        pointerEvents: 'none',
      }}
    >
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.95 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="proceed-banner"
      style={{
        width: 'auto',
        margin: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        gap: 0,
        padding: 8,
        background: 'rgba(255,255,255,0.98)',
        border: `1px solid ${color}55`,
        borderRadius: 16,
        boxShadow: '0 14px 36px rgba(17,17,17,0.20)',
        pointerEvents: 'auto',
      }}
    >
      <button
        onClick={onProceed}
        disabled={isProceeding}
        className="proceed-action"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: 124,
          minHeight: 42,
          padding: '10px 18px',
          borderRadius: 12,
          border: `1.5px solid ${color}`,
          background: color,
          color: 'white',
          fontSize: 14,
          fontWeight: 700,
          cursor: isProceeding ? 'wait' : 'pointer',
          opacity: isProceeding ? 0.72 : 1,
          fontFamily: 'Inter, sans-serif',
          boxShadow: `0 4px 20px ${color}40`,
          transition: 'all 0.2s ease',
          letterSpacing: '-0.01em',
        }}
        onMouseEnter={e => {
          if (isProceeding) return
          (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-2px)'
          ;(e.currentTarget as HTMLButtonElement).style.boxShadow = `0 6px 24px ${color}50`
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLButtonElement).style.transform = ''
          ;(e.currentTarget as HTMLButtonElement).style.boxShadow = `0 4px 20px ${color}40`
        }}
      >
        {isProceeding ? 'Starting next agent…' : nextLabel}
      </button>
      {error && (
        <div role="alert" style={{ maxWidth: 280, fontSize: 11, color: '#C0392B', textAlign: 'right' }}>
          {error}
        </div>
      )}
    </motion.div>
    </div>
  )
}

// "Waiting" indicator when backend hasn't finished yet but user is ahead
function WaitingIndicator({ for: forPhase }: { for: Phase }) {
  const color = PHASE_CONFIG[forPhase]?.color || '#6C5CE7'
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="waiting-indicator"
      style={{
        position: 'fixed',
        bottom: 80,
        right: 32,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 16px',
        borderRadius: 10,
        background: 'white',
        border: '1px solid #E5E5E3',
        fontSize: 12,
        color: '#6B6B6B',
        boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
      }}
    >
      <Clock size={14} style={{ color }} />
      Waiting for {PHASE_CONFIG[forPhase]?.label}...
    </motion.div>
  )
}

export default function ScanView() {
  const displayPhase = useNyxStore(s => s.displayPhase)
  const dataPhase = useNyxStore(s => s.dataPhase)
  const phaseComplete = useNyxStore(s => s.phaseComplete)
  const awaitingProceed = useNyxStore(s => s.awaitingProceed)
  const isProceeding = useNyxStore(s => s.isProceeding)
  const proceedError = useNyxStore(s => s.proceedError)
  const proceedToNextPhase = useNyxStore(s => s.proceedToNextPhase)

  const glowColor = GLOW_COLORS[displayPhase] || GLOW_COLORS.idle
  // Is the backend still running this display phase?
  const displayIdx = PHASE_ORDER.indexOf(displayPhase)
  const dataIdx = PHASE_ORDER.indexOf(dataPhase)
  const backendBehind = dataIdx < displayIdx

  return (
    <div className="scan-shell" style={{ minHeight: '100vh', position: 'relative', overflow: 'hidden' }}>
      <PhaseBar current={displayPhase} />

      {/* Corner glows */}
      <motion.div className="glow-corner-bl" animate={{ background: glowColor }} transition={{ duration: 0.6 }} />
      <motion.div className="glow-corner-tr" animate={{ background: glowColor }} transition={{ duration: 0.6 }} />

      {/* Phase content with animation */}
      <div className="scan-content" style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 80,
        paddingBottom: 80,
        position: 'relative',
        zIndex: 10,
      }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={displayPhase}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            style={{ width: '100%', display: 'flex', justifyContent: 'center' }}
          >
            <PhaseContent phase={displayPhase} />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Phase stepper dots */}
      <PhaseStepper display={displayPhase} complete={phaseComplete} />

      {/* Proceed / Waiting indicators */}
      <AnimatePresence>
        {awaitingProceed && displayPhase !== 'summary' && (
          <ProceedBanner
            key="proceed"
            phase={displayPhase}
            onProceed={proceedToNextPhase}
            isProceeding={isProceeding}
            error={proceedError}
          />
        )}
        {backendBehind && !awaitingProceed && (
          <WaitingIndicator key="waiting" for={displayPhase} />
        )}
      </AnimatePresence>
    </div>
  )
}
