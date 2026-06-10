import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { ThumbsUp, ThumbsDown, Minus, Plus, X, ChevronDown, ChevronUp, Search, Phone, Mail, Building2, Edit2, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../lib/api'
import { useAuth } from '../lib/auth'

const VOTO_CONFIG = {
  su:    { label: 'Positivo',  icon: ThumbsUp,   color: 'text-green-600',  bg: 'bg-green-100',  border: 'border-green-400' },
  medio: { label: 'Neutro',    icon: Minus,       color: 'text-yellow-600', bg: 'bg-yellow-100', border: 'border-yellow-400' },
  giu:   { label: 'Negativo',  icon: ThumbsDown,  color: 'text-red-500',    bg: 'bg-red-100',    border: 'border-red-400' },
}

function ScoreBadge({ score, totale, su, medio, giu, size = 'md' }) {
  if (score === null || score === undefined) {
    return <span className="text-xs text-gray-400 italic">Nessun feedback</span>
  }
  const color = score >= 75 ? 'bg-green-500' : score >= 45 ? 'bg-yellow-500' : 'bg-red-500'
  const label = score >= 75 ? 'Affidabile' : score >= 45 ? 'Nella media' : 'Attenzione'
  return (
    <div className="flex items-center gap-2">
      <div className={`${size === 'lg' ? 'w-14 h-14 text-xl' : 'w-10 h-10 text-sm'} ${color} rounded-full flex items-center justify-center text-white font-bold flex-shrink-0`}>
        {score}
      </div>
      <div>
        <p className={`font-semibold ${size === 'lg' ? 'text-base' : 'text-sm'} ${score >= 75 ? 'text-green-700' : score >= 45 ? 'text-yellow-700' : 'text-red-600'}`}>
          {label}
        </p>
        <p className="text-xs text-gray-400">
          <span className="text-green-600">👍{su}</span>
          {' · '}
          <span className="text-yellow-600">👌{medio}</span>
          {' · '}
          <span className="text-red-500">👎{giu}</span>
          {' · '}{totale} feedback
        </p>
      </div>
    </div>
  )
}

const FORM_VUOTO = { nome: '', cognome: '', azienda: '', categoria: 'altro', telefono: '', email: '', note: '' }

export default function ArtigianiPage() {
  const { utente } = useAuth()
  const qc = useQueryClient()
  const puoScrivere = ['admin', 'capo_cantiere', 'capo_cantiere_sub', 'direzione_lavori', 'amministrazione'].includes(utente?.ruolo)
  const puoEliminare = utente?.ruolo === 'admin'

  const [ricerca, setRicerca] = useState('')
  const [filtroCategoria, setFiltroCategoria] = useState('')
  const [espanso, setEspanso] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState(FORM_VUOTO)
  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const { data: artigiani = [], isLoading } = useQuery(
    ['artigiani', filtroCategoria],
    () => api.get(`/artigiani${filtroCategoria ? `?categoria=${filtroCategoria}` : ''}`).then(r => r.data),
  )

  const { data: categorie = [] } = useQuery(
    'artigiani-categorie',
    () => api.get('/artigiani/categorie').then(r => r.data),
    { staleTime: Infinity }
  )

  const filtrati = artigiani.filter(a =>
    !ricerca || `${a.nome} ${a.cognome} ${a.azienda || ''}`.toLowerCase().includes(ricerca.toLowerCase())
  )

  const createMutation = useMutation(
    body => api.post('/artigiani', body),
    { onSuccess: () => { qc.invalidateQueries('artigiani'); chiudiForm(); toast.success('Artigiano aggiunto!') },
      onError: e => toast.error(e.response?.data?.detail || 'Errore') }
  )
  const updateMutation = useMutation(
    ({ id, data }) => api.put(`/artigiani/${id}`, data),
    { onSuccess: () => { qc.invalidateQueries('artigiani'); chiudiForm(); toast.success('Aggiornato') },
      onError: e => toast.error(e.response?.data?.detail || 'Errore') }
  )
  const deleteMutation = useMutation(
    id => api.delete(`/artigiani/${id}`),
    { onSuccess: () => { qc.invalidateQueries('artigiani'); toast.success('Eliminato') } }
  )

  const chiudiForm = () => { setShowForm(false); setEditId(null); setForm(FORM_VUOTO) }

  const apriModifica = (a) => {
    setEditId(a.id)
    setForm({ nome: a.nome, cognome: a.cognome, azienda: a.azienda || '', categoria: a.categoria, telefono: a.telefono || '', email: a.email || '', note: a.note || '' })
    setShowForm(true)
  }

  const salva = () => {
    const payload = { ...form, azienda: form.azienda || null, telefono: form.telefono || null, email: form.email || null, note: form.note || null }
    if (editId) updateMutation.mutate({ id: editId, data: payload })
    else createMutation.mutate(payload)
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Rubrica Artigiani</h1>
          <p className="text-sm text-gray-500 mt-0.5">{filtrati.length} artigiani · ordinati per affidabilità</p>
        </div>
        {puoScrivere && (
          <button onClick={() => { chiudiForm(); setShowForm(true) }}
            className="btn-primary flex items-center gap-1.5 text-sm py-2 px-3">
            <Plus size={15} /> Nuovo
          </button>
        )}
      </div>

      {/* Form aggiunta/modifica */}
      {showForm && (
        <div className="card border-2 border-steelex-orange/30 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-800">{editId ? 'Modifica artigiano' : 'Nuovo artigiano'}</h3>
            <button onClick={chiudiForm}><X size={18} className="text-gray-400" /></button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input className="input-field text-sm" placeholder="Nome *" value={form.nome} onChange={e => setF('nome', e.target.value)} />
            <input className="input-field text-sm" placeholder="Cognome *" value={form.cognome} onChange={e => setF('cognome', e.target.value)} />
          </div>
          <input className="input-field text-sm" placeholder="Azienda / Ditta" value={form.azienda} onChange={e => setF('azienda', e.target.value)} />
          <select className="input-field text-sm" value={form.categoria} onChange={e => setF('categoria', e.target.value)}>
            {categorie.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <input className="input-field text-sm" placeholder="Telefono" value={form.telefono} onChange={e => setF('telefono', e.target.value)} />
            <input className="input-field text-sm" placeholder="Email" value={form.email} onChange={e => setF('email', e.target.value)} />
          </div>
          <textarea className="input-field text-sm h-16 resize-none" placeholder="Note interne..."
            value={form.note} onChange={e => setF('note', e.target.value)} />
          <button onClick={salva}
            disabled={!form.nome || !form.cognome || createMutation.isLoading || updateMutation.isLoading}
            className="btn-primary w-full py-2.5">
            {createMutation.isLoading || updateMutation.isLoading ? 'Salvataggio...' : editId ? 'Salva modifiche' : 'Aggiungi artigiano'}
          </button>
        </div>
      )}

      {/* Filtri */}
      <div className="space-y-2">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input-field pl-8 text-sm" placeholder="Cerca nome, cognome, azienda..."
            value={ricerca} onChange={e => setRicerca(e.target.value)} />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <button onClick={() => setFiltroCategoria('')}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${!filtroCategoria ? 'bg-steelex-orange text-white' : 'bg-white border border-gray-200 text-gray-500'}`}>
            Tutti
          </button>
          {categorie.map(c => (
            <button key={c.value} onClick={() => setFiltroCategoria(filtroCategoria === c.value ? '' : c.value)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${filtroCategoria === c.value ? 'bg-steelex-orange text-white' : 'bg-white border border-gray-200 text-gray-500'}`}>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="text-center py-10 text-gray-400">Caricamento...</div>
      ) : filtrati.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">
          <p className="text-4xl mb-3">👷</p>
          <p className="font-medium">Nessun artigiano trovato</p>
          {puoScrivere && <p className="text-sm mt-1">Aggiungi il primo con il tasto "Nuovo"</p>}
        </div>
      ) : (
        <div className="space-y-2">
          {filtrati.map(a => (
            <ArtigianoCard key={a.id} artigiano={a}
              espanso={espanso === a.id}
              onEspandi={() => setEspanso(espanso === a.id ? null : a.id)}
              puoScrivere={puoScrivere}
              puoEliminare={puoEliminare}
              onModifica={() => apriModifica(a)}
              onElimina={() => { if (window.confirm(`Eliminare ${a.nome} ${a.cognome}?`)) deleteMutation.mutate(a.id) }}
              qc={qc}
              categorie={categorie}
            />
          ))}
        </div>
      )}
    </div>
  )
}


