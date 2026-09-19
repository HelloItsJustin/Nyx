// SignalRing - the compact, reusable loader/status mark for every Nyx phase.

import { motion } from 'framer-motion'
import type { Phase } from '../store/nyxStore'

export const PHASE_CONFIG = {
  idle: {
    color: '#6C5CE7',
    glow: 'rgba(108,92,231,0.22)',
    icon: 'search',
    label: 'Ready',
  },
  detection: {
    color: '#6C5CE7',
    glow: 'rgba(108,92,231,0.22)',
    icon: 'search',
    label: 'Detection Agent',
  },
  blast_radius: {
    color: '#F5A623',
    glow: 'rgba(245,166,35,0.22)',
    icon: 'node',
    label: 'Blast-Radius Mapper',
  },
  phantom: {
    color: '#3AC7D9',
    glow: 'rgba(58,199,217,0.22)',
    icon: 'flask',
    label: 'Phantom Runtime',
  },
  honey_mesh: {
    color: '#E8B923',
    glow: 'rgba(232,185,35,0.22)',
    icon: 'honeycomb',
    label: 'Deception Honey Mesh',
  },
  remediation: {
    color: '#2ECC71',
    glow: 'rgba(46,204,113,0.22)',
    icon: 'wrench',
    label: 'Remediation Agent',
  },
  summary: {
    color: '#2ECC71',
    glow: 'rgba(46,204,113,0.22)',
    icon: 'check',
    label: 'Complete',
  },
  error: {
    color: '#FF6B6B',
    glow: 'rgba(255,107,107,0.22)',
    icon: 'alert',
    label: 'Error',
  },
}

function PhaseIcon({ icon, color, size = 32 }: { icon: string; color: string; size?: number }): React.ReactElement {
  const icons: Record<string, React.ReactElement> = {
    search: (
      <g stroke={color} strokeWidth="2" fill="none" strokeLinecap="round">
        <circle cx="20" cy="20" r="9" />
        <line x1="26.5" y1="26.5" x2="33" y2="33" />
      </g>
    ),
    node: (
      <g stroke={color} strokeWidth="2" fill="none">
        <circle cx="20" cy="13" r="4" />
        <circle cx="11" cy="28" r="4" />
        <circle cx="29" cy="28" r="4" />
        <line x1="20" y1="17" x2="13" y2="24" />
        <line x1="20" y1="17" x2="27" y2="24" />
      </g>
    ),
    flask: (
      <g stroke={color} strokeWidth="2" fill="none" strokeLinecap="round">
        <path d="M16 10 L16 22 L10 32 L30 32 L24 22 L24 10 Z" />
        <line x1="14" y1="18" x2="26" y2="18" />
        <circle cx="17" cy="26" r="1.5" fill={color} />
        <circle cx="22" cy="28" r="1" fill={color} />
      </g>
    ),
    honeycomb: (
      <g stroke={color} strokeWidth="2" fill="none">
        <polygon points="20,10 26,14 26,22 20,26 14,22 14,14" />
        <polygon points="20,26 26,30 26,38 20,42 14,38 14,30" opacity="0.5" />
        <polygon points="32,10 38,14 38,22 32,26 26,22 26,14" opacity="0.5" />
      </g>
    ),
    wrench: (
      <g stroke={color} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M27 10 C31 10 34 13 34 17 C34 21 31 24 27 24 L15 36 C13 38 11 38 11 36 C11 34 13 32 15 32 L27 20 C27 20 27 10 27 10Z" />
        <circle cx="14" cy="35" r="1.5" fill={color} />
      </g>
    ),
    check: (
      <g stroke={color} strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="10,22 18,30 30,14" />
      </g>
    ),
    alert: (
      <g stroke={color} strokeWidth="2" fill="none" strokeLinecap="round">
        <path d="M10 32 L20 10 L30 32 Z" />
        <line x1="20" y1="15" x2="20" y2="25" />
        <circle cx="20" cy="29" r="1.5" fill={color} />
      </g>
    ),
  }

  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      {icons[icon] || icons.search}
    </svg>
  )
}

interface SignalRingProps {
  phase: Phase
  active?: boolean
  size?: number
  pulseOnEvent?: boolean
}

export default function SignalRing({ phase, active = false, size = 160 }: SignalRingProps) {
  const cfg = PHASE_CONFIG[phase] || PHASE_CONFIG.idle
  const visualSize = Math.max(86, size - 26)
  const center = visualSize / 2
  const radius = center - 11

  return (
    <div
      className="phase-loader"
      aria-label={`${cfg.label}: ${active ? 'working' : 'complete'}`}
      role="status"
      style={{ width: size, height: size + 30, '--phase-color': cfg.color, '--phase-glow': cfg.glow } as React.CSSProperties}
    >
      <div className="phase-loader-orb" style={{ width: visualSize, height: visualSize }}>
        <div className="phase-loader-glow" />
        <svg width={visualSize} height={visualSize} viewBox={`0 0 ${visualSize} ${visualSize}`} aria-hidden="true">
          <circle cx={center} cy={center} r={radius} fill="none" stroke={cfg.color} strokeWidth="1" opacity="0.15" />
          <circle cx={center} cy={center} r={radius - 10} fill="none" stroke={cfg.color} strokeWidth="1" opacity="0.1" />
          <motion.g
            animate={active ? { rotate: 360 } : { rotate: 0 }}
            transition={active ? { duration: 1.5, ease: 'linear', repeat: Infinity } : { duration: 0.25 }}
            style={{ transformOrigin: `${center}px ${center}px`, transformBox: 'view-box' }}
          >
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={cfg.color}
              strokeWidth="3"
              strokeLinecap="round"
              pathLength="1"
              strokeDasharray="0.19 0.81"
            />
          </motion.g>
          <motion.circle
            cx={center}
            cy={center}
            r="5"
            fill={cfg.color}
            animate={active ? { opacity: [0.12, 0.26, 0.12], scale: [0.9, 1.08, 0.9] } : { opacity: 0.1, scale: 1 }}
            transition={active ? { duration: 1.4, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.25 }}
          />
        </svg>
        <div className="phase-loader-icon">
          <PhaseIcon icon={cfg.icon} color={cfg.color} size={36} />
        </div>
      </div>

      <div className="phase-loader-label">{cfg.label}</div>
      <div className="phase-loader-state">{active ? 'ANALYZING' : 'COMPLETE'}</div>
    </div>
  )
}
