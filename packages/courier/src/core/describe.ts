// Identifying elements for the export: selector path, tag, text, component
// name, and a slot for source location.

export interface SourceLocation {
  file: string
  line: number
  column?: number
}

/**
 * Resolves an element to the file and line that renders it. v1 ships none;
 * framework specific resolvers (React dev source, Vue, Svelte meta) plug in
 * here later through `mount({ resolveSource })`.
 */
export type SourceResolver = (el: Element) => SourceLocation | null

export interface ElementDescription {
  /** The class attribute, when it holds utility classes (Tailwind). */
  classes: string | null
  tag: string
  /** tag plus classes, like `a.link-chip` */
  short: string
  selector: string
  text: string
  component: string | null
  source: SourceLocation | null
}

const ident = (s: string) => (typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(s) : s)

// Utility classes (Tailwind and friends) describe styles, not the element, so
// names and selectors skip them: "h1.mb-6.text-5xl.md:text-6xl" reads as "h1",
// "a.btn.w-full.bg-white" as "a.btn". The full class string still goes into
// the export, where it's the best handle for finding the element in source.
const UTILITY =
  /^-?(?:[mp][trblxyse]?|w|h|size|min-w|min-h|max-w|max-h|gap|gap-x|gap-y|space-x|space-y|inset|inset-x|inset-y|top|right|bottom|left|start|end|z|order|col|row|basis|grow|shrink|flex|grid|items|justify|content|self|place|text|font|leading|tracking|indent|align|whitespace|break|line-clamp|truncate|underline|decoration|uppercase|lowercase|capitalize|normal-case|italic|antialiased|subpixel-antialiased|bg|from|via|to|border|rounded|outline|ring|shadow|opacity|mix-blend|blur|brightness|contrast|grayscale|backdrop|drop-shadow|filter|transition|duration|ease|delay|animate|transform|translate|translate-x|translate-y|scale|rotate|skew|origin|cursor|select|pointer-events|resize|scroll|snap|touch|will-change|fill|stroke|sr-only|not-sr-only|object|overflow|overscroll|aspect|columns|box|float|clear|isolate|visible|invisible|collapse|static|fixed|absolute|relative|sticky|block|inline|inline-block|inline-flex|inline-grid|table|contents|hidden|list|appearance|accent|caret|divide|container|group|peer|aos|tabular-nums|ordinal|slashed-zero)(?:-|$)/

