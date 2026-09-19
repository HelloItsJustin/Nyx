// Zustand global store - the single source of truth for the dashboard.
// Synced from WebSocket events. Persists through reconnects.
//
// KEY DESIGN: Two-phase model for manual progression:
//   dataPhase  = the phase the backend is currently sending data for
//   displayPhase = the phase the USER is currently viewing (advances on user click)
// Data for future phases is buffered in the store; displayed only when user proceeds.

import { create } from 'zustand'

export type Phase =
  | 'idle'
  | 'detection'
  | 'blast_radius'
  | 'phantom'
  | 'honey_mesh'
  | 'remediation'
  | 'summary'
  | 'error'

export const PHASE_ORDER: Phase[] = [
  'detection', 'blast_radius', 'phantom', 'honey_mesh', 'remediation', 'summary'
]

export interface Finding {
  id: string
  engine: 'trufflehog' | 'custom-entropy' | 'custom-mcp'
  detector: string
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  verified: boolean
  status: 'verified-live' | 'unverified' | string
  file: string
  line: number
  description: string
  secret_preview: string
  context: string
  recommendation: string
  blast_radius_tier: string
}

export interface GraphNode {
  id: string
  backing_file?: string
  type: string
  risk: string
  label: string
  description: string
  x?: number
  y?: number
  evidence?: Array<{ file: string; line: number; match: string }>
}

export interface GraphEdge {
  id?: string
  source: string
  target: string
  type: string
  label?: string
  evidence?: {
    kind: string
    match: string
    source: { file: string; line: number }
    target: { file: string; line: number }
    description: string
  }
}

export interface BlastGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
  summary: {
    tier: string
    reach: number
    external_services: number
    affected_files: number
    description: string
  }
}

export interface Fix {
  id: string
  finding_id: string
  title: string
  severity: string
  file: string
  issue: string
  fix: string
  diff: { before: string; after: string }
  branch: string
  commit_message: string
  pr_title: string
  pr_body: string
  pr_url?: string
}

export interface HoneyToken {
  id: string
  type: string
  value: string
  deployed_at: string
  description: string
}

export interface PhantomResult {
  log_lines: string[]
  captured_events: number
  confirmed_exploitable: boolean
  summary: string
}

export interface HoneyResult {
  tokens: HoneyToken[]
  triggered: boolean
  confidence: number
  summary: string
}

interface NyxState {
  // Screen routing
  screen: 'loader' | 'landing' | 'scan'

  // Phase model: dataPhase is what the backend is sending,
  // displayPhase is what the user is looking at.
  dataPhase: Phase       // tracks backend progress
  displayPhase: Phase    // what the user sees (user-controlled)
  phaseComplete: Record<string, boolean>  // which phases have gotten 'complete' from backend
  awaitingProceed: boolean  // true when current display phase has completed and user hasn't clicked next
  isProceeding: boolean     // locks the action while the backend accepts the user's click
  proceedError: string | null

  wsConnected: boolean
  repoUrl: string | null

  // Scan data (accumulated regardless of display phase)
  findings: Finding[]
  blastGraph: BlastGraph | null
  phantomResult: PhantomResult | null
  honeyResult: HoneyResult | null
  fixes: Fix[]
  trustScore: number
  phaseStatus: Record<string, string>
  terminalLines: string[]
  honeyTriggered: boolean

  // Actions
  setScreen: (s: NyxState['screen']) => void
  setDisplayPhase: (p: Phase) => void
  proceedToNextPhase: () => Promise<void>
  setWsConnected: (v: boolean) => void
  setRepoUrl: (url: string) => void
  handleWsEvent: (event: any) => void
  addFinding: (f: Finding) => void
  addTerminalLine: (line: string) => void
  addBlastNode: (node: GraphNode) => void
  setHoneyTriggered: (v: boolean) => void
  addFix: (fix: Fix) => void
  updateFixPrUrl: (fixId: string, prUrl: string) => void
  setTrustScore: (n: number) => void
  reset: () => void
}

const initialState = {
  screen: 'loader' as const,
  dataPhase: 'idle' as Phase,
  displayPhase: 'idle' as Phase,
  phaseComplete: {} as Record<string, boolean>,
  awaitingProceed: false,
  isProceeding: false,
  proceedError: null,
  wsConnected: false,
  repoUrl: null,
  findings: [],
  blastGraph: null,
  phantomResult: null,
  honeyResult: null,
  fixes: [],
  trustScore: 75,
  phaseStatus: {},
  terminalLines: [],
  honeyTriggered: false,
}

