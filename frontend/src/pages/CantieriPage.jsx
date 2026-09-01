import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { Link } from 'react-router-dom'
import { Plus, Search, HardHat, MapPin } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../lib/api'
import { useAuth } from '../lib/auth'

const STATI = ['tutti', 'preventivo', 'in_corso', 'sospeso', 'completato']
// Stato codificato da testo + pastiglia + banda laterale, mai dal solo colore (MASTER.md)
const STATO_PILL = {
  preventivo: 'pill-neutral',
  in_corso: 'pill-info',
  sospeso: 'pill-warn',
  completato: 'pill-ok',
  annullato: 'pill-late',
}
const STATO_BAND = {
  preventivo: 'border-l-steelex-border-strong',
  in_corso: 'border-l-blue-500',
  sospeso: 'border-l-warn',
  completato: 'border-l-ok',
  annullato: 'border-l-danger',
}
const STATO_LABEL = {
  preventivo: 'Preventivo', in_corso: 'In Corso', sospeso: 'Sospeso',
  completato: 'Completato', annullato: 'Annullato',
}

export default function CantieriPage() {
  const { utente } = useAuth()
  const isCliente = utente?.ruolo === 'cliente'
  const soloLettura = ['cliente', 'fornitore', 'artigiano', 'architetto', 'responsabile_sicurezza'].includes(utente?.ruolo)
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Cantieri</h1>
        {!soloLettura && (
          <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2">
            <Plus size={18} /> Nuovo
          </button>
        )}
      </div>

      {/* Filtri */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {STATI.map(s => (
          <button key={s} onClick={() => setFiltroStato(s)}
            className={`min-h-[40px] px-3.5 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap transition-colors ${filtroStato === s ? 'bg-steelex-orange text-white' : 'bg-white border border-steelex-border text-steelex-muted-fg hover:border-steelex-border-strong'}`}>
            {s === 'tutti' ? 'Tutti' : STATO_LABEL[s]}
          </button>
        ))}
      </div>

      {/* Ricerca */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-steelex-muted-fg pointer-events-none" />
        <input className="input-field pl-9" placeholder="Cerca cantiere, cliente, città..." value={ricerca} onChange={e => setRicerca(e.target.value)} />
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="text-center py-8 text-steelex-muted-fg">Caricamento...</div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-8 text-steelex-muted-fg">
          <HardHat size={40} className="mx-auto mb-2 opacity-30" />
          <p>Nessun cantiere trovato</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(c => (
            <Link key={c.id} to={`/cantieri/${c.id}`}
              className={`card block border-l-[3px] hover:border-steelex-border-strong hover:border-l-steelex-orange ${STATO_BAND[c.stato] || 'border-l-steelex-border-strong'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`pill ${STATO_PILL[c.stato] || 'pill-neutral'}`}>{STATO_LABEL[c.stato]}</span>
                  </div>
                  <h3 className="font-bold text-steelex-ink truncate">{c.nome}</h3>
                  <p className="text-sm text-steelex-muted-fg">{c.cliente}</p>
                  {(c.citta || c.indirizzo) && (
                    <p className="text-xs text-steelex-muted-fg flex items-center gap-1 mt-0.5">
                      <MapPin size={12} className="flex-shrink-0" /> {c.indirizzo}{c.citta ? `, ${c.citta}` : ''}
                    </p>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-lg font-bold text-steelex-orange tnums">{c.avanzamento}%</div>
                  <div className="progress w-16 mt-1 ml-auto"><i style={{ width: `${c.avanzamento}%` }} /></div>
                  {c.budget > 0 && <p className="text-xs text-steelex-muted-fg mt-1 tnums">€{c.budget.toLocaleString('it-IT')}</p>}
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
  const [form, setForm] = useState({ nome: '', cliente: '', indirizzo: '', citta: '', provincia: '', stato: 'preventivo', budget: '' })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md p-6 space-y-4">
        <h2 className="text-xl font-bold">Nuovo Cantiere</h2>
        <div className="space-y-3">
          <input className="input-field" placeholder="Nome cantiere *" value={form.nome} onChange={e => set('nome', e.target.value)} required />
          <input className="input-field" placeholder="Cliente *" value={form.cliente} onChange={e => set('cliente', e.target.value)} required />
          <input className="input-field" placeholder="Indirizzo (via e numero civico)" value={form.indirizzo} onChange={e => set('indirizzo', e.target.value)} />
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
