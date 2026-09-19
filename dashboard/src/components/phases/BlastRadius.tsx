// Blast Radius Phase - React Flow graph with dagre hierarchical layout

import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import dagre from 'dagre'
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  MarkerType,
  type Node,
  type Edge,
  Handle,
  Position,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import SignalRing from '../SignalRing'
import { useNyxStore } from '../../store/nyxStore'
import AgentSpinner from '../AgentSpinner'

// ────────────── Colors ──────────────
const RISK_META: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  CRITICAL: { bg: '#FFF1F1', border: '#FFBABA', text: '#7A0000', dot: '#E53E3E' },
  HIGH:     { bg: '#FFF8F0', border: '#FDD9B5', text: '#7B3100', dot: '#DD6B20' },
  MEDIUM:   { bg: '#FFFBEA', border: '#FAE29F', text: '#744210', dot: '#D69E2E' },
  LOW:      { bg: '#F0FFF4', border: '#C6F6D5', text: '#1A4731', dot: '#38A169' },
}

const NODE_TYPE_ICONS: Record<string, string> = {
  source:   '🔑',
  config:   '⚙️',
  route:    '🔀',
  model:    '🗄️',
  external: '🌐',
  frontend: '💻',
  test:     '🧪',
  server:   '🖥️',
}

// ────────────── Custom Node ──────────────
function BlastNode({ data }: { data: any }) {
  const meta = RISK_META[data.risk] || RISK_META.LOW
  const icon = NODE_TYPE_ICONS[data.nodeType] || '📄'
  const shortLabel = (data.label || data.id || '').split('/').pop() || ''

  return (
    <div className="blast-node" style={{
      background: meta.bg,
      border: `1.5px solid ${meta.border}`,
      borderRadius: 10,
      padding: '10px 14px',
      minWidth: 130,
      maxWidth: 180,
      boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
      fontFamily: 'Inter, sans-serif',
      cursor: data.onShowEvidence ? 'pointer' : 'default',
    }}>
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
        <span style={{ fontSize: 14 }}>{icon}</span>
        <div style={{
          width: 7, height: 7, borderRadius: '50%',
          background: meta.dot, flexShrink: 0,
          boxShadow: `0 0 6px ${meta.dot}80`,
        }} />
        <span style={{
          fontSize: 9, fontWeight: 700, color: meta.text,
          letterSpacing: '0.08em', textTransform: 'uppercase',
        }}>
          {data.risk}
        </span>
      </div>

      <div style={{
        fontSize: 11.5,
        fontWeight: 600,
        color: '#1A202C',
        lineHeight: 1.3,
        wordBreak: 'break-word',
      }}>
        {shortLabel}
      </div>

      {data.description && (
        <div style={{
          fontSize: 9.5,
          color: '#718096',
          marginTop: 4,
          lineHeight: 1.3,
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical' as any,
        }}>
          {data.description}
        </div>
      )}

      {data.onShowEvidence && data.evidence?.[0] && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            data.onShowEvidence({
              file: data.evidence[0].file,
              line: data.evidence[0].line,
              match: data.evidence[0].match,
              description: `${data.evidence[0].file}:${data.evidence[0].line} is a verified graph node (${data.evidence[0].match}).`,
            })
          }}
          style={{ marginTop: 8, border: 0, background: 'transparent', color: meta.text, fontSize: 9, fontWeight: 700, cursor: 'pointer', padding: 0 }}
        >
          SHOW EVIDENCE
        </button>
      )}

      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  )
}

const nodeTypes = { blastNode: BlastNode }

