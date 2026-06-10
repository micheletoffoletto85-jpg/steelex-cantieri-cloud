import { Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import { AuthProvider, useAuth } from './lib/auth'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import CantieriPage from './pages/CantieriPage'
import CantierePage from './pages/CantierePage'
import UtentiPage from './pages/UtentiPage'
import ForniturePage from './pages/ForniturePage'
import Layout from './components/Layout'
import SplashScreen from './components/SplashScreen'

function PrivateRoute({ children }) {
  const { utente, loading } = useAuth()
  if (loading) return <div className="flex items-center justify-center h-screen"><div className="text-steelex-orange text-xl font-bold">STEELEX...</div></div>
  if (!utente) return <Navigate to="/login" replace />
  return children
}

function AppContent() {
  const { utente } = useAuth()
  const prevUtente = useRef(undefined)

  // Lo splash parte SOLO dopo il login riuscito, mai all'apertura dell'app
  const [splash, setSplash] = useState(false)

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
          <Route path="fornitori" element={<ForniturePage />} />
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
