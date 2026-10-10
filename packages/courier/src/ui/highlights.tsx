import { useEffect, useState } from 'preact/hooks'
import { shortName } from '../core'

/** Re-render every frame while mounted, so outlines follow scroll, resize and edits. */
export function useFrame() {
  const [, setTick] = useState(0)
  useEffect(() => {
    let id = requestAnimationFrame(function loop() {
      setTick((t) => (t + 1) % 1e6)
      id = requestAnimationFrame(loop)
    })
    return () => cancelAnimationFrame(id)
  }, [])
}

function Box({ el, kind, label }: { el: Element; kind: string; label?: string }) {
  if (!el.isConnected) return null
  const r = el.getBoundingClientRect()
  const radius = getComputedStyle(el).borderRadius
  // Outset by the border width so the outline hugs the element from outside.
  const out = kind === 'selected' ? 2 : 1.5
  return (
    <div
      class={`hl hl-${kind}`}
      data-hl={kind}
      style={{
        left: r.left - out,
        top: r.top - out,
        width: r.width + out * 2,
        height: r.height + out * 2,
        borderRadius: radius === '0px' ? 3 : `calc(${radius} + ${out}px)`,
      }}
    >
      {label && <span class={`hl-label${r.top < 28 ? ' below' : ''}`}>{label}</span>}
    </div>
  )
}

export function Highlights({
  hovered,
  selected,
  matches,
}: {
  hovered: Element | null
  selected: Element | null
  matches: Element[]
}) {
  useFrame()
  const size = (el: Element) => {
    const r = el.getBoundingClientRect()
    return `${Math.round(r.width)}×${Math.round(r.height)}`
  }
  return (
    <>
      {matches.filter((m) => m !== selected).map((m, i) => <Box key={i} el={m} kind="match" />)}
      {selected && <Box el={selected} kind="selected" />}
      {hovered && hovered !== selected && (
        <Box el={hovered} kind="hover" label={`${shortName(hovered)}  ${size(hovered)}`} />
      )}
    </>
  )
}
