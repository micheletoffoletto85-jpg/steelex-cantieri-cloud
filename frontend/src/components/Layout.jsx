import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { LayoutDashboard, HardHat, LogOut, Menu, X, Users, Bell, BellOff } from 'lucide-react'
import { useState, useEffect } from 'react'
import { registraPushNotifications, disattivaPushNotifications, supportaNotifiche } from '../lib/push'

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/cantieri', label: 'Cantieri', icon: HardHat },
  { to: '/utenti', label: 'Utenti', icon: Users, adminOnly: true },
]

export default function Layout() {
  const { utente, logout } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [notifiche, setNotifiche] = useState(null) // null=non verificato, true=attive, false=disattive

  // Verifica stato notifiche all'avvio
  useEffect(() => {
    if (!supportaNotifiche()) return
    if (!['admin', 'capo_cantiere', 'fornitore'].includes(utente?.ruolo)) return
    navigator.serviceWorker.getRegistration('/sw.js').then(reg => {
      if (reg) reg.pushManager.getSubscription().then(sub => setNotifiche(!!sub))
    })
  }, [utente])

  const toggleNotifiche = async () => {
    if (notifiche) {
      await disattivaPushNotifications()
      setNotifiche(false)
    } else {
      const ok = await registraPushNotifications()
      setNotifiche(ok)
      if (ok) alert('✅ Notifiche attivate! Riceverai aggiornamenti dai tuoi cantieri.')
      else alert('⚠️ Non è stato possibile attivare le notifiche. Verifica i permessi del browser.')
    }
  }

  const handleLogout = () => { logout(); navigate('/login') }
  const mostraNotificheBell = supportaNotifiche() && ['admin', 'capo_cantiere', 'fornitore'].includes(utente?.ruolo)

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-steelex-dark text-white px-4 py-3 flex items-center justify-between shadow-lg sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-steelex-orange rounded-lg flex items-center justify-center font-black text-white text-sm">S</div>
          <span className="font-bold text-lg tracking-wide">STEELEX Cantieri</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-300 hidden sm:block">{utente?.nome} {utente?.cognome}</span>
          {/* Pulsante notifiche */}
          {mostraNotificheBell && (
            <button onClick={toggleNotifiche}
              className={`p-2 rounded-lg transition-colors ${notifiche ? 'text-steelex-orange hover:bg-white/10' : 'text-gray-400 hover:bg-white/10'}`}
              title={notifiche ? 'Notifiche attive — clicca per disattivare' : 'Attiva notifiche push'}>
              {notifiche ? <Bell size={20} /> : <BellOff size={20} />}
            </button>
          )}
          <button onClick={handleLogout} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
            <LogOut size={20} />
          </button>
          <button onClick={() => setMenuOpen(!menuOpen)} className="p-2 hover:bg-white/10 rounded-lg transition-colors sm:hidden">
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>

      <div className="flex flex-1">
        {/* Sidebar desktop */}
        <nav className="hidden sm:flex flex-col w-56 bg-white border-r border-gray-200 p-3 gap-1">
          {navItems.filter(i => !i.adminOnly || utente?.ruolo === 'admin').map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-3 rounded-lg font-medium transition-colors ${isActive ? 'bg-steelex-orange text-white' : 'text-gray-700 hover:bg-gray-100'}`
              }>
              <Icon size={20} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Menu mobile */}
        {menuOpen && (
          <div className="absolute top-14 left-0 right-0 bg-white border-b border-gray-200 p-3 z-40 sm:hidden flex flex-col gap-1">
            {navItems.filter(i => !i.adminOnly || utente?.ruolo === 'admin').map(({ to, label, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={end} onClick={() => setMenuOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-3 rounded-lg font-medium transition-colors ${isActive ? 'bg-steelex-orange text-white' : 'text-gray-700 hover:bg-gray-100'}`
                }>
                <Icon size={20} />
                {label}
              </NavLink>
            ))}
          </div>
        )}

        {/* Contenuto principale */}
        <main className="flex-1 p-4 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
