// TrustScore - persistent live ticker near top of viewport

import { motion } from 'framer-motion'
import { useNyxStore } from '../store/nyxStore'


export default function TrustScore() {
  const trustScore = useNyxStore(s => s.trustScore)

  return (
    <div className="trust-score-card">
      <div className="trust-score-row">
        <span className="trust-score-label">
          Trust Score
        </span>
        <motion.span
          key={trustScore}
          initial={{ y: -8, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="trust-score-value"
          style={{ color: trustScore >= 80 ? '#2ECC71' : trustScore >= 60 ? '#F5A623' : '#FF6B6B' }}
        >
          {trustScore}
        </motion.span>
        <span className="trust-score-total">/100</span>
      </div>

      {/* Progress bar */}
      <div className="trust-score-track">
        <motion.div
          className="trust-bar"
          animate={{ width: `${trustScore}%` }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
          style={{
            height: '100%',
            background: trustScore >= 80 ? '#2ECC71' : trustScore >= 60 ? '#F5A623' : '#FF6B6B',
            borderRadius: 2,
          }}
        />
      </div>
    </div>
  )
}
