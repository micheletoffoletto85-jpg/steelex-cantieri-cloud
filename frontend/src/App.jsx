import { Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import { AuthProvider, useAuth } from './lib/auth'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import CantieriPage from './pages/CantieriPage'
import CantierePage from './pages/CantierePage'
import UtentiPage from './pages/UtentiPage'
import Layout from './components/Layout'
import SplashScreen from './components/SplashScreen'

function PrivateRoute({ children }) {
  const { utente, loading } = useAuth()
  if (loading) return <div className="flex items-center justify-center h-screen"><div className="text-steelex-orange text-xl font-bold">STEELEX...</div></div>
  if (!utente) return <Navigate to="/login" replace />
  return children
}

// Variabile modulo: per browser normali (si azzera ad ogni fresh load)
let _splashMostrato = false

function _deveVedereSplash() {
  // Su iOS PWA (standalone), WebKit sospende l'app invece di ricaricarla
  // → la variabile modulo rimane true. Usiamo un timestamp per detectare nuova apertura.
  const isStandalone = !!(window.navigator.standalone ||
    window.matchMedia('(display-mode: standalone)').matches)

  if (isStandalone) {
    const ultima = parseInt(sessionStorage.getItem('splash_ts') || '0')
    const ora = Date.now()
    const SOGLIA_MS = 45_000  // 45 secondi = sicuramente nuova apertura
    if (ora - ultima > SOGLIA_MS) {
      sessionStorage.setItem('splash_ts', String(ora))
      return true
    }
    return false
  }

  // Browser normale
  if (_splashMostrato) return false
  _splashMostrato = true
  return true
}

function AppContent() {
  const { utente } = useAuth()
  const prevUtente = useRef(undefined)

  const [splash, setSplash] = useState(() => _deveVedereSplash())

  useEffect(() => {
    // mostra splash quando si completa il login (utente passa da null → valore)
    if (utente && prevUtente.current === null && sessionStorage.getItem('splash_login')) {
      sessionStorage.removeItem('splash_login')
      setSplash(true)
    }
    prevUtente.current = utente ?? null
  }, [utente])

  return (
    <>
      {splash && <SplashScreen onDone={() => setSplash(false)} utente={utente} />}
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
          <Route index element={<DashboardPage />} />
          <Route path="cantieri" element={<CantieriPage />} />
          <Route path="cantieri/:id" element={<CantierePage />} />
          <Route path="utenti" element={<UtentiPage />} />
        </Route>
      </Routes>
    </>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}
