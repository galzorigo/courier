import { h, render } from 'preact'
import { ChangeStore, readStored, restoreInto, snapshot, writeStored, type SourceResolver } from './core'
import { App, type RestoreReport } from './ui/App'
import { registerFont } from './ui/font'
import { css } from './ui/styles'

export type { SourceLocation, SourceResolver } from './core'

export interface CourierOptions {
  /** Maps an element to file:line. Not built in yet; the export leaves a slot for it. */
  resolveSource?: SourceResolver
}

let mounted: { unmount: () => void } | null = null

const RESTORE_MS = 5000

/**
 * Mount the overlay. Dev only: import it behind your bundler's dev flag, e.g.
 *
 *   if (import.meta.env.DEV) import('@galzorigo/courier').then((c) => c.mount())
 *
 * Returns a function that removes the overlay and reverts pending changes.
 */
export function mount(options: CourierOptions = {}): () => void {
  if (typeof window === 'undefined') return () => {}
  if (mounted) return mounted.unmount

  registerFont()
  const host = document.createElement('courier-overlay')
  const shadow = host.attachShadow({ mode: 'open' })
  const style = document.createElement('style')
  style.textContent = css
  const root = document.createElement('div')
  root.className = 'root'
  shadow.append(style, root)
  // Keys typed in our inputs stay out of the page's shortcut handlers.
  for (const type of ['keydown', 'keyup', 'keypress']) host.addEventListener(type, (e) => e.stopPropagation())
  document.documentElement.appendChild(host)

  const store = new ChangeStore()
  const report: RestoreReport = { result: null, listeners: new Set() }
  render(h(App, { store, host, resolveSource: options.resolveSource, report }), root)

  // Survive reloads: pending changes live in session storage for this tab.
  // Frameworks often render after Courier mounts, so elements that aren't on
  // the page yet are retried as the DOM fills in, for up to RESTORE_MS.
  let pending = readStored()
  const total = pending.length
  const persist = () => writeStored([...snapshot(store), ...pending])
  const unsubscribe = store.subscribe(persist)
  const attempt = () => {
    if (pending.length) pending = restoreInto(store, pending)
    return !pending.length
  }
  let observer: MutationObserver | undefined
  let timer: number | undefined
  const finish = () => {
    observer?.disconnect()
    clearTimeout(timer)
    const missing = pending.length
    pending = []
    if (missing) persist()
    if (total) {
      report.result = { restored: total - missing, missing }
      report.listeners.forEach((fn) => fn())
    }
  }
  if (attempt()) finish()
  else {
    observer = new MutationObserver(() => attempt() && finish())
    observer.observe(document.body, { childList: true, subtree: true })
    timer = window.setTimeout(finish, RESTORE_MS)
  }

  const unmount = () => {
    observer?.disconnect()
    clearTimeout(timer)
    unsubscribe()
    store.clear()
    render(null, root)
    host.remove()
    mounted = null
  }
  mounted = { unmount }
  return unmount
}
