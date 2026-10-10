import type { JSX } from 'preact'

type P = { size?: number; style?: JSX.CSSProperties }

const Svg = ({ size = 16, style, children }: P & { children: JSX.Element | (JSX.Element | null)[] }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    style={style}
    aria-hidden="true"
  >
    {children}
  </svg>
)

export const Wand = (p: P) => (
  <Svg {...p}>
    <path d="M3 13 10.5 5.5" />
    <path d="m9 4 3 3" />
    <path d="M12.5 1.5v2M11.5 2.5h2M4 3v1.5M3.25 3.75h1.5M13 10v1.5M12.25 10.75h1.5" />
  </Svg>
)
// Inspect: a solid pencil, so it reads as the primary tool.
export const PencilFill = ({ size = 16, style }: P) => (
  <svg width={size} height={size} viewBox="0 0 16 16" style={style} aria-hidden="true">
    <path
      fill="currentColor"
      d="M11.06 1.94a1.75 1.75 0 0 1 2.47 0l.53.53a1.75 1.75 0 0 1 0 2.47l-1.1 1.1-3-3 1.1-1.1ZM8.9 4.1l3 3-6.4 6.4a1.5 1.5 0 0 1-.7.4l-2.87.72a.5.5 0 0 1-.6-.6l.71-2.88a1.5 1.5 0 0 1 .4-.7L8.9 4.1Z"
    />
  </svg>
)

export const Eye = (p: P) => (
  <Svg {...p}>
    <path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8s-2.4 4.5-6.5 4.5S1.5 8 1.5 8Z" />
    <circle cx="8" cy="8" r="2" />
  </Svg>
)
export const EyeOff = (p: P) => (
  <Svg {...p}>
    <path d="M6.2 3.8A6.6 6.6 0 0 1 8 3.5C12.1 3.5 14.5 8 14.5 8a11 11 0 0 1-1.7 2.2M10.1 10.4A2 2 0 0 1 6.9 7.6M4.4 4.6A10.6 10.6 0 0 0 1.5 8s2.4 4.5 6.5 4.5c1 0 1.9-.3 2.7-.7" />
    <path d="m2 2 12 12" />
  </Svg>
)

export const Trash = (p: P) => (
  <Svg {...p}>
    <path d="M2.5 4.5h11M6.5 4.5V3.25c0-.4.35-.75.75-.75h1.5c.4 0 .75.35.75.75V4.5" />
    <path d="M3.75 4.5l.6 8.1c.07.8.73 1.4 1.53 1.4h4.24c.8 0 1.46-.6 1.53-1.4l.6-8.1" />
  </Svg>
)

export const Cursor = (p: P) => (
  <Svg {...p}>
    <path d="M3 2.5 12.5 7 8.25 8.25 7 12.5Z" />
  </Svg>
)
export const Copy = (p: P) => (
  <Svg {...p}>
    <rect x="5.5" y="5.5" width="8" height="8" rx="1.75" />
    <path d="M10.5 3.5V3.25A1.75 1.75 0 0 0 8.75 1.5h-5.5A1.75 1.75 0 0 0 1.5 3.25v5.5A1.75 1.75 0 0 0 3.25 10.5h.25" />
  </Svg>
)
export const Check = (p: P) => (
  <Svg {...p}>
    <path d="m3.5 8.5 3 3 6-7" />
  </Svg>
)
export const Close = (p: P) => (
  <Svg {...p}>
    <path d="m4 4 8 8M12 4l-8 8" />
  </Svg>
)
export const Undo = (p: P) => (
  <Svg {...p}>
    <path d="M5.5 3 2.5 6l3 3" />
    <path d="M2.5 6h7a4 4 0 0 1 0 8H7" />
  </Svg>
)
export const Redo = (p: P) => (
  <Svg {...p}>
    <path d="m10.5 3 3 3-3 3" />
    <path d="M13.5 6h-7a4 4 0 0 0 0 8H9" />
  </Svg>
)
export const Reset = (p: P) => (
  <Svg size={12} {...p}>
    <path d="M2.5 8a5.5 5.5 0 1 0 1.6-3.9" />
    <path d="M2.5 2.5v3h3" />
  </Svg>
)
export const Chevron = (p: P) => (
  <Svg size={10} {...p}>
    <path d="m4 6 4 4 4-4" />
  </Svg>
)
export const ChevronUp = (p: P) => (
  <Svg size={10} {...p}>
    <path d="m4 10 4-4 4 4" />
  </Svg>
)