export function isUtilityClass(c: string): boolean {
  return /[:[\]/()!.%#@]/.test(c) || UTILITY.test(c)
}

// Classes that animation libraries toggle at runtime (AOS adds aos-animate as
// an element scrolls into view, animate.css adds animate__*). They say nothing
// about what the element is, so comparisons ignore them.
const RUNTIME_STATE = /^(?:aos-|animate__)/

/** The class list for comparing elements: sorted, without runtime state classes. */
export function classKey(el: Element): string {
  return [...el.classList].filter((c) => !RUNTIME_STATE.test(c)).sort().join(' ')
}

/** Classes that name the element (btn, link-chip), not its styling. */
export function semanticClasses(el: Element): string[] {
  return [...el.classList].filter((c) => !isUtilityClass(c))
}

export function shortName(el: Element): string {
  const tag = el.tagName.toLowerCase()
  if (el.id) return `${tag}#${ident(el.id)}`
  return tag + semanticClasses(el).slice(0, 3).map((c) => '.' + ident(c)).join('')
}

/** The raw class attribute when it carries utility classes, for finding the element in source. */
export function utilityClassString(el: Element): string | null {
  const all = [...el.classList]
  if (!all.some(isUtilityClass)) return null
  const text = all.join(' ')
  return text.length > 160 ? text.slice(0, 159) + '…' : text
}

/**
 * The shortest readable selector that finds only this element: steps are
 * added from the element upward until it's unique (or an id is reached).
 * Positions use :nth-of-type, and only where siblings would be ambiguous.
 */
export function selectorPath(el: Element): string {
  const parts: string[] = []
  let node: Element | null = el
  while (node && node !== document.body && node !== document.documentElement) {
    let part = shortName(node)
    if (node.id) {
      parts.unshift(part)
      break
    }
    const parent: Element | null = node.parentElement
    if (parent) {
      const sameTag = [...parent.children].filter((c) => c.tagName === node!.tagName)
      if (sameTag.filter((c) => shortName(c) === part).length > 1) part += `:nth-of-type(${sameTag.indexOf(node) + 1})`
    }
    parts.unshift(part)
    try {
      if (el.ownerDocument.querySelectorAll(parts.join(' > ')).length === 1) break
    } catch {
      // keep climbing
    }
    node = parent
  }
  return parts.join(' > ')
}

// Framework plumbing that sits between your components and the DOM.
const INTERNAL_COMPONENTS = new Set([
  'SegmentViewNode', 'SegmentStateProvider', 'SegmentViewStateNode', 'SegmentBoundaryTriggerNode',
  'LayoutRouterContext', 'InnerLayoutRouter', 'OuterLayoutRouter', 'RenderFromTemplateContext', 'TemplateContext',
  'RedirectBoundary', 'RedirectErrorBoundary', 'HTTPAccessFallbackBoundary', 'HTTPAccessFallbackErrorBoundary',
  'LoadingBoundary', 'ErrorBoundary', 'ErrorBoundaryHandler', 'GlobalError', 'InnerScrollAndFocusHandler',
  'ScrollAndFocusHandler', 'ClientSegmentRoot', 'ClientPageRoot', 'AppRouter', 'Router', 'HotReload', 'ServerRoot',
  'Root', 'MetadataBoundary', 'ViewportBoundary', 'OutletBoundary', 'DevRootHTTPAccessFallbackBoundary',
  'ReactDevOverlay', 'StrictMode', 'Suspense', 'Fragment',
])

export function visibleText(el: Element, max = 40): string {
  const text = ((el as HTMLElement).innerText ?? el.textContent ?? '').replace(/\s+/g, ' ').trim()
  return text.length > max ? text.slice(0, max - 1) + '…' : text
}

/** Nearest framework component name, when the page exposes one in dev. */
export function componentName(el: Element): string | null {
  const anyEl = el as unknown as Record<string, unknown>
  // React: walk up to the nearest component. React 19 in development also
  // records Server Components (which never exist in the browser) in
  // _debugInfo, innermost last: that's how a Next.js page section is named.
  const fiberKey = Object.keys(anyEl).find((k) => k.startsWith('__reactFiber$'))
  if (fiberKey) {
    type Fiber = { type?: unknown; return?: Fiber | null; _debugInfo?: { name?: string; env?: string }[] }
    let fiber = anyEl[fiberKey] as Fiber | null
    while (fiber) {
      const server = fiber._debugInfo?.filter((d) => d?.name && !INTERNAL_COMPONENTS.has(d.name)).pop()
      if (server?.name) return server.env === 'Server' ? `${server.name} (server component)` : server.name
      const type = fiber.type as { displayName?: string; name?: string } | string | undefined
      if (typeof type === 'function' || (type && typeof type === 'object')) {
        const name = (type as { displayName?: string; name?: string }).displayName ?? (type as { name?: string }).name
        if (name && !INTERNAL_COMPONENTS.has(name)) return name
      }
      fiber = fiber.return ?? null
    }
  }
  // Vue 3
  const vue = anyEl.__vueParentComponent as { type?: { name?: string; __name?: string } } | undefined
  if (vue?.type) return vue.type.name ?? vue.type.__name ?? null
  return null
}

export function describe(el: Element, resolveSource?: SourceResolver): ElementDescription {
  return {
    classes: utilityClassString(el),
    tag: el.tagName.toLowerCase(),
    short: shortName(el),
    selector: selectorPath(el),
    text: visibleText(el),
    component: componentName(el),
    source: resolveSource?.(el) ?? null,
  }
}
