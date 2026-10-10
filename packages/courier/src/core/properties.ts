// The property table. Plain lookups, no inference: every property Courier can
// edit is listed here with its category, label and control.

export type Category =
  | 'Layout'
  | 'Size'
  | 'Spacing'
  | 'Shape'
  | 'Fill'
  | 'Border'
  | 'Text'
  | 'Icon'
  | 'Other'

export const CATEGORIES: Category[] = [
  'Layout',
  'Size',
  'Spacing',
  'Shape',
  'Fill',
  'Border',
  'Text',
  'Icon',
]

const SIDES = ['top', 'right', 'bottom', 'left'] as const
const CORNERS = ['top-left', 'top-right', 'bottom-right', 'bottom-left'] as const

const sides = (prefix: string, suffix = '') => SIDES.map((s) => `${prefix}-${s}${suffix}`)
const corners = () => CORNERS.map((c) => `border-${c}-radius`)

const table: Record<string, Category> = {}
function put(category: Category, properties: string[]) {
  for (const p of properties) table[p] = category
}

put('Layout', [
  'display',
  'flex-direction',
  'flex-wrap',
  'align-items',
  'justify-content',
  'gap',
  'row-gap',
  'column-gap',
])
// flex-grow, flex-basis and align-self are how Fill works inside flex parents.
put('Size', ['width', 'height', 'min-width', 'max-width', 'min-height', 'max-height', 'flex-grow', 'flex-basis', 'align-self'])
put('Spacing', [
  'padding',
  'padding-inline',
  'padding-block',
  ...sides('padding'),
  'margin',
  'margin-inline',
  'margin-block',
  ...sides('margin'),
])
put('Shape', ['border-radius', ...corners()])
put('Fill', ['background-color', 'opacity'])
put('Border', [
  'border-width',
  'border-style',
  'border-color',
  ...sides('border', '-width'),
  ...sides('border', '-style'),
  ...sides('border', '-color'),
])
put('Text', [
  'color',
  'font-family',
  'font-size',
  'font-weight',
  'line-height',
  'letter-spacing',
  'text-align',
  'text-transform',
])

export const PROPERTY_CATEGORY: Readonly<Record<string, Category>> = table

/** Property to category, with an "Other" fallback for anything not in the table. */
export function categorize(property: string): Category {
  return table[property] ?? 'Other'
}

// Properties edited on an icon inside the selected element. The category of a
// change comes from its owner here, not from the table.
export const ICON_PROPERTIES = ['width', 'height', 'color', 'stroke-width']

// Shorthands Courier reads through one representative longhand.
export const READ_THROUGH: Readonly<Record<string, string>> = {
  padding: 'padding-top',
  'padding-inline': 'padding-left',
  'padding-block': 'padding-top',
  margin: 'margin-top',
  'margin-inline': 'margin-left',
  'margin-block': 'margin-top',
  'border-width': 'border-top-width',
  'border-style': 'border-top-style',
  'border-color': 'border-top-color',
  'border-radius': 'border-top-left-radius',
  gap: 'column-gap',
}

export interface SideGroup {
  all: string
  inline?: string
  block?: string
  /** top, right, bottom, left (or the four corners for radius) */
  sides: string[]
}

export const GROUPS: Readonly<Record<string, SideGroup>> = {
  padding: {
    all: 'padding',
    inline: 'padding-inline',
    block: 'padding-block',
    sides: sides('padding'),
  },
  margin: { all: 'margin', inline: 'margin-inline', block: 'margin-block', sides: sides('margin') },
  'border-width': { all: 'border-width', sides: sides('border', '-width') },
  'border-style': { all: 'border-style', sides: sides('border', '-style') },
  'border-color': { all: 'border-color', sides: sides('border', '-color') },
  'border-radius': { all: 'border-radius', sides: corners() },
}

/** Collapse a side group to the fewest properties that describe it exactly. */
export function collapseGroup(group: SideGroup, read: (p: string) => string): string[] {
  const [t, r, b, l] = group.sides.map(read)
  if (t === r && r === b && b === l) return [group.all]
  if (group.inline && group.block && t === b && l === r) return [group.inline, group.block]
  return group.sides
}

// Controls

export interface Option {
  value: string
  label: string
  /** icon name from ui/icons */
  icon?: string
  disabled?: boolean
}

export type ControlSpec =
  | { kind: 'segmented'; options: Option[] }
  | { kind: 'select'; options: string[] }
  | { kind: 'length'; units: string[]; keywords?: string[]; min?: number }
  | { kind: 'number'; step: number; min?: number; max?: number }
  | { kind: 'color' }
  | { kind: 'text' }

const box = ['px', 'rem', 'em', '%']
const length = (units: string[], keywords?: string[], min?: number): ControlSpec => ({
  kind: 'length',
  units,
  keywords,
  min,
})

export interface PropertySpec {
  label: string
  control: ControlSpec
}

