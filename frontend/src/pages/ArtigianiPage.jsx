import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import {
  ThumbsUp, ThumbsDown, Minus, Plus, X, ChevronDown, ChevronUp,
  Search, Phone, Mail, Edit2, Trash2, Link2, UserCheck,
  FolderOpen, ExternalLink, AlertTriangle, Clock, Tag,
} from 'lucide-react'
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
          <span className="text-green-600">👍{su}</span>{' · '}
          <span className="text-yellow-600">👌{medio}</span>{' · '}
          <span className="text-red-500">👎{giu}</span>{' · '}{totale} feedback
        </p>
      </div>
    </div>
  )
}

function TagChips({ tags, small = false }) {
  if (!tags || tags.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {tags.map(t => (
        <span key={t} className={`inline-flex items-center gap-0.5 bg-orange-50 text-orange-700 border border-orange-200 rounded-full font-medium ${small ? 'text-[10px] px-1.5 py-0' : 'text-xs px-2 py-0.5'}`}>
          <Tag size={small ? 9 : 10} />{t}
        </span>
      ))}
    </div>
  )
}

function TagInput({ value, onChange }) {
  const [input, setInput] = useState('')
  const aggiungi = () => {
    const t = input.trim().toLowerCase()
    if (!t || value.includes(t)) { setInput(''); return }
    onChange([...value, t])
    setInput('')
  }
  const rimuovi = (t) => onChange(value.filter(x => x !== t))
  return (
    <div className="space-y-1.5">
      <div className="flex gap-1">
        <input
          className="input-field text-sm flex-1"
          placeholder="Aggiungi tag (es. porte, verniciatura...)"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); aggiungi() } }}
        />
        <button type="button" onClick={aggiungi}
          className="px-3 py-1.5 bg-orange-100 text-orange-700 rounded-lg text-sm font-medium hover:bg-orange-200">
          +
        </button>
      </div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {value.map(t => (
            <span key={t} className="inline-flex items-center gap-1 bg-orange-50 text-orange-700 border border-orange-200 rounded-full text-xs px-2 py-0.5">
              {t}
              <button onClick={() => rimuovi(t)} className="hover:text-red-500 ml-0.5"><X size={10} /></button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

const FORM_VUOTO = {
  nome: '', cognome: '', azienda: '', categoria: 'altro',
  tags: [], telefono: '', email: '', note: '',
  durc_scadenza: '', durc_drive_url: '',
  primo_soccorso_scadenza: '', primo_soccorso_drive_url: '',
  visura_camerale_scadenza: '', visura_camerale_drive_url: '',
  drive_folder_url: '',
}

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
  const [tabAttivo, setTabAttivo] = useState('lista') // lista | scadenze
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

  const { data: scadenze = [] } = useQuery(
    'artigiani-scadenze',
    () => api.get('/artigiani/scadenze?giorni=60').then(r => r.data),
    { enabled: tabAttivo === 'scadenze' }
  )

  const filtrati = artigiani.filter(a => {
    if (!ricerca) return true
    const q = ricerca.toLowerCase()
    return `${a.nome} ${a.cognome} ${a.azienda || ''} ${a.note || ''} ${(a.tags || []).join(' ')}`.toLowerCase().includes(q)
  })

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
    setForm({
      nome: a.nome, cognome: a.cognome, azienda: a.azienda || '', categoria: a.categoria,
      tags: a.tags || [], telefono: a.telefono || '', email: a.email || '', note: a.note || '',
      durc_scadenza: a.durc_scadenza || '', durc_drive_url: a.durc_drive_url || '',
      primo_soccorso_scadenza: a.primo_soccorso_scadenza || '',
      primo_soccorso_drive_url: a.primo_soccorso_drive_url || '',
      visura_camerale_scadenza: a.visura_camerale_scadenza || '',
      visura_camerale_drive_url: a.visura_camerale_drive_url || '',
      drive_folder_url: a.drive_folder_url || '',
    })
    setShowForm(true)
  }

  const salva = () => {
    const payload = {
      ...form,
      azienda: form.azienda || null,
      telefono: form.telefono || null,
      email: form.email || null,
      note: form.note || null,
      durc_scadenza: form.durc_scadenza || null,
      durc_drive_url: form.durc_drive_url || null,
      primo_soccorso_scadenza: form.primo_soccorso_scadenza || null,
      primo_soccorso_drive_url: form.primo_soccorso_drive_url || null,
      visura_camerale_scadenza: form.visura_camerale_scadenza || null,
      visura_camerale_drive_url: form.visura_camerale_drive_url || null,
      drive_folder_url: form.drive_folder_url || null,
    }
    if (editId) updateMutation.mutate({ id: editId, data: payload })
    else createMutation.mutate(payload)
  }

  const scadutiCount = scadenze.filter(s => s.scaduto).length
  const inScadenzaCount = scadenze.filter(s => !s.scaduto).length

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

      {/* Tab lista / scadenze */}
      <div className="flex gap-1 border-b border-gray-200">
        <button onClick={() => setTabAttivo('lista')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${tabAttivo === 'lista' ? 'border-steelex-orange text-steelex-orange' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
          Lista artigiani
        </button>
        <button onClick={() => setTabAttivo('scadenze')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5 ${tabAttivo === 'scadenze' ? 'border-steelex-orange text-steelex-orange' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
          <AlertTriangle size={14} /> Documenti in scadenza
          {scadutiCount > 0 && (
            <span className="bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">{scadutiCount}</span>
          )}
        </button>
      </div>

      {tabAttivo === 'scadenze' ? (
        <ScadenzePanel scadenze={scadenze} />
      ) : (
        <>
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
              <div>
                <label className="text-xs text-gray-500 font-medium mb-1 block">Tag lavorazioni aggiuntive</label>
                <TagInput value={form.tags} onChange={v => setF('tags', v)} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input className="input-field text-sm" placeholder="Telefono" value={form.telefono} onChange={e => setF('telefono', e.target.value)} />
                <input className="input-field text-sm" placeholder="Email" value={form.email} onChange={e => setF('email', e.target.value)} />
              </div>
              <textarea className="input-field text-sm h-16 resize-none" placeholder="Note interne..."
                value={form.note} onChange={e => setF('note', e.target.value)} />

              {/* Cartella Drive */}
              <div>
                <label className="text-xs text-gray-500 font-medium mb-1 block flex items-center gap-1">
                  <FolderOpen size={12} /> Link cartella Google Drive (tutti i documenti)
                </label>
                <input className="input-field text-sm" placeholder="https://drive.google.com/drive/folders/..."
                  value={form.drive_folder_url} onChange={e => setF('drive_folder_url', e.target.value)} />
              </div>

              {/* 3 doc principali */}
              <div className="border border-gray-200 rounded-xl p-3 space-y-3">
                <p className="text-xs font-semibold text-gray-600">📋 Documenti principali</p>
                {[
                  { label: 'DURC', scad: 'durc_scadenza', url: 'durc_drive_url' },
                  { label: 'Primo Soccorso', scad: 'primo_soccorso_scadenza', url: 'primo_soccorso_drive_url' },
                  { label: 'Visura Camerale', scad: 'visura_camerale_scadenza', url: 'visura_camerale_drive_url' },
                ].map(({ label, scad, url }) => (
                  <div key={scad} className="space-y-1">
                    <p className="text-xs text-gray-500 font-medium">{label}</p>
                    <div className="grid grid-cols-2 gap-2">
                      <input type="date" className="input-field text-sm" value={form[scad]} onChange={e => setF(scad, e.target.value)}
                        title={`Scadenza ${label}`} />
                      <input className="input-field text-sm" placeholder="Link Drive" value={form[url]} onChange={e => setF(url, e.target.value)} />
                    </div>
                  </div>
                ))}
              </div>

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
              <input className="input-field pl-8 text-sm" placeholder="Cerca nome, azienda, tag, note..."
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
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}


function ScadenzePanel({ scadenze }) {
  const oggi = new Date()
  const scaduti = scadenze.filter(s => s.scaduto)
  const inScadenza = scadenze.filter(s => !s.scaduto)

  if (scadenze.length === 0) {
    return (
      <div className="card text-center py-12 text-gray-400">
        <p className="text-4xl mb-3">✅</p>
        <p className="font-medium">Nessun documento in scadenza nei prossimi 60 giorni</p>
      </div>
    )
  }

  const Riga = ({ s }) => (
    <div className={`flex items-center gap-3 p-3 rounded-xl border ${s.scaduto ? 'bg-red-50 border-red-200' : 'bg-orange-50 border-orange-200'}`}>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-800">{s.artigiano_nome}</p>
        {s.azienda && <p className="text-xs text-gray-500">{s.azienda}</p>}
        <div className="flex items-center gap-2 mt-0.5">
          <span className={`text-xs font-medium ${s.scaduto ? 'text-red-700' : 'text-orange-700'}`}>{s.documento}</span>
          <span className="text-xs text-gray-500">·</span>
          <span className={`text-xs font-semibold ${s.scaduto ? 'text-red-600' : 'text-orange-600'}`}>
            {s.scaduto ? `Scaduto ${Math.abs(s.giorni_mancanti)}gg fa` : `Scade tra ${s.giorni_mancanti}gg`}
          </span>
          <span className="text-xs text-gray-400">({new Date(s.scadenza).toLocaleDateString('it-IT')})</span>
        </div>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {s.url && (
          <a href={s.url} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-blue-600 hover:underline bg-white border border-blue-200 rounded-lg px-2 py-1">
            <ExternalLink size={11} /> Doc
          </a>
        )}
        {s.drive_folder_url && (
          <a href={s.drive_folder_url} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-gray-600 hover:underline bg-white border border-gray-200 rounded-lg px-2 py-1">
            <FolderOpen size={11} /> Drive
          </a>
        )}
      </div>
    </div>
  )

  return (
    <div className="space-y-4">
      {scaduti.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-red-600 flex items-center gap-1.5">
            <AlertTriangle size={14} /> Scaduti ({scaduti.length})
          </p>
          {scaduti.map((s, i) => <Riga key={i} s={s} />)}
        </div>
      )}
      {inScadenza.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-orange-600 flex items-center gap-1.5">
            <Clock size={14} /> In scadenza entro 60 giorni ({inScadenza.length})
          </p>
          {inScadenza.map((s, i) => <Riga key={i} s={s} />)}
        </div>
      )}
    </div>
  )
}


function ArtigianoCard({ artigiano: a, espanso, onEspandi, puoScrivere, puoEliminare, onModifica, onElimina, qc }) {
  const [showFeedbackForm, setShowFeedbackForm] = useState(false)
  const [voto, setVoto] = useState('su')
  const [nota, setNota] = useState('')
  const [cantiereFeedback, setCantiereFeedback] = useState('')
  const [showCollegaUtente, setShowCollegaUtente] = useState(false)

  const { data: cantieri = [] } = useQuery(
    'cantieri-lista',
    () => api.get('/cantieri').then(r => r.data),
    { staleTime: 60000, enabled: espanso }
  )
  const { data: utentiArtigiani = [] } = useQuery(
    'utenti-artigiani',
    () => api.get('/utenti').then(r => r.data.filter(u => ['artigiano','fornitore'].includes(u.ruolo))),
    { staleTime: 60000, enabled: espanso && showCollegaUtente }
  )
  const collegaUtenteMutation = useMutation(
    utenteId => api.put(`/artigiani/${a.id}`, { utente_id: utenteId || null }),
    { onSuccess: () => { qc.invalidateQueries('artigiani'); setShowCollegaUtente(false); toast.success('Account collegato!') },
      onError: e => toast.error(e.response?.data?.detail || 'Errore') }
  )

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
        setShowFeedbackForm(false); setNota(''); setVoto('su'); setCantiereFeedback('')
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

  // Calcola alert scadenze
  const oggi = new Date()
  const tra30 = new Date(); tra30.setDate(oggi.getDate() + 30)
  const docPrincipali = [
    { label: 'DURC', scad: a.durc_scadenza, url: a.durc_drive_url },
    { label: 'Primo Soccorso', scad: a.primo_soccorso_scadenza, url: a.primo_soccorso_drive_url },
    { label: 'Visura', scad: a.visura_camerale_scadenza, url: a.visura_camerale_drive_url },
  ]
  const alertDocs = docPrincipali.filter(d => {
    if (!d.scad) return false
    const dt = new Date(d.scad)
    return dt < tra30
  })

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
            <div className="flex items-center gap-1 flex-shrink-0">
              {alertDocs.length > 0 && (
                <span title={`Doc in scadenza: ${alertDocs.map(d => d.label).join(', ')}`}
                  className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center">
                  <AlertTriangle size={10} className="text-white" />
                </span>
              )}
              <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full whitespace-nowrap">
                {catLabel}
              </span>
            </div>
          </div>

          <TagChips tags={a.tags} small />

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

          <ScoreBadge score={a.score} totale={a.totale_feedback} su={a.su} medio={a.medio} giu={a.giu} size="lg" />

          {a.note && (
            <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-2.5 italic">📝 {a.note}</p>
          )}

          {/* Tag estesi */}
          {a.tags && a.tags.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1.5">Lavorazioni</p>
              <TagChips tags={a.tags} />
            </div>
          )}

          {/* Documenti Google Drive */}
          <div className="border border-gray-200 rounded-xl p-3 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-600 flex items-center gap-1.5">
                📋 Documenti
              </p>
              {a.drive_folder_url && (
                <a href={a.drive_folder_url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-blue-600 hover:underline bg-blue-50 px-2 py-1 rounded-lg">
                  <FolderOpen size={11} /> Apri cartella Drive
                </a>
              )}
            </div>
            {docPrincipali.map(({ label, scad, url }) => {
              const d = scad ? new Date(scad) : null
              const scaduto = d && d < oggi
              const inScadenza = d && !scaduto && d < tra30
              return (
                <div key={label} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {url ? (
                      <a href={url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
                        <ExternalLink size={11} />{label}
                      </a>
                    ) : <span className="text-xs text-gray-600">{label}</span>}
                  </div>
                  <div className="flex-shrink-0">
                    {d ? (
                      <span className={`text-xs px-2 py-0.5 rounded font-medium ${scaduto ? 'bg-red-100 text-red-700' : inScadenza ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}`}>
                        {scaduto ? '⚠ ' : inScadenza ? '⏰ ' : '✓ '}{d.toLocaleDateString('it-IT')}
                      </span>
                    ) : <span className="text-xs text-gray-400">—</span>}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Collegamento account utente */}
          {puoScrivere && (
            <div className="border border-gray-200 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-600">
                  <Link2 size={13} /> Account app
                </div>
                <button onClick={() => setShowCollegaUtente(!showCollegaUtente)}
                  className="text-xs text-steelex-orange hover:underline">
                  {showCollegaUtente ? 'Annulla' : a.utente_id ? 'Modifica' : 'Collega'}
                </button>
              </div>
              {a.utente_nome ? (
                <div className="flex items-center gap-2 text-sm">
                  <UserCheck size={15} className="text-green-500" />
                  <span className="font-medium text-gray-800">{a.utente_nome}</span>
                  <span className="text-xs text-gray-400">ha accesso all'app</span>
                </div>
              ) : (
                <p className="text-xs text-gray-400">Nessun account collegato</p>
              )}
              {showCollegaUtente && (
                <select className="input-field text-sm w-full"
                  defaultValue={a.utente_id || ''}
                  onChange={e => collegaUtenteMutation.mutate(e.target.value ? parseInt(e.target.value) : null)}>
                  <option value="">— Nessun collegamento —</option>
                  {utentiArtigiani.map(u => (
                    <option key={u.id} value={u.id}>{u.nome} {u.cognome} ({u.ruolo})</option>
                  ))}
                </select>
              )}
            </div>
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
                  <select className="input-field text-sm" value={cantiereFeedback} onChange={e => setCantiereFeedback(e.target.value)}>
                    <option value="">— Cantiere (opzionale) —</option>
                    {cantieri.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                  <textarea className="input-field text-sm h-14 resize-none" placeholder="Nota opzionale..."
                    value={nota} onChange={e => setNota(e.target.value)} />
                  <button
                    onClick={() => addFeedbackMutation.mutate({ voto, nota: nota || null, cantiere_id: cantiereFeedback ? parseInt(cantiereFeedback) : null })}
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
