import { Routes, Route, Navigate } from 'react-router-dom'
import { useState } from 'react'
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

export default function App() {
  const [splash, setSplash] = useState(() => {
    // mostra splash solo alla prima apertura per sessione
    const visto = sessionStorage.getItem('splash_done')
    if (visto) return false
    sessionStorage.setItem('splash_done', '1')
    return true
  })

  return (
    <AuthProvider>
      {splash && <SplashScreen onDone={() => setSplash(false)} />}
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
          <Route index element={<DashboardPage />} />
          <Route path="cantieri" element={<CantieriPage />} />
          <Route path="cantieri/:id" element={<CantierePage />} />
          <Route path="utenti" element={<UtentiPage />} />
        </Route>
      </Routes>
    </AuthProvider>
  )
}
