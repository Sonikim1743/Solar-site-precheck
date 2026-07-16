import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'leaflet/dist/leaflet.css'
import './styles.css'
import App from './App.jsx'
import { installBrowserCompat } from './utils/browserCompat.js'

installBrowserCompat()

const CHUNK_RELOAD_KEY = 'solar-site-precheck-chunk-reload-at'
const CHUNK_RELOAD_COOLDOWN_MS = 30_000

function isChunkLoadError(error) {
  const message = String(error?.message || error || '')
  return /dynamically imported module|Importing a module script failed|Failed to fetch module script|ChunkLoadError|Loading chunk/i.test(message)
}

function reloadOnceForFreshAssets() {
  try {
    const lastReloadAt = Number(window.sessionStorage.getItem(CHUNK_RELOAD_KEY) || 0)
    if (Date.now() - lastReloadAt < CHUNK_RELOAD_COOLDOWN_MS) return false
    window.sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()))
  } catch {
    // If sessionStorage is blocked, a single reload is still safer than a broken app shell.
  }
  window.location.reload()
  return true
}

window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault()
  reloadOnceForFreshAssets()
})

window.addEventListener('unhandledrejection', (event) => {
  if (!isChunkLoadError(event.reason)) return
  event.preventDefault()
  reloadOnceForFreshAssets()
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if (import.meta.env.VITE_DISABLE_SW === '1') {
  navigator.serviceWorker?.getRegistrations?.()
    .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
    .catch((error) => {
      console.warn('Service worker cleanup failed:', error)
    })
} else if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.warn('Service worker registration failed:', error)
    })
  })
}
