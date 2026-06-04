import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import CantieriPage from './pages/CantieriPage'
import CantierePage from './pages/CantierePage'
import Layout from './components/Layout'

function PrivateRoute({ children }) {
  const { utente, loading } = useAuth()
  if (loading) return <div className="flex items-center justify-center h-screen"><div className="text-steelex-orange text-xl font-bold">STEELEX...</div></div>
  if (!utente) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
          <Route index element={<DashboardPage />} />
          <Route path="cantieri" element={<CantieriPage />} />
          <Route path="cantieri/:id" element={<CantierePage />} />
        </Route>
      </Routes>
    </AuthProvider>
  )
}
