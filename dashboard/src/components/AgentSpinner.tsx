// AgentSpinner - Self-contained spinner that injects its own keyframe.
// Uses a <style> tag so it works regardless of Tailwind preflight or CSS ordering.

const KEYFRAME = `@keyframes nyx-spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}`

let injected = false
function injectKeyframe() {
  if (injected || typeof document === 'undefined') return
  const s = document.createElement('style')
  s.textContent = KEYFRAME
  document.head.appendChild(s)
  injected = true
}

interface Props {
  color: string
  size?: number
}

export default function AgentSpinner({ color, size = 28 }: Props) {
  injectKeyframe()
  return (
    <div style={{
      width: size,
      height: size,
      borderRadius: '50%',
      border: `2.5px solid ${color}22`,
      borderTopColor: color,
      borderRightColor: color,
      animation: 'nyx-spin 0.75s cubic-bezier(0.4, 0, 0.2, 1) infinite',
      flexShrink: 0,
    }} />
  )
}
