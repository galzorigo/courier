import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Dev only, exactly how a real app would load it.
if (import.meta.env.DEV) {
  import('@galzorigo/courier').then((c) => c.mount())
}
