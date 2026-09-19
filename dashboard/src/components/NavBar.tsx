// NavBar - top navigation with dotted grid, pill nav items, Nyx logo

import { useNyxStore } from '../store/nyxStore'


const NAV_ITEMS = [
  { label: 'Dashboard', phase: null },
  { label: 'Detection', phase: 'detection' },
  { label: 'Blast Radius', phase: 'blast_radius' },
  { label: 'Phantom', phase: 'phantom' },
  { label: 'Honey Mesh', phase: 'honey_mesh' },
  { label: 'Remediation', phase: 'remediation' },
]

function DotGrid() {
  return (
    <svg className="nav-grid" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
      {[4, 12, 20].flatMap(x => [4, 12, 20].map(y => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="1.5" fill="#D1D1CE" />
      )))}
    </svg>
  )
}

export default function NavBar() {
  const phase = useNyxStore(s => s.displayPhase)
  const wsConnected = useNyxStore(s => s.wsConnected)

  return (
    <nav className="top-nav">
      <div className="nav-mark" title="Nyx workspace">
        <DotGrid />
      </div>

      <div className="nav-links" aria-label="Assessment phases">
        {NAV_ITEMS.map(item => {
          const isActive = item.phase === null ? phase === 'idle' : phase === item.phase
          return (
            <button
              key={item.label}
              className={`nav-link ${isActive ? 'is-active' : ''}`}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => {}}
            >
              {item.label}
            </button>
          )
        })}
      </div>

      <div className="nav-spacer" />

      <div className={`nav-status ${wsConnected ? 'is-connected' : ''}`} title={wsConnected ? 'Connected to the local Nyx backend' : 'Trying to reach the local Nyx backend'}>
        <span className="nav-status-dot" />
        <span>{wsConnected ? 'Local engine online' : 'Reconnecting'}</span>
      </div>

      <div className="nav-brand" aria-label="Nyx">
        <span className="nav-brand-symbol" />
        <span>NYX</span>
      </div>
    </nav>
  )
}
