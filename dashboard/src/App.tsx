// App.tsx - Root component with WebSocket management and screen routing

import { useEffect, useRef, useCallback } from 'react'
import { AnimatePresence } from 'framer-motion'
import { useNyxStore } from './store/nyxStore'
import Loader from './components/Loader'
import Landing from './components/Landing'
import NavBar from './components/NavBar'
import TrustScore from './components/TrustScore'
import ScanView from './components/ScanView'


export default function App() {
  const screen = useNyxStore(s => s.screen)
  const displayPhase = useNyxStore(s => s.displayPhase)
  const setWsConnected = useNyxStore(s => s.setWsConnected)
  const handleWsEvent = useNyxStore(s => s.handleWsEvent)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return
    
    try {
      // Derive WS URL from current page URL (works for both dev proxy and production)
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsUrl = `${protocol}//${window.location.hostname}:${window.location.port || '8000'}/ws`
      
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        setWsConnected(true)
        if (reconnectRef.current) {
          clearTimeout(reconnectRef.current)
          reconnectRef.current = null
        }
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          handleWsEvent(data)
        } catch {
          // Ignore malformed messages
        }
      }

      ws.onclose = () => {
        setWsConnected(false)
        wsRef.current = null
        // Silently reconnect after 2 seconds
        reconnectRef.current = setTimeout(connect, 2000)
      }

      ws.onerror = () => {
        ws.close()
      }
    } catch {
      // Try again shortly
      reconnectRef.current = setTimeout(connect, 3000)
    }
  }, [])

  useEffect(() => {
    // Small delay to let the backend start before first connect attempt
    const t = setTimeout(connect, 500)
    return () => {
      clearTimeout(t)
      if (reconnectRef.current) clearTimeout(reconnectRef.current)
      wsRef.current?.close()
    }
  }, [connect])

  return (
    <div className="app-shell" style={{ height: '100vh', overflow: 'hidden', background: '#FAFAF9' }}>
      <AnimatePresence mode="wait">
        {screen === 'loader' && <Loader key="loader" />}
      </AnimatePresence>

      {screen !== 'loader' && (
        <>
          <NavBar />
          {(screen === 'scan' || displayPhase !== 'idle') && <TrustScore />}

          <AnimatePresence mode="wait">
            {screen === 'landing' && <Landing key="landing" />}
            {screen === 'scan' && <ScanView key="scan" />}
          </AnimatePresence>
        </>
      )}
    </div>
  )
}
