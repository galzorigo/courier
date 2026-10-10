// A mockup landing page with one element for every Courier feature:
// link chips (parent gap, scope matching, icons), grid cards (grid gap),
// a feature list (sibling margins) and a nav (space between).

function ArrowUpRight() {
  return (
    // The path fills its box, so the icon carries no hidden padding.
    <svg className="arrow" width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 9 9 1M2.5 1H9v6.5" />
    </svg>
  )
}

function LinkChip({ label, href, featured }: { label: string; href: string; featured?: boolean }) {
  return (
    <a className={featured ? 'link-chip is-featured' : 'link-chip'} href={href} target="_blank" rel="noreferrer">
      <span>{label}</span>
      <ArrowUpRight />
    </a>
  )
}

function Nav() {
  return (
    <nav className="nav">
      <a className="logo" href="#">
        <span className="logo-mark" />
        Courier
      </a>
      <div className="nav-links">
        <a href="#how">How it works</a>
        <a href="#features">Features</a>
        <a href="#install">Install</a>
      </div>
      <a className="nav-cta" href="#install">
        Get started
      </a>
    </nav>
  )
}

function Hero() {
  return (
    <header className="hero">
      <p className="eyebrow">For local development</p>
      <h1>Tweak the real page. Hand your agent exact values.</h1>
      <p className="lede">
        Courier is a small overlay for your dev server. Pick an element, adjust it like you would in Figma, and copy a
        precise list of changes for your coding agent to apply.
      </p>
      <div className="links">
        <LinkChip label="X" href="https://x.com" />
        <LinkChip label="GitHub" href="https://github.com" />
        <LinkChip label="Mail" href="mailto:hello@example.com" />
        <LinkChip label="LinkedIn" href="https://linkedin.com" featured />
      </div>
    </header>
  )
}

const steps = [
  { n: '1', title: 'Inspect', body: 'Turn on inspect mode and click any element on your running site.' },
  { n: '2', title: 'Adjust', body: 'Change layout, spacing, color and type with real controls. Edits show up live.' },
  { n: '3', title: 'Copy', body: 'Copy a structured list of before and after values, ready to paste into your agent.' },
]

function Steps() {
  return (
    <section className="section" id="how">
      <h2>How it works</h2>
      <div className="steps">
        {steps.map((s) => (
          <article className="step-card" key={s.n}>
            <span className="step-number">{s.n}</span>
            <h3>{s.title}</h3>
            <p>{s.body}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

const features = [
  'Only shows the controls that apply to the element you picked',
  'Knows whether a gap comes from the parent or from margins',
  'Edit one element or every matching sibling at once',
  'Undo, redo and reset any single field',
  'Never touches your source files',
]

function Features() {
  return (
    <section className="section" id="features">
      <h2>What makes it precise</h2>
      <ul className="feature-list">
        {features.map((f) => (
          <li className="feature" key={f}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m3.5 8.5 3 3 6-7" />
            </svg>
            {f}
          </li>
        ))}
      </ul>
    </section>
  )
}

function Install() {
  return (
    <section className="section install" id="install">
      <h2>Install</h2>
      <pre className="code">
        <code>{`npm i -D @galzorigo/courier

if (import.meta.env.DEV) {
  import('@galzorigo/courier').then((c) => c.mount())
}`}</code>
      </pre>
    </section>
  )
}

export function App() {
  return (
    <div className="page">
      <Nav />
      <main>
        <Hero />
        <Steps />
        <Features />
        <Install />
      </main>
      <footer className="footer">Made for people who know exactly what they want.</footer>
    </div>
  )
}