function ArtigianoCard({ artigiano: a, espanso, onEspandi, puoScrivere, puoEliminare, onModifica, onElimina, qc }) {
  const [showFeedbackForm, setShowFeedbackForm] = useState(false)
  const [voto, setVoto] = useState('su')
  const [nota, setNota] = useState('')

  const { data: feedbacks = [] } = useQuery(
    ['feedback', a.id],
    () => api.get(`/artigiani/${a.id}/feedback`).then(r => r.data),
    { enabled: espanso }
  )

  const addFeedbackMutation = useMutation(
    body => api.post(`/artigiani/${a.id}/feedback`, body),
    {
      onSuccess: () => {
        qc.invalidateQueries(['feedback', a.id])
        qc.invalidateQueries('artigiani')
        setShowFeedbackForm(false)
        setNota('')
        setVoto('su')
        toast.success('Feedback salvato!')
      },
      onError: e => toast.error(e.response?.data?.detail || 'Errore'),
    }
  )

  const deleteFeedbackMutation = useMutation(
    fbId => api.delete(`/artigiani/${a.id}/feedback/${fbId}`),
    { onSuccess: () => { qc.invalidateQueries(['feedback', a.id]); qc.invalidateQueries('artigiani') } }
  )

  const catLabel = a.categoria_label || a.categoria

  return (
    <div className={`card transition-all ${!a.attivo ? 'opacity-50' : ''}`}>
      <div className="flex items-start gap-3">
        {/* Score circle */}
        <div className={`w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 text-white
          ${a.score === null ? 'bg-gray-300' : a.score >= 75 ? 'bg-green-500' : a.score >= 45 ? 'bg-yellow-500' : 'bg-red-500'}`}>
          {a.score !== null ? a.score : '—'}
        </div>

        {/* Info principale */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-1">
            <div className="min-w-0">
              <p className="font-semibold text-gray-900">{a.nome} {a.cognome}</p>
              {a.azienda && <p className="text-xs text-gray-500">{a.azienda}</p>}
            </div>
            <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full whitespace-nowrap flex-shrink-0">
              {catLabel}
            </span>
          </div>

          {/* Contatti rapidi */}
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            {a.telefono && (
              <a href={`tel:${a.telefono}`} className="flex items-center gap-1 text-xs text-blue-600">
                <Phone size={11} />{a.telefono}
              </a>
            )}
            {a.email && (
              <a href={`mailto:${a.email}`} className="flex items-center gap-1 text-xs text-blue-600">
                <Mail size={11} />{a.email}
              </a>
            )}
          </div>

          {/* Feedback summary inline */}
          {a.totale_feedback > 0 ? (
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-xs text-green-600">👍{a.su}</span>
              <span className="text-xs text-yellow-600">👌{a.medio}</span>
              <span className="text-xs text-red-500">👎{a.giu}</span>
              <span className="text-xs text-gray-400">· {a.totale_feedback} feedback</span>
            </div>
          ) : (
            <p className="text-xs text-gray-400 mt-1">Nessun feedback ancora</p>
          )}
        </div>

        {/* Azioni */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {puoScrivere && (
            <button onClick={onModifica} title="Modifica"
              className="p-1.5 text-gray-400 hover:text-steelex-orange rounded-lg transition-colors">
              <Edit2 size={14} />
            </button>
          )}
          {puoEliminare && (
            <button onClick={onElimina} title="Elimina"
              className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg transition-colors">
              <Trash2 size={14} />
            </button>
          )}
          <button onClick={onEspandi} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg">
            {espanso ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {/* Dettaglio espanso */}
      {espanso && (
        <div className="mt-4 pt-4 border-t border-gray-100 space-y-4">

          {/* Score grande */}
          <ScoreBadge score={a.score} totale={a.totale_feedback} su={a.su} medio={a.medio} giu={a.giu} size="lg" />

          {a.note && (
            <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-2.5 italic">📝 {a.note}</p>
          )}

          {/* Form feedback rapido */}
          {puoScrivere && (
            <div>
              {showFeedbackForm ? (
                <div className="bg-gray-50 rounded-xl p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold">Lascia un feedback</h4>
                    <button onClick={() => setShowFeedbackForm(false)}><X size={15} className="text-gray-400" /></button>
                  </div>
                  {/* 3 bottoni pollice */}
                  <div className="grid grid-cols-3 gap-2">
                    {Object.entries(VOTO_CONFIG).map(([v, cfg]) => {
                      const Icon = cfg.icon
                      const selected = voto === v
                      return (
                        <button key={v} onClick={() => setVoto(v)}
                          className={`py-3 rounded-xl flex flex-col items-center gap-1 border-2 transition-all
                            ${selected ? `${cfg.bg} ${cfg.border} ${cfg.color}` : 'bg-white border-gray-200 text-gray-400'}`}>
                          <Icon size={22} className={selected ? cfg.color : 'text-gray-300'} />
                          <span className="text-xs font-medium">{cfg.label}</span>
                        </button>
                      )
                    })}
                  </div>
                  <textarea className="input-field text-sm h-14 resize-none" placeholder="Nota opzionale (es. cantiere, motivo)..."
                    value={nota} onChange={e => setNota(e.target.value)} />
                  <button
                    onClick={() => addFeedbackMutation.mutate({ voto, nota: nota || null })}
                    disabled={addFeedbackMutation.isLoading}
                    className="btn-primary w-full py-2.5 text-sm">
                    {addFeedbackMutation.isLoading ? 'Salvataggio...' : 'Salva feedback'}
                  </button>
                </div>
              ) : (
                <button onClick={() => setShowFeedbackForm(true)}
                  className="w-full py-2.5 text-sm font-medium rounded-xl border-2 border-dashed border-steelex-orange text-steelex-orange hover:bg-orange-50 flex items-center justify-center gap-2 transition-colors">
                  <Plus size={14} /> Aggiungi feedback
                </button>
              )}
            </div>
          )}

          {/* Storico feedback */}
          {feedbacks.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Storico feedback</p>
              {feedbacks.map(fb => {
                const cfg = VOTO_CONFIG[fb.voto] || VOTO_CONFIG.medio
                const Icon = cfg.icon
                return (
                  <div key={fb.id} className={`flex items-start gap-2 p-2.5 rounded-xl ${cfg.bg}`}>
                    <Icon size={15} className={`${cfg.color} flex-shrink-0 mt-0.5`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs font-semibold ${cfg.color}`}>{cfg.label}</span>
                        {fb.cantiere_nome && <span className="text-xs text-gray-500">· {fb.cantiere_nome}</span>}
                        {fb.autore_nome && <span className="text-xs text-gray-400">· {fb.autore_nome}</span>}
                      </div>
                      {fb.nota && <p className="text-xs text-gray-700 mt-0.5">{fb.nota}</p>}
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {fb.creato_il ? new Date(fb.creato_il).toLocaleDateString('it-IT') : ''}
                      </p>
                    </div>
                    {puoScrivere && (
                      <button onClick={() => deleteFeedbackMutation.mutate(fb.id)}
                        className="p-1 text-gray-300 hover:text-red-400 transition-colors">
                        <X size={12} />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