const specs: Record<string, PropertySpec> = {
  display: {
    label: 'Display',
    control: {
      kind: 'select',
      options: [
        'block',
        'inline',
        'inline-block',
        'flex',
        'inline-flex',
        'grid',
        'inline-grid',
        'contents',
        'none',
      ],
    },
  },
  // flex-direction and align-items have custom controls in the Layout panel.
  'flex-direction': {
    label: 'Direction',
    control: {
      kind: 'segmented',
      options: [
        { value: 'row', label: 'Row' },
        { value: 'column', label: 'Column' },
      ],
    },
  },
  'flex-wrap': {
    label: 'Wrap',
    control: {
      kind: 'segmented',
      options: [
        { value: 'nowrap', label: 'No wrap' },
        { value: 'wrap', label: 'Wrap' },
      ],
    },
  },
  'align-items': {
    label: 'Align items',
    control: {
      kind: 'segmented',
      options: [
        { value: 'flex-start', label: 'Start', icon: 'align-start' },
        { value: 'center', label: 'Center', icon: 'align-center' },
        { value: 'flex-end', label: 'End', icon: 'align-end' },
        { value: 'stretch', label: 'Stretch', icon: 'align-stretch' },
      ],
    },
  },
  'justify-content': {
    label: 'Justify content',
    control: {
      kind: 'select',
      options: ['flex-start', 'center', 'flex-end', 'space-between', 'space-around', 'space-evenly'],
    },
  },
  gap: { label: 'Gap', control: length(box, ['normal'], 0) },
  'row-gap': { label: 'Row gap', control: length(box, ['normal'], 0) },
  'column-gap': { label: 'Column gap', control: length(box, ['normal'], 0) },

  width: {
    label: 'Width',
    control: length(
      ['px', '%', 'rem', 'em', 'vw'],
      ['auto', 'fit-content', 'min-content', 'max-content'],
      0,
    ),
  },
  height: {
    label: 'Height',
    control: length(
      ['px', '%', 'rem', 'em', 'vh'],
      ['auto', 'fit-content', 'min-content', 'max-content'],
      0,
    ),
  },
  'min-width': { label: 'Min width', control: length(['px', '%', 'rem', 'em'], ['auto'], 0) },
  'max-width': { label: 'Max width', control: length(['px', '%', 'rem', 'em'], ['none'], 0) },
  'min-height': { label: 'Min height', control: length(['px', '%', 'rem', 'em'], ['auto'], 0) },
  'max-height': { label: 'Max height', control: length(['px', '%', 'rem', 'em'], ['none'], 0) },

  'flex-grow': { label: 'Grow', control: { kind: 'number', step: 1, min: 0 } },
  'flex-basis': { label: 'Basis', control: length(['px', '%'], ['auto'], 0) },
  'align-self': {
    label: 'Align self',
    control: { kind: 'select', options: ['auto', 'flex-start', 'center', 'flex-end', 'stretch'] },
  },

  'background-color': { label: 'Background', control: { kind: 'color' } },
  opacity: { label: 'Opacity', control: { kind: 'number', step: 0.05, min: 0, max: 1 } },

  'border-style': {
    label: 'Style',
    control: { kind: 'select', options: ['none', 'solid', 'dashed', 'dotted', 'double'] },
  },

  color: { label: 'Color', control: { kind: 'color' } },
  'font-family': { label: 'Font', control: { kind: 'text' } },
  'font-size': { label: 'Size', control: length(box, [], 0) },
  'font-weight': {
    label: 'Weight',
    control: {
      kind: 'select',
      options: ['100', '200', '300', '400', '500', '600', '700', '800', '900'],
    },
  },
  'line-height': { label: 'Line height', control: length(['', 'px', 'em', '%'], ['normal'], 0) },
  'letter-spacing': { label: 'Letter spacing', control: length(['px', 'em', 'rem'], ['normal']) },
  'text-align': {
    label: 'Align',
    control: {
      kind: 'segmented',
      options: [
        { value: 'left', label: 'Left', icon: 'text-left' },
        { value: 'center', label: 'Center', icon: 'text-center' },
        { value: 'right', label: 'Right', icon: 'text-right' },
        { value: 'justify', label: 'Justify', icon: 'text-justify' },
      ],
    },
  },
  'text-transform': {
    label: 'Case',
    control: {
      kind: 'segmented',
      options: [
        { value: 'none', label: 'None' },
        { value: 'uppercase', label: 'AA' },
        { value: 'lowercase', label: 'aa' },
        { value: 'capitalize', label: 'Aa' },
      ],
    },
  },
  'stroke-width': { label: 'Stroke', control: length(['px'], [], 0) },
}

// Side groups share a control and get positional labels.
const sideLabels = ['Top', 'Right', 'Bottom', 'Left']
const cornerLabels = ['Top left', 'Top right', 'Bottom right', 'Bottom left']
for (const name of ['padding', 'margin'] as const) {
  const control =
    name === 'margin' ? length(box, ['auto']) : length(box, [], 0)
  const g = GROUPS[name]
  specs[g.all] = { label: 'All sides', control }
  specs[g.inline!] = { label: 'Horizontal', control }
  specs[g.block!] = { label: 'Vertical', control }
  g.sides.forEach((p, i) => (specs[p] = { label: sideLabels[i], control }))
}
{
  const control = length(['px', 'rem', 'em'], [], 0)
  specs['border-width'] = { label: 'Width', control }
  GROUPS['border-width'].sides.forEach((p, i) => (specs[p] = { label: `${sideLabels[i]} width`, control }))
  GROUPS['border-style'].sides.forEach(
    (p, i) => (specs[p] = { label: `${sideLabels[i]} style`, control: specs['border-style'].control }),
  )
  specs['border-color'] = { label: 'Color', control: { kind: 'color' } }
  GROUPS['border-color'].sides.forEach(
    (p, i) => (specs[p] = { label: `${sideLabels[i]} color`, control: { kind: 'color' } }),
  )
  const radius = length(['px', 'rem', 'em', '%'], [], 0)
  specs['border-radius'] = { label: 'Radius', control: radius }
  GROUPS['border-radius'].sides.forEach((p, i) => (specs[p] = { label: cornerLabels[i], control: radius }))
}

export const PROPERTY_SPECS: Readonly<Record<string, PropertySpec>> = specs

export function specFor(property: string): PropertySpec {
  return specs[property] ?? { label: property, control: { kind: 'text' } }
}