// ────────────── Dagre Layout ──────────────
function getLayoutedElements(rawNodes: any[], rawEdges: any[], onShowEvidence: (evidence: any) => void): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'TB', ranksep: 70, nodesep: 50, marginx: 20, marginy: 20 })

  const NODE_W = 180
  const NODE_H = 90

  rawNodes.forEach(n => {
    g.setNode(n.id, { width: NODE_W, height: NODE_H })
  })

  rawEdges.forEach(e => {
    if (g.hasNode(e.source) && g.hasNode(e.target)) {
      g.setEdge(e.source, e.target)
    }
  })

  dagre.layout(g)

  const nodes: Node[] = rawNodes.map(n => {
    const pos = g.node(n.id)
    return {
      id: n.id,
      type: 'blastNode',
      position: {
        x: pos ? pos.x - NODE_W / 2 : 0,
        y: pos ? pos.y - NODE_H / 2 : 0,
      },
      data: {
        label: n.label || n.id,
        risk: n.risk || 'LOW',
        nodeType: n.type || 'source',
        description: n.description || '',
        id: n.id,
        evidence: n.evidence || [],
        onShowEvidence,
      },
    }
  })

  const EDGE_COLORS: Record<string, string> = {
    authenticates: '#6C5CE7',
    imports:       '#3AC7D9',
    shared_reference: '#F5A623',
    calls:         '#2ECC71',
    configures:    '#E8B923',
  }

  const edges: Edge[] = rawEdges
    .filter(e => e.source !== e.target)
    .map((e, i) => {
      const color = EDGE_COLORS[e.type] || '#CBD5E0'
      return {
        id: e.id || `edge-${i}`,
        source: e.source,
        target: e.target,
        type: 'smoothstep',
        label: e.type === 'shared_reference' ? 'shared ref' : e.type || '',
        data: { evidence: e.evidence },
        labelStyle: {
          fontSize: 9,
          fill: color,
          fontFamily: 'Inter, sans-serif',
          fontWeight: 600,
        },
        labelBgStyle: { fill: 'white', fillOpacity: 0.85 },
        labelBgPadding: [3, 5] as [number, number],
        labelBgBorderRadius: 4,
        style: {
          stroke: color,
          strokeWidth: 1.5,
          strokeDasharray: e.type === 'shared_reference' ? '5 3' : undefined,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color,
          width: 12,
          height: 12,
        },
        animated: e.type === 'authenticates',
      }
    })

  return { nodes, edges }
}