// Small glyphs used as field prefixes and toggles, drawn on a 16 grid.
const GLYPHS: Record<string, JSX.Element | JSX.Element[]> = {
  swap: <path d="M2.5 5.5h10l-2.5-2.5M13.5 10.5h-10l2.5 2.5" />,
  plus: <path d="M8 3.5v9M3.5 8h9" />,
  parent: [<path key="a" d="M8 12.5v-9M4.5 7 8 3.5 11.5 7" />],
  minus: <path d="M3.5 8h9" />,
  'arrow-right': <path d="M2.5 8h11M10 4.5 13.5 8 10 11.5" />,
  'arrow-down': <path d="M8 2.5v11M4.5 10 8 13.5 11.5 10" />,
  'gap-inside': [<rect key="a" x="2" y="3" width="12" height="10" rx="2" />, <path key="b" d="M6 6v4M10 6v4" />],
  'gap-between': [<rect key="a" x="1.5" y="4" width="4.5" height="8" rx="1" />, <rect key="b" x="10" y="4" width="4.5" height="8" rx="1" />, <path key="c" d="M7.5 8h1" />],
  'gap-x': [<path key="a" d="M3 3v10M13 3v10" />, <path key="b" d="M6 8h4" />],
  'gap-y': [<path key="a" d="M3 3h10M3 13h10" />, <path key="b" d="M8 6v4" />],
  'pad-x': [<rect key="a" x="5.5" y="3" width="5" height="10" rx="1" />, <path key="b" d="M2 3v10M14 3v10" />],
  'pad-y': [<rect key="a" x="3" y="5.5" width="10" height="5" rx="1" />, <path key="b" d="M3 2h10M3 14h10" />],
  'side-all': <rect x="3" y="3" width="10" height="10" rx="1.5" />,
  'side-top': [<rect key="a" x="3" y="3" width="10" height="10" rx="1.5" opacity="0.35" />, <path key="b" d="M3 3h10" stroke-width="2" />],
  'side-right': [<rect key="a" x="3" y="3" width="10" height="10" rx="1.5" opacity="0.35" />, <path key="b" d="M13 3v10" stroke-width="2" />],
  'side-bottom': [<rect key="a" x="3" y="3" width="10" height="10" rx="1.5" opacity="0.35" />, <path key="b" d="M3 13h10" stroke-width="2" />],
  'side-left': [<rect key="a" x="3" y="3" width="10" height="10" rx="1.5" opacity="0.35" />, <path key="b" d="M3 3v10" stroke-width="2" />],
  'corner-tl': <path d="M3 13V7a4 4 0 0 1 4-4h6" />,
  'corner-tr': <path d="M3 3h6a4 4 0 0 1 4 4v6" />,
  'corner-br': <path d="M13 3v6a4 4 0 0 1-4 4H3" />,
  'corner-bl': <path d="M13 13H7a4 4 0 0 1-4-4V3" />,
  sides: [<path key="a" d="M3 5.5V3h2.5M10.5 3H13v2.5M13 10.5V13h-2.5M5.5 13H3v-2.5" />],
  corners: [<path key="a" d="M3 6.5V5a2 2 0 0 1 2-2h1.5M9.5 3H11a2 2 0 0 1 2 2v1.5M13 9.5V11a2 2 0 0 1-2 2H9.5M6.5 13H5a2 2 0 0 1-2-2V9.5" />],
  opacity: [<circle key="a" cx="8" cy="8" r="5.5" />, <path key="b" d="M8 2.5v11" />, <path key="c" d="M8 2.5a5.5 5.5 0 0 1 0 11Z" fill="currentColor" stroke="none" />],
  'font-size': [<path key="a" d="M2.5 13 6 3.5 9.5 13M3.75 10h4.5" />, <path key="b" d="M11 13V8.5M9.5 8.5h3" />],
  'line-height': [<path key="a" d="M2.5 2.5h11M2.5 13.5h11" />, <path key="b" d="M5.5 11 8 5l2.5 6M6.4 9h3.2" />],
  'letter-spacing': [<path key="a" d="M2.5 3v10M13.5 3v10" />, <path key="b" d="M5.5 11 8 5l2.5 6M6.4 9h3.2" />],
  stroke: [<path key="a" d="M2.5 4.5h11" stroke-width="1" />, <path key="b" d="M2.5 8h11" stroke-width="1.75" />, <path key="c" d="M2.5 11.5h11" stroke-width="2.5" />],
}

export const Glyph = ({ name, ...p }: P & { name: string }) => {
  const g = GLYPHS[name]
  return <Svg size={14} {...p}>{Array.isArray(g) ? g : [g]}</Svg>
}

// Align items, drawn for a row: the cross axis is vertical. Rotated for columns.
const Bars = ({ y1, h1, y2, h2, guide }: { y1: number; h1: number; y2: number; h2: number; guide?: number }) => (
  <Svg>
    {guide !== undefined ? <path d={`M2 ${guide}h12`} stroke-width="1" opacity="0.5" /> : null}
    <rect x="4" y={y1} width="3" height={h1} rx="1" fill="currentColor" stroke="none" />
    <rect x="9" y={y2} width="3" height={h2} rx="1" fill="currentColor" stroke="none" />
  </Svg>
)

const TextLines = ({ widths, align }: { widths: number[]; align: 'left' | 'center' | 'right' | 'justify' }) => (
  <Svg>
    {widths.map((w, i) => {
      const x = align === 'left' || align === 'justify' ? 2.5 : align === 'right' ? 13.5 - w : 8 - w / 2
      return <path key={i} d={`M${x} ${4 + i * 4}h${align === 'justify' ? 11 : w}`} />
    })}
  </Svg>
)

export const ICONS: Record<string, () => JSX.Element> = {
  'align-start': () => <Bars guide={2} y1={3} h1={8} y2={3} h2={5} />,
  'align-center': () => <Bars guide={8} y1={4} h1={8} y2={5.5} h2={5} />,
  'align-end': () => <Bars guide={14} y1={5} h1={8} y2={8} h2={5} />,
  'align-stretch': () => <Bars y1={2.5} h1={11} y2={2.5} h2={11} />,
  'text-left': () => <TextLines widths={[11, 7, 9]} align="left" />,
  'text-center': () => <TextLines widths={[11, 7, 9]} align="center" />,
  'text-right': () => <TextLines widths={[11, 7, 9]} align="right" />,
  'text-justify': () => <TextLines widths={[11, 11, 11]} align="justify" />,
  'arrow-right': () => <Glyph name="arrow-right" />,
  'arrow-down': () => <Glyph name="arrow-down" />,
}
