import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { Link } from 'react-router-dom'
import { Plus, Search, HardHat, MapPin } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../lib/api'
import { useAuth } from '../lib/auth'

const STATI = ['tutti', 'preventivo', 'in_corso', 'sospeso', 'completato']
const STATO_STYLE = {
  preventivo: 'bg-gray-100 text-gray-700',
  in_corso: 'bg-blue-100 text-blue-700',
  sospeso: 'bg-yellow-100 text-yellow-700',
  completato: 'bg-green-100 text-green-700',
  annullato: 'bg-red-100 text-red-700',
}
const STATO_LABEL = {
  preventivo: 'Preventivo', in_corso: 'In Corso', sospeso: 'Sospeso',
  completato: 'Completato', annullato: 'Annullato',
}

export default function CantieriPage() {
  const { utente } = useAuth()
  const isCliente = utente?.ruolo === 'cliente'
  const [filtroStato, setFiltroStato] = useState('tutti')
  const [ricerca, setRicerca] = useState('')
  const [showForm, setShowForm] = useState(false)
  const qc = useQueryClient()

  const { data: cantieri = [], isLoading } = useQuery('cantieri', () => api.get('/cantieri').then(r => r.data))

  const createMutation = useMutation(
    data => api.post('/cantieri', data),
    {
      onSuccess: () => { qc.invalidateQueries('cantieri'); setShowForm(false); toast.success('Cantiere creato!') },
      onError: err => toast.error(err.response?.data?.detail || 'Errore creazione'),
    }
  )

  const filtered = cantieri.filter(c => {
    if (filtroStato !== 'tutti' && c.stato !== filtroStato) return false
    if (ricerca && !`${c.nome} ${c.cliente} ${c.citta}`.toLowerCase().includes(ricerca.toLowerCase())) return false
    return true
  })

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Cantieri</h1>
        {!isCliente && (
          <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2">
            <Plus size={18} /> Nuovo
          </button>
        )}
      </div>

      {/* Filtri */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {STATI.map(s => (
          <button key={s} onClick={() => setFiltroStato(s)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${filtroStato === s ? 'bg-steelex-orange text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>
            {s === 'tutti' ? 'Tutti' : STATO_LABEL[s]}
          </button>
        ))}
      </div>

      {/* Ricerca */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input className="input-field pl-9" placeholder="Cerca cantiere, cliente, città..." value={ricerca} onChange={e => setRicerca(e.target.value)} />
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="text-center py-8 text-gray-400">Caricamento...</div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-8 text-gray-400">
          <HardHat size={40} className="mx-auto mb-2 opacity-30" />
          <p>Nessun cantiere trovato</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(c => (
            <Link key={c.id} to={`/cantieri/${c.id}`} className="card block hover:border-steelex-orange transition-colors">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATO_STYLE[c.stato]}`}>{STATO_LABEL[c.stato]}</span>
                  </div>
                  <h3 className="font-bold text-gray-900 truncate">{c.nome}</h3>
                  <p className="text-sm text-gray-600">{c.cliente}</p>
                  {(c.citta || c.indirizzo) && (
                    <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                      <MapPin size={12} /> {c.indirizzo}{c.citta ? `, ${c.citta}` : ''}
                    </p>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-lg font-bold text-steelex-orange">{c.avanzamento}%</div>
                  <div className="w-16 bg-gray-200 rounded-full h-1.5 mt-1">
                    <div className="bg-steelex-orange h-1.5 rounded-full" style={{ width: `${c.avanzamento}%` }} />
                  </div>
                  {c.budget > 0 && <p className="text-xs text-gray-400 mt-1">€{c.budget.toLocaleString('it-IT')}</p>}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Modal nuovo cantiere */}
      {showForm && <NuovoCantiereModal onClose={() => setShowForm(false)} onSubmit={createMutation.mutate} loading={createMutation.isLoading} />}
    </div>
  )
}

function NuovoCantiereModal({ onClose, onSubmit, loading }) {
  const [form, setForm] = useState({ nome: '', cliente: '', citta: '', provincia: '', stato: 'preventivo', budget: '' })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md p-6 space-y-4">
        <h2 className="text-xl font-bold">Nuovo Cantiere</h2>
        <div className="space-y-3">
          <input className="input-field" placeholder="Nome cantiere *" value={form.nome} onChange={e => set('nome', e.target.value)} required />
          <input className="input-field" placeholder="Cliente *" value={form.cliente} onChange={e => set('cliente', e.target.value)} required />
          <div className="flex gap-2">
            <input className="input-field" placeholder="Città" value={form.citta} onChange={e => set('citta', e.target.value)} />
            <input className="input-field w-20" placeholder="Prov." maxLength={2} value={form.provincia} onChange={e => set('provincia', e.target.value.toUpperCase())} />
          </div>
          <input className="input-field" type="number" placeholder="Budget €" value={form.budget} onChange={e => set('budget', e.target.value)} />
          <select className="input-field" value={form.stato} onChange={e => set('stato', e.target.value)}>
            <option value="preventivo">Preventivo</option>
            <option value="in_corso">In Corso</option>
          </select>
        </div>
        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="btn-secondary flex-1">Annulla</button>
          <button onClick={() => onSubmit({ ...form, budget: Number(form.budget) || 0 })} className="btn-primary flex-1" disabled={loading || !form.nome || !form.cliente}>
            {loading ? 'Salvataggio...' : 'Crea Cantiere'}
          </button>
        </div>
      </div>
    </div>
  )
}
