import { useQuery } from 'react-query'
import { Link } from 'react-router-dom'
import { HardHat, TrendingUp, Clock, CheckCircle, AlertCircle } from 'lucide-react'
import api from '../lib/api'
import { useAuth } from '../lib/auth'

const STATO_LABEL = {
  preventivo: { label: 'Preventivo', color: 'bg-gray-100 text-gray-700' },
  in_corso: { label: 'In Corso', color: 'bg-blue-100 text-blue-700' },
  sospeso: { label: 'Sospeso', color: 'bg-yellow-100 text-yellow-700' },
  completato: { label: 'Completato', color: 'bg-green-100 text-green-700' },
  annullato: { label: 'Annullato', color: 'bg-red-100 text-red-700' },
}

export default function DashboardPage() {
  const { utente } = useAuth()
  const { data: cantieri = [] } = useQuery('cantieri', () => api.get('/cantieri').then(r => r.data))

  const stats = {
    totale: cantieri.length,
    in_corso: cantieri.filter(c => c.stato === 'in_corso').length,
    completati: cantieri.filter(c => c.stato === 'completato').length,
    avanzamento_medio: cantieri.length
      ? Math.round(cantieri.reduce((s, c) => s + c.avanzamento, 0) / cantieri.length)
      : 0,
  }

  const cantieriAttivi = cantieri.filter(c => c.stato === 'in_corso').slice(0, 5)

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Ciao, {utente?.nome} 👋</h1>
        <p className="text-gray-500 text-sm">Ecco la situazione dei cantieri oggi</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={HardHat} label="Totale Cantieri" value={stats.totale} color="orange" />
        <StatCard icon={Clock} label="In Corso" value={stats.in_corso} color="blue" />
        <StatCard icon={CheckCircle} label="Completati" value={stats.completati} color="green" />
        <StatCard icon={TrendingUp} label="Avanzamento Medio" value={`${stats.avanzamento_medio}%`} color="purple" />
      </div>

      {/* Cantieri attivi */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-gray-800">Cantieri in Corso</h2>
          <Link to="/cantieri" className="text-steelex-orange text-sm font-medium">Vedi tutti →</Link>
        </div>
        {cantieriAttivi.length === 0 ? (
          <div className="card text-center py-8 text-gray-400">
            <HardHat size={40} className="mx-auto mb-2 opacity-30" />
            <p>Nessun cantiere attivo</p>
            <Link to="/cantieri" className="text-steelex-orange text-sm font-medium mt-2 inline-block">Crea il primo cantiere</Link>
          </div>
        ) : (
          <div className="space-y-2">
            {cantieriAttivi.map(c => (
              <Link key={c.id} to={`/cantieri/${c.id}`} className="card flex items-center justify-between hover:border-steelex-orange transition-colors">
                <div>
                  <p className="font-semibold text-gray-900">{c.nome}</p>
                  <p className="text-sm text-gray-500">{c.cliente} — {c.citta || 'N/D'}</p>
                </div>
                <div className="text-right">
                  <div className="text-steelex-orange font-bold">{c.avanzamento}%</div>
                  <div className="w-20 bg-gray-200 rounded-full h-2 mt-1">
                    <div className="bg-steelex-orange h-2 rounded-full" style={{ width: `${c.avanzamento}%` }} />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, color }) {
  const colors = {
    orange: 'bg-orange-50 text-orange-600',
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    purple: 'bg-purple-50 text-purple-600',
  }
  return (
    <div className="card">
      <div className={`inline-flex p-2 rounded-lg ${colors[color]} mb-2`}>
        <Icon size={20} />
      </div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
    </div>
  )
}
