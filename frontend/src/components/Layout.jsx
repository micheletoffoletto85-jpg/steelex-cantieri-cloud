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
  const [notifiche, setNotifiche] = useState(null)

  useEffect(() => {
    if (!supportaNotifiche()) return
    if (!['admin','capo_cantiere','capo_cantiere_sub','direzione_lavori','fornitore'].includes(utente?.ruolo)) return
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
      if (ok) alert('✅ Notifiche attivate!')
      else alert('⚠️ Non è stato possibile attivare le notifiche.')
    }
  }

  const handleLogout = () => { logout(); navigate('/login') }
  const mostraNotificheBell = supportaNotifiche() && ['admin','capo_cantiere','capo_cantiere_sub','direzione_lavori','fornitore'].includes(utente?.ruolo)

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">

      {/* Header mobile (sm e sotto) */}
      <header className="sm:hidden bg-steelex-dark text-white px-4 py-3 flex items-center justify-between shadow-lg sticky top-0 z-50">
        <img src="/logo-steelex.png" alt="Steelex" className="h-12" />
        <div className="flex items-center gap-1">
          {mostraNotificheBell && (
            <button onClick={toggleNotifiche}
              className={`p-2 rounded-lg transition-colors ${notifiche ? 'text-steelex-orange' : 'text-gray-400'}`}>
              {notifiche ? <Bell size={20} /> : <BellOff size={20} />}
            </button>
          )}
          <button onClick={handleLogout} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
            <LogOut size={20} />
          </button>
          <button onClick={() => setMenuOpen(!menuOpen)} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>

      {/* Menu mobile */}
      {menuOpen && (
        <div className="sm:hidden absolute top-14 left-0 right-0 bg-white border-b border-gray-200 p-3 z-40 flex flex-col gap-1 shadow-lg">
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

      <div className="flex flex-1 overflow-hidden">

        {/* Sidebar desktop */}
        <aside className="hidden sm:flex flex-col w-60 bg-steelex-dark text-white flex-shrink-0 sticky top-0 h-screen">

          {/* Logo */}
          <div className="px-4 py-5 border-b border-white/10">
            <img src="/logo-steelex.png" alt="Steelex Cantieri" className="h-14 w-auto" />
          </div>

          {/* Nav */}
          <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
            {navItems.filter(i => !i.adminOnly || utente?.ruolo === 'admin').map(({ to, label, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={end}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium transition-colors text-sm ${
                    isActive
                      ? 'bg-steelex-orange text-white shadow-sm'
                      : 'text-gray-300 hover:bg-white/10 hover:text-white'
                  }`
                }>
                <Icon size={18} />
                {label}
              </NavLink>
            ))}
          </nav>

          {/* Footer sidebar: utente + azioni */}
          <div className="p-3 border-t border-white/10 space-y-1">
            {mostraNotificheBell && (
              <button onClick={toggleNotifiche}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  notifiche ? 'text-steelex-orange hover:bg-white/10' : 'text-gray-400 hover:bg-white/10 hover:text-white'
                }`}>
                {notifiche ? <Bell size={18} /> : <BellOff size={18} />}
                {notifiche ? 'Notifiche attive' : 'Attiva notifiche'}
              </button>
            )}
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/10 cursor-pointer group" onClick={handleLogout}>
              <div className="w-7 h-7 rounded-full bg-steelex-orange flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                {(utente?.nome?.[0] || '?').toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{utente?.nome} {utente?.cognome}</p>
                <p className="text-xs text-gray-400 capitalize">{utente?.ruolo?.replace('_', ' ')}</p>
              </div>
              <LogOut size={15} className="text-gray-400 group-hover:text-white flex-shrink-0" />
            </div>
          </div>
        </aside>

        {/* Contenuto principale */}
        <main className="flex-1 overflow-y-auto flex flex-col">
          <div className="p-4 sm:p-6 flex-1">
            <Outlet />
          </div>
          {/* Firma in fondo ad ogni pagina */}
          <div className="px-4 pb-4 pt-2 text-center">
            <p className="text-[10px] text-gray-300 tracking-wide">
              Powered by <span className="font-medium text-gray-400">Geom. Michele Toffoletto</span>
            </p>
          </div>
        </main>
      </div>
    </div>
  )
}
