import type { JSX } from 'preact'
import {
  Add01Icon,
  AlignBottomIcon,
  AlignHorizontalSpaceAroundIcon,
  AlignHorizontalSpaceBetweenIcon,
  AlignTopIcon,
  AlignVerticalCenterIcon,
  AlignVerticalSpaceAroundIcon,
  ArrowDataTransferHorizontalIcon,
  ArrowDown01Icon,
  ArrowDown02Icon,
  ArrowExpand02Icon,
  ArrowRight02Icon,
  ArrowUp01Icon,
  ArrowUp02Icon,
  BlurIcon,
  BorderAll02Icon,
  BorderBottom02Icon,
  BorderLeft02Icon,
  BorderNone02Icon,
  BorderRight02Icon,
  BorderTop02Icon,
  Cancel01Icon,
  Copy01Icon,
  Cursor01Icon,
  Delete02Icon,
  EditMultipleIcon,
  LayoutTwoColumnIcon,
  LetterSpacingIcon,
  MagicWand01Icon,
  MinusSignIcon,
  MoveHorizontalIcon,
  MoveVerticalIcon,
  ParagraphSpacingIcon,
  Redo03Icon,
  SquareRoundCornerIcon,
  TextAlignCenterIcon,
  TextAlignJustifyLeftIcon,
  TextAlignLeftIcon,
  TextAlignRightIcon,
  TextFontIcon,
  Tick02Icon,
  TransparencyIcon,
  Undo03Icon,
  UndoIcon,
  ViewIcon,
  ViewOffSlashIcon,
} from '@hugeicons/core-free-icons'

type IconSvgObject = typeof Add01Icon

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

// HugeIcons stroke set, drawn on a 24 grid. The stroke is a touch heavier than
// HugeIcons' default so it holds up at the small sizes used in the panel.
const Huge = ({ icon, size = 16, style }: P & { icon: IconSvgObject }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={style} aria-hidden="true">
    {icon.map(([tag, { key, ...attrs }]) => {
      const Tag = tag as 'path'
      const props: Record<string, unknown> = {}
      for (const k in attrs) props[k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)] = attrs[k]
      if (props['stroke-width']) props['stroke-width'] = 2
      return <Tag key={key} {...props} />
    })}
  </svg>
)

export const Wand = (p: P) => <Huge icon={MagicWand01Icon} {...p} />
// Inspect: the primary tool.
export const PencilFill = (p: P) => <Huge icon={EditMultipleIcon} {...p} />
export const Eye = (p: P) => <Huge icon={ViewIcon} {...p} />
export const EyeOff = (p: P) => <Huge icon={ViewOffSlashIcon} {...p} />
export const Trash = (p: P) => <Huge icon={Delete02Icon} {...p} />
export const Cursor = (p: P) => <Huge icon={Cursor01Icon} {...p} />
export const Copy = (p: P) => <Huge icon={Copy01Icon} {...p} />
export const Check = (p: P) => <Huge icon={Tick02Icon} {...p} />
export const Close = (p: P) => <Huge icon={Cancel01Icon} {...p} />
export const Undo = (p: P) => <Huge icon={Undo03Icon} {...p} />
export const Redo = (p: P) => <Huge icon={Redo03Icon} {...p} />
export const Reset = (p: P) => <Huge icon={UndoIcon} size={12} {...p} />
export const Chevron = (p: P) => <Huge icon={ArrowDown01Icon} size={10} {...p} />
export const ChevronUp = (p: P) => <Huge icon={ArrowUp01Icon} size={10} {...p} />

// Small glyphs used as field prefixes and toggles, drawn on a 16 grid.
// Corner glyphs mirror SquareRoundCorner, which rounds the top right.
const CORNER_FLIP: Record<string, string> = {
  'corner-tl': 'scaleX(-1)',
  'corner-br': 'scaleY(-1)',
  'corner-bl': 'scale(-1, -1)',
}

// Field prefixes and toggles, from HugeIcons.
const HUGE_GLYPHS: Record<string, IconSvgObject> = {
  swap: ArrowDataTransferHorizontalIcon,
  plus: Add01Icon,
  parent: ArrowUp02Icon,
  child: ArrowDown02Icon,
  minus: MinusSignIcon,
  'arrow-right': ArrowRight02Icon,
  'arrow-down': ArrowDown02Icon,
  'gap-inside': LayoutTwoColumnIcon,
  'gap-between': AlignHorizontalSpaceBetweenIcon,
  'gap-x': MoveHorizontalIcon,
  'gap-y': MoveVerticalIcon,
  'pad-x': AlignHorizontalSpaceAroundIcon,
  'pad-y': AlignVerticalSpaceAroundIcon,
  'side-all': BorderAll02Icon,
  'side-top': BorderTop02Icon,
  'side-right': BorderRight02Icon,
  'side-bottom': BorderBottom02Icon,
  'side-left': BorderLeft02Icon,
  'corner-tl': SquareRoundCornerIcon,
  'corner-tr': SquareRoundCornerIcon,
  'corner-br': SquareRoundCornerIcon,
  'corner-bl': SquareRoundCornerIcon,
  sides: BorderNone02Icon,
  corners: SquareRoundCornerIcon,
  opacity: TransparencyIcon,
  'font-size': TextFontIcon,
  'line-height': ParagraphSpacingIcon,
  'letter-spacing': LetterSpacingIcon,
  blur: BlurIcon,
  spread: ArrowExpand02Icon,
}

// Glyphs HugeIcons has no match for, drawn on a 16 grid.
const GLYPHS: Record<string, JSX.Element | JSX.Element[]> = {
  stroke: [<path key="a" d="M2.5 4.5h11" stroke-width="1" />, <path key="b" d="M2.5 8h11" stroke-width="1.75" />, <path key="c" d="M2.5 11.5h11" stroke-width="2.5" />],
}

export const Glyph = ({ name, ...p }: P & { name: string }) => {
  const huge = HUGE_GLYPHS[name]
  if (huge) {
    const flip = CORNER_FLIP[name]
    return <Huge icon={huge} size={14} {...p} style={flip ? { transform: flip, ...p.style } : p.style} />
  }
  const g = GLYPHS[name]
  return <Svg size={14} {...p}>{Array.isArray(g) ? g : [g]}</Svg>
}

// Align stretch, which HugeIcons has no match for. Drawn for a row: the cross
// axis is vertical. Rotated for columns.
const Bars = ({ y1, h1, y2, h2 }: { y1: number; h1: number; y2: number; h2: number }) => (
  <Svg>
    <rect x="4" y={y1} width="3" height={h1} rx="1" fill="currentColor" stroke="none" />
    <rect x="9" y={y2} width="3" height={h2} rx="1" fill="currentColor" stroke="none" />
  </Svg>
)

export const ICONS: Record<string, () => JSX.Element> = {
  'align-start': () => <Huge icon={AlignTopIcon} />,
  'align-center': () => <Huge icon={AlignVerticalCenterIcon} />,
  'align-end': () => <Huge icon={AlignBottomIcon} />,
  'align-stretch': () => <Bars y1={2.5} h1={11} y2={2.5} h2={11} />,
  'text-left': () => <Huge icon={TextAlignLeftIcon} />,
  'text-center': () => <Huge icon={TextAlignCenterIcon} />,
  'text-right': () => <Huge icon={TextAlignRightIcon} />,
  'text-justify': () => <Huge icon={TextAlignJustifyLeftIcon} />,
  'arrow-right': () => <Glyph name="arrow-right" />,
  'arrow-down': () => <Glyph name="arrow-down" />,
}