export const useNyxStore = create<NyxState>((set, get) => ({
  ...initialState,

  setScreen: (screen) => set({ screen }),

  setDisplayPhase: (p) => set({ displayPhase: p }),

  proceedToNextPhase: async () => {
    const { displayPhase, awaitingProceed, isProceeding } = get()
    if (!awaitingProceed || isProceeding) return

    const idx = PHASE_ORDER.indexOf(displayPhase)
    const next = PHASE_ORDER[idx + 1]
    if (!next) return

    set({ isProceeding: true, proceedError: null })
    try {
      const response = await fetch('/api/scan/proceed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phase: displayPhase }),
      })
      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.detail || 'Nyx could not advance this phase.')
      }
      set({ displayPhase: next, awaitingProceed: false, isProceeding: false })
    } catch (error) {
      set({
        isProceeding: false,
        proceedError: error instanceof Error ? error.message : 'Nyx could not advance this phase.',
      })
    }
  },

  setWsConnected: (wsConnected) => set({ wsConnected }),
  setRepoUrl: (repoUrl) => set({ repoUrl }),

  handleWsEvent: (event: any) => {
    const { phase, status } = event

    // Always track what the backend is doing
    if (phase && phase !== get().dataPhase) {
      set({ dataPhase: phase as Phase })
      // Auto-set displayPhase to first real phase when scan starts
      if (get().displayPhase === 'idle' && phase === 'detection') {
        set({ displayPhase: 'detection' })
      }
    }

    // Track status per phase
    set(s => ({ phaseStatus: { ...s.phaseStatus, [phase]: status } }))

    // --- Detection ---
    if (status === 'finding' && event.finding) {
      get().addFinding(event.finding)
      if (event.finding.verified || event.finding.severity === 'CRITICAL') {
        set(s => ({ trustScore: Math.max(20, s.trustScore - 8) }))
      } else if (event.finding.severity === 'HIGH') {
        set(s => ({ trustScore: Math.max(30, s.trustScore - 4) }))
      }
    }

    // --- Blast Radius nodes ---
    if (status === 'node' && event.node) {
      get().addBlastNode(event.node)
    }
    if (phase === 'blast_radius' && status === 'complete' && event.graph) {
      set({ blastGraph: event.graph })
    }

    // --- Phantom terminal ---
    if (status === 'log' && event.line) {
      get().addTerminalLine(event.line)
    }
    if (phase === 'phantom' && status === 'complete' && event.result) {
      set({ phantomResult: event.result })
      set(s => ({ trustScore: Math.min(s.trustScore + 5, 90) }))
    }

    // --- Honey Mesh ---
    if (status === 'triggered') {
      set({ honeyTriggered: true })
      set(s => ({ trustScore: Math.min(s.trustScore + 5, 92) }))
    }
    if (phase === 'honey_mesh' && status === 'complete' && event.result) {
      set({ honeyResult: event.result })
    }

    // --- Remediation ---
    if (status === 'fix' && event.fix) {
      get().addFix(event.fix)
    }
    if (phase === 'remediation' && status === 'complete') {
      if (event.fixes) set({ fixes: event.fixes })
      set(s => ({ trustScore: Math.min(s.trustScore + 10, 98) }))
    }

    // --- Summary ---
    if (phase === 'summary' && status === 'complete') {
      if (event.trust_score) set({ trustScore: event.trust_score })
    }

    // --- PR created ---
    if (status === 'pr_created' && event.pr_url) {
      const targetFixId = event.fix_id
      const targetFindingId = event.finding_id
      if (targetFixId || targetFindingId) {
        set(s => ({
          fixes: s.fixes.map(f =>
            f.id === targetFixId || f.finding_id === targetFindingId
              ? { ...f, pr_url: event.pr_url }
              : f
          )
        }))
      }
    }

    // --- Phase complete gate ---
    // Mark this phase as done and set awaiting proceed flag
    // ONLY if the user is currently viewing this phase
    if (status === 'complete' && phase) {
      set(s => ({
        phaseComplete: { ...s.phaseComplete, [phase]: true },
        // Only show "proceed" prompt if the user is currently on this phase
        awaitingProceed: s.displayPhase === phase && phase !== 'summary',
        isProceeding: false,
        proceedError: null,
      }))
    }
  },

  addFinding: (f) => set(s => {
    if (s.findings.find(x => x.id === f.id)) return s
    return { findings: [...s.findings, f] }
  }),

  addTerminalLine: (line) => set(s => ({
    terminalLines: [...s.terminalLines.slice(-200), line]
  })),

  addBlastNode: (node) => set(s => {
    if (!s.blastGraph) {
      return { blastGraph: { nodes: [node], edges: [], summary: { tier: node.risk, reach: 1, external_services: 0, affected_files: 1, description: '' } } }
    }
    if (s.blastGraph.nodes.find(n => n.id === node.id)) return s
    return { blastGraph: { ...s.blastGraph, nodes: [...s.blastGraph.nodes, node] } }
  }),

  addFix: (fix) => set(s => {
    if (s.fixes.find(f => f.id === fix.id)) return s
    return { fixes: [...s.fixes, fix] }
  }),

  updateFixPrUrl: (fixId, prUrl) => set(s => ({
    fixes: s.fixes.map(f => f.id === fixId ? { ...f, pr_url: prUrl } : f)
  })),

  setHoneyTriggered: (v) => set({ honeyTriggered: v }),
  setTrustScore: (n) => set({ trustScore: n }),

  reset: () => set({
    ...initialState,
    screen: 'landing',
    wsConnected: get().wsConnected
  }),
}))