// ────────────── Main Component ──────────────
export default function BlastRadiusPhase() {
  const blastGraph = useNyxStore(s => s.blastGraph)
  const phase = useNyxStore(s => s.displayPhase)
  const isActive = phase === 'blast_radius'
  const [selectedEvidence, setSelectedEvidence] = useState<any>(null)
  const [sourceContext, setSourceContext] = useState<any[]>([])
  const [evidenceError, setEvidenceError] = useState('')

  const showEvidence = useCallback(async (evidence: any) => {
    const source = evidence?.source || evidence
    const target = evidence?.target
    if (!source?.file || !source?.line) return
    setSelectedEvidence(evidence)
    setEvidenceError('')
    setSourceContext([])
    try {
      const locations = target?.file && target?.line ? [source, target] : [source]
      const data = await Promise.all(locations.map(async location => {
        const response = await fetch('/api/blast/evidence', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ file: location.file, line: location.line }),
        })
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(payload.detail || 'Evidence could not be loaded.')
        return payload
      }))
      setSourceContext(data)
    } catch (error) {
      setEvidenceError(error instanceof Error ? error.message : 'Evidence could not be loaded.')
    }
  }, [])

  const { nodes: layoutNodes, edges: layoutEdges } = useMemo(() => {
    if (!blastGraph?.nodes?.length) return { nodes: [], edges: [] }
    return getLayoutedElements(blastGraph.nodes, blastGraph.edges, showEvidence)
  }, [blastGraph, showEvidence])

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])

  useEffect(() => {
    setNodes(layoutNodes)
    setEdges(layoutEdges)
  }, [layoutNodes, layoutEdges])

  const summary = blastGraph?.summary

  return (
    <div className="phase-layout blast-layout" style={{
      display: 'flex',
      gap: 32,
      alignItems: 'flex-start',
      width: '100%',
      maxWidth: 1100,
      padding: '0 32px',
    }}>
      {/* Left: ring + summary */}
      <div className="phase-rail" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, flexShrink: 0, width: 200 }}>
        <SignalRing phase="blast_radius" active={isActive} />

        {summary && (
          <motion.div
            className="sidebar-stat-card"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              background: 'white',
              border: '1px solid #E5E5E3',
              borderRadius: 14,
              padding: '18px 20px',
              width: '100%',
            }}
          >
            <div style={{ fontSize: 10, color: '#9B9B9B', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
              Blast Radius
            </div>

            <div style={{
              fontSize: 22,
              fontWeight: 900,
              color: RISK_META[summary.tier]?.text || '#111111',
              letterSpacing: '-0.02em',
              marginBottom: 12,
            }}>
              {summary.tier}
            </div>

            {[
              { label: 'Affected files', value: summary.affected_files, color: '#c05010' },
              { label: 'External services', value: summary.external_services, color: '#7A0000' },
              { label: 'Total reach', value: summary.reach, color: '#111111' },
            ].map(item => (
              <div key={item.label} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '6px 0',
                borderBottom: '1px solid #F3F3F1',
              }}>
                <span style={{ fontSize: 11, color: '#6B6B6B' }}>{item.label}</span>
                <span style={{ fontSize: 15, fontWeight: 800, color: item.color }}>{item.value}</span>
              </div>
            ))}

            {summary.description && (
              <div style={{ fontSize: 11, color: '#6B6B6B', marginTop: 10, lineHeight: 1.5 }}>
                {summary.description}
              </div>
            )}
          </motion.div>
        )}

        {/* Edge legend */}
        <div className="edge-legend-card" style={{
          background: 'white',
          border: '1px solid #E5E5E3',
          borderRadius: 10,
          padding: '12px 14px',
          width: '100%',
        }}>
          <div style={{ fontSize: 10, color: '#9B9B9B', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
            Edge types
          </div>
          {[ 
            { type: 'imports', color: '#3AC7D9', dash: false },
            { type: 'shared reference', color: '#F5A623', dash: true },
          ].map(({ type, color, dash }) => (
            <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
              <svg width="20" height="8">
                <line
                  x1="0" y1="4" x2="20" y2="4"
                  stroke={color}
                  strokeWidth="1.5"
                  strokeDasharray={dash ? '4 2' : undefined}
                />
              </svg>
              <span style={{ fontSize: 10, color: '#6B6B6B', fontFamily: 'Inter, sans-serif' }}>{type}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Right: React Flow graph */}
      <div className="graph-shell" style={{
        flex: 1,
        borderRadius: 14,
        overflow: 'hidden',
        border: '1px solid #E5E5E3',
        background: '#FAFAF9',
        boxShadow: '0 2px 16px rgba(0,0,0,0.05)',
      }}>
        {/* Graph header */}
        <div style={{
          padding: '14px 18px',
          borderBottom: '1px solid #E5E5E3',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          background: 'white',
        }}>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: '#111111', margin: 0 }}>
              Blast-Radius Mapper
            </h2>
            <p style={{ fontSize: 11, color: '#9B9B9B', margin: 0, marginTop: 2 }}>
              {nodes.length} nodes, {edges.length} edges
            </p>
          </div>

          <div style={{ flex: 1 }} />

          {/* Risk legend */}
          <div style={{ display: 'flex', gap: 10 }}>
            {(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const).map(r => (
              <div key={r} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{
                  width: 7, height: 7, borderRadius: '50%',
                  background: RISK_META[r].dot,
                  boxShadow: `0 0 4px ${RISK_META[r].dot}80`,
                }} />
                <span style={{ fontSize: 9.5, color: '#6B6B6B', fontWeight: 500 }}>{r}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ minHeight: selectedEvidence ? 104 : 0, borderBottom: selectedEvidence ? '1px solid #E5E5E3' : 'none', background: '#FCFCFB' }}>
          {selectedEvidence && (
            <div style={{ padding: '10px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                <strong style={{ fontSize: 10, letterSpacing: '0.08em', color: '#555', textTransform: 'uppercase' }}>Live evidence</strong>
                <span style={{ fontSize: 11, color: '#6B6B6B' }}>{selectedEvidence.description}</span>
              </div>
              {evidenceError && <div style={{ color: '#C0392B', fontSize: 11 }}>{evidenceError}</div>}
              {sourceContext.map(context => (
                <pre key={`${context.file}:${context.line}`} style={{ margin: '6px 0 0', padding: '7px 10px', overflowX: 'auto', borderRadius: 6, background: '#111', color: '#D8E8DF', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, lineHeight: 1.55 }}>
                  {context.context.map((entry: any) => `${entry.highlight ? '›' : ' '} ${String(entry.line).padStart(3, ' ')}  ${entry.text}`).join('\n')}
                </pre>
              ))}
            </div>
          )}
        </div>

        {/* The graph */}
        <div style={{ height: 480 }}>
            {nodes.length > 0 ? (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onEdgeClick={(_, edge) => showEvidence(edge.data?.evidence)}
              onNodeClick={(_, node) => {
                const evidence = (node.data as any).evidence?.[0]
                if (evidence) showEvidence({ file: evidence.file, line: evidence.line, match: evidence.match, description: `${evidence.file}:${evidence.line} is a verified graph node (${evidence.match}).` })
              }}
              nodeTypes={nodeTypes}
              fitView
              fitViewOptions={{ padding: 0.15, maxZoom: 1.2 }}
              proOptions={{ hideAttribution: true }}
              minZoom={0.3}
              maxZoom={2}
            >
              <Background
                gap={24}
                size={1}
                color="#EBEBEB"
              />
              <Controls
                style={{
                  border: '1px solid #E5E5E3',
                  borderRadius: 8,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                }}
                showInteractive={false}
              />
            </ReactFlow>
          ) : (
            <div className="agent-loading" style={{ height: '100%' }}>
              <AgentSpinner color="#F5A623" />
              <div style={{ fontSize: 13, fontFamily: "'JetBrains Mono', monospace" }}>
                Mapping dependency graph...
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .react-flow__node { cursor: pointer !important; }
        .react-flow__controls-button { border: 1px solid #E5E5E3 !important; background: white !important; }
        .react-flow__controls-button:hover { background: #F5F5F5 !important; }
        .react-flow__edge { cursor: pointer; }
      `}</style>
    </div>
  )
}
