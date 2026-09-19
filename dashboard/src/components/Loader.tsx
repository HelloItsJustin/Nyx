// Initial loader screen - a cleanup-safe typewriter intro that also works in React Strict Mode.

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import SignalRing from './SignalRing'
import { useNyxStore } from '../store/nyxStore'

const TYPED_TEXT = 'Initializing Nyx...'

export default function Loader() {
  const [displayed, setDisplayed] = useState('')
  const [isLeaving, setIsLeaving] = useState(false)
  const setScreen = useNyxStore(s => s.setScreen)

  useEffect(() => {
    let i = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    let leaveTimer: ReturnType<typeof setTimeout> | undefined
    let screenTimer: ReturnType<typeof setTimeout> | undefined
    let cancelled = false

    const typeNextCharacter = () => {
      if (cancelled) return
      i += 1
      setDisplayed(TYPED_TEXT.slice(0, i))

      if (i < TYPED_TEXT.length) {
        timer = setTimeout(typeNextCharacter, 58)
        return
      }

      leaveTimer = setTimeout(() => {
        if (!cancelled) setIsLeaving(true)
      }, 650)
      screenTimer = setTimeout(() => {
        if (!cancelled) setScreen('landing')
      }, 1050)
    }

    timer = setTimeout(typeNextCharacter, 280)
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      if (leaveTimer) clearTimeout(leaveTimer)
      if (screenTimer) clearTimeout(screenTimer)
    }
  }, [])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: isLeaving ? 0 : 1 }}
      transition={{ duration: 0.4 }}
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#FAFAF9',
        zIndex: 200,
        gap: 48,
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      >
        <SignalRing phase="detection" size={160} active />
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3, duration: 0.4 }}
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 14,
          color: '#6B6B6B',
          letterSpacing: '0.04em',
          minHeight: 24,
        }}
      >
        {displayed}<span className="loader-caret" aria-hidden />
      </motion.div>
    </motion.div>
  )
}
