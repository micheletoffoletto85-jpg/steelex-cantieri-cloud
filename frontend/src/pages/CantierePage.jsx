import { useState, useRef, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { ArrowLeft, Edit2, Save, X, MapPin, Calendar, Euro, CheckSquare, BookOpen, Plus, Trash2, Camera, CheckCircle2, Circle, Mic, MicOff, Loader2, Languages, Map, Upload, FileText, AlertTriangle, Wrench, BarChart2, Users, UserPlus, UserMinus, FolderOpen, ClipboardCheck, Clock, Download, ThumbsUp, ThumbsDown } from 'lucide-react'
import EconomiaTab from './EconomiaTab'
import ClienteView from './ClienteView'
import GanttTab from './GanttTab'
import AggiornnamentiTab from './AggiornnamentiTab'
import toast from 'react-hot-toast'
import api from '../lib/api'
import { useAuth } from '../lib/auth'
import dayjs from 'dayjs'
import 'dayjs/locale/it'
dayjs.locale('it')

const STATO_STYLE = {
  preventivo: 'bg-gray-100 text-gray-700', in_corso: 'bg-blue-100 text-blue-700',
  sospeso: 'bg-yellow-100 text-yellow-700', completato: 'bg-green-100 text-green-700',
  annullato: 'bg-red-100 text-red-700',
}
const STATO_LABEL = { preventivo: 'Preventivo', in_corso: 'In Corso', sospeso: 'Sospeso', completato: 'Completato', annullato: 'Annullato' }

export default function CantierePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [tab, setTab] = useState('info')
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(null)

  const { utente } = useAuth()
  const isCliente = utente?.ruolo === 'cliente'
  const { data: cantiere, isLoading } = useQuery(['cantiere', id], () => api.get(`/cantieri/${id}`).then(r => r.data), {
    enabled: !!utente,
    onSuccess: d => { if (!form) setForm(d) }
  })

  const updateMutation = useMutation(
    data => api.put(`/cantieri/${id}`, data),
    { onSuccess: r => { qc.setQueryData(['cantiere', id], r.data); qc.invalidateQueries('cantieri'); setEditing(false); toast.success('Salvato!') } }
  )

  if (isLoading) return <div className="text-center py-8 text-gray-400">Caricamento...</div>
  if (!cantiere) return <div className="text-center py-8 text-red-400">Cantiere non trovato</div>

  // Vista cliente — completamente separata, senza dati economici/interni
  if (isCliente) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/cantieri')} className="p-2 hover:bg-gray-100 rounded-lg"><ArrowLeft size={20} /></button>
          <h1 className="text-xl font-bold truncate">{cantiere.nome}</h1>
        </div>
        <AggiornnamentiTab cantiereId={id} />
        <ClienteView cantiere={cantiere} />
      </div>
    )
  }

  const data = editing ? form : cantiere
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/cantieri')} className="p-2 hover:bg-gray-100 rounded-lg"><ArrowLeft size={20} /></button>
        <div className="flex-1 min-w-0">
          {editing
            ? <input className="input-field text-lg font-bold" value={form.nome} onChange={e => set('nome', e.target.value)} />
            : <h1 className="text-xl font-bold truncate">{cantiere.nome}</h1>}
        </div>
        {editing ? (
          <div className="flex gap-2">
            <button onClick={() => { setForm(cantiere); setEditing(false) }} className="p-2 hover:bg-gray-100 rounded-lg text-gray-400"><X size={20} /></button>
            <button onClick={() => updateMutation.mutate(form)} className="btn-primary py-2 flex items-center gap-1"><Save size={16} /> Salva</button>
          </div>
        ) : (
          <button onClick={() => setEditing(true)} className="p-2 hover:bg-gray-100 rounded-lg text-gray-400"><Edit2 size={20} /></button>
        )}
      </div>

      {/* Tab bar — scroll orizzontale su mobile */}
      <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1">
        {[['info','Info',null],['aggiornamenti','Aggiornamenti',Calendar],
          ...(!['cliente'].includes(utente?.ruolo) ? [['team','Team',Users],['gantt','Gantt',BarChart2],['checklist','Checklist',CheckSquare],['diario','Diario',BookOpen],['mappe','Mappe',Map]] : []),
          ...(['admin','capo_cantiere'].includes(utente?.ruolo) ? [['economia','Economia',Euro]] : []),
          ['documenti','Documenti',FolderOpen],
        ].map(([key,label,Icon]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap flex-shrink-0 transition-colors ${tab===key ? 'bg-steelex-orange text-white shadow' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {Icon && <Icon size={12} />}{label}
          </button>
        ))}
      </div>

      {tab === 'info'          && <InfoTab cantiere={cantiere} editing={editing} form={form} set={set} utente={utente} />}
      {tab === 'aggiornamenti' && <AggiornnamentiTab cantiereId={id} />}
      {tab === 'team'          && <TeamTab cantiereId={id} utente={utente} />}
      {tab === 'gantt'         && <GanttTab cantiereId={id} />}
      {tab === 'checklist'     && <ChecklistTab cantiereId={id} />}
      {tab === 'diario'        && <DiarioTab cantiereId={id} />}
      {tab === 'mappe'         && <MappeTab cantiereId={id} />}
      {tab === 'economia'      && <EconomiaTab cantiereId={id} />}
      {tab === 'documenti'     && <RaccoltaDocumentiTab cantiereId={id} utente={utente} />}
    </div>
  )
}

/* ─── TAB INFO ─── */
function InfoTab({ cantiere, editing, form, set, utente }) {
  const data = editing ? form : cantiere
  const isStaff = ['admin','capo_cantiere','capo_cantiere_sub','direzione_lavori'].includes(utente?.ruolo)
  const puoVedereEconomia = ['admin','capo_cantiere'].includes(utente?.ruolo)
  const { data: economia } = useQuery(
    ['economia', cantiere.id],
    () => api.get(`/cantieri/${cantiere.id}/economia`).then(r => r.data),
    { staleTime: 30000, enabled: puoVedereEconomia }
  )

  const fmt = v => `€ ${(v || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const valoreCantiere = economia?.budget_preventivo || 0
  const totaleSpese = economia?.totale_speso || 0
  const margine = valoreCantiere - totaleSpese
  const percSpesa = valoreCantiere > 0 ? Math.min(100, (totaleSpese / valoreCantiere) * 100) : 0

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        {editing
          ? <select className="input-field w-40" value={form.stato} onChange={e => set('stato', e.target.value)}>
              {Object.keys(STATO_LABEL).map(s => <option key={s} value={s}>{STATO_LABEL[s]}</option>)}
            </select>
          : <span className={`px-3 py-1 rounded-full text-sm font-medium ${STATO_STYLE[cantiere.stato]}`}>{STATO_LABEL[cantiere.stato]}</span>}
        <span className="text-2xl font-bold text-steelex-orange">{data.avanzamento}%</span>
      </div>

      {/* Barra avanzamento */}
      {editing
        ? <div><label className="text-sm text-gray-500 mb-1 block">Avanzamento: {form.avanzamento}%</label>
            <input type="range" min="0" max="100" step="5" value={form.avanzamento} onChange={e => set('avanzamento', Number(e.target.value))} className="w-full accent-steelex-orange" /></div>
        : <div className="w-full bg-gray-200 rounded-full h-3"><div className="bg-steelex-orange h-3 rounded-full transition-all" style={{ width: `${cantiere.avanzamento}%` }} /></div>}

      {/* Dati cantiere */}
      <div className="grid grid-cols-2 gap-3">
        <InfoField icon="👷" label="Cliente" value={data.cliente || ''} editing={editing} onChange={v => set('cliente', v)} />
        <InfoField icon={<MapPin size={14} />} label="Città" value={data.citta || ''} editing={editing} onChange={v => set('citta', v)} />
        <InfoField icon={<Calendar size={14} />} label="Inizio" type="date" value={data.data_inizio || ''} editing={editing} onChange={v => set('data_inizio', v)} />
        <InfoField icon={<Calendar size={14} />} label="Fine Prevista" type="date" value={data.data_fine_prevista || ''} editing={editing} onChange={v => set('data_fine_prevista', v)} />
      </div>

      {/* Riepilogo economico — solo admin e capo cantiere STEELEX */}
      {!editing && puoVedereEconomia && (
        <div className="border-t border-gray-100 pt-3 space-y-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Economia</p>
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-orange-50 rounded-xl p-3 text-center">
              <p className="text-xs text-gray-500 mb-0.5">Valore cantiere</p>
              <p className="font-bold text-steelex-orange text-sm">{fmt(valoreCantiere)}</p>
            </div>
            <div className="bg-red-50 rounded-xl p-3 text-center">
              <p className="text-xs text-gray-500 mb-0.5">Spese</p>
              <p className="font-bold text-red-600 text-sm">{fmt(totaleSpese)}</p>
            </div>
            <div className={`rounded-xl p-3 text-center ${margine >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
              <p className="text-xs text-gray-500 mb-0.5">Margine</p>
              <p className={`font-bold text-sm ${margine >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmt(margine)}</p>
            </div>
          </div>
          {valoreCantiere > 0 && (
            <div>
              <div className="flex justify-between text-xs text-gray-400 mb-1">
                <span>Spese / Valore</span>
                <span>{percSpesa.toFixed(0)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${percSpesa > 90 ? 'bg-red-500' : percSpesa > 70 ? 'bg-yellow-500' : 'bg-green-500'}`}
                  style={{ width: `${percSpesa}%` }}
                />
              </div>
            </div>
          )}
          {valoreCantiere === 0 && (
            <p className="text-xs text-gray-400 text-center py-1">Nessun preventivo accettato — vai su Economia per crearne uno</p>
          )}
        </div>
      )}

      {(editing || cantiere.note) && (
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Note</label>
          {editing
            ? <textarea className="input-field h-20 resize-none" value={form.note || ''} onChange={e => set('note', e.target.value)} placeholder="Note..." />
            : <p className="text-sm text-gray-700">{cantiere.note}</p>}
        </div>
      )}
    </div>
  )
}

function InfoField({ icon, label, value, editing, onChange, type = 'text', display }) {
  return (
    <div>
      <label className="text-xs text-gray-500 flex items-center gap-1 mb-1">{icon} {label}</label>
      {editing
        ? <input className="input-field py-2 text-sm" type={type} value={value} onChange={e => onChange(e.target.value)} />
        : <p className="text-sm font-medium text-gray-900">{display || value || '—'}</p>}
    </div>
  )
}

/* ─── TAB CHECKLIST ─── */
function ChecklistTab({ cantiereId }) {
  const qc = useQueryClient()
  const [nuovoTesto, setNuovoTesto] = useState('')

  const { data: items = [] } = useQuery(['checklist', cantiereId], () => api.get(`/cantieri/${cantiereId}/checklist`).then(r => r.data))

  const addMutation = useMutation(
    () => api.post(`/cantieri/${cantiereId}/checklist`, { testo: nuovoTesto }),
    { onSuccess: () => { qc.invalidateQueries(['checklist', cantiereId]); setNuovoTesto('') } }
  )
  const toggleMutation = useMutation(
    ({ id, completato }) => api.put(`/cantieri/${cantiereId}/checklist/${id}`, { completato }),
    { onSuccess: () => qc.invalidateQueries(['checklist', cantiereId]) }
  )
  const deleteMutation = useMutation(
    id => api.delete(`/cantieri/${cantiereId}/checklist/${id}`),
    { onSuccess: () => qc.invalidateQueries(['checklist', cantiereId]) }
  )

  const completati = items.filter(i => i.completato).length

  return (
    <div className="space-y-3">
      {items.length > 0 && (
        <div className="card flex items-center gap-3">
          <div className="flex-1 bg-gray-200 rounded-full h-2">
            <div className="bg-green-500 h-2 rounded-full transition-all" style={{ width: `${(completati / items.length) * 100}%` }} />
          </div>
          <span className="text-sm font-medium text-gray-600">{completati}/{items.length}</span>
        </div>
      )}

      {/* Aggiungi item */}
      <div className="flex gap-2">
        <input className="input-field" placeholder="Nuova attività..." value={nuovoTesto}
          onChange={e => setNuovoTesto(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && nuovoTesto && addMutation.mutate()} />
        <button onClick={() => nuovoTesto && addMutation.mutate()} className="btn-primary px-3 py-3"><Plus size={20} /></button>
      </div>

      {items.length === 0
        ? <div className="card text-center py-8 text-gray-400"><CheckSquare size={32} className="mx-auto mb-2 opacity-30" /><p>Nessuna attività</p></div>
        : <div className="space-y-2">
            {items.map(item => (
              <div key={item.id} className={`card flex items-center gap-3 ${item.completato ? 'opacity-60' : ''}`}>
                <button onClick={() => toggleMutation.mutate({ id: item.id, completato: !item.completato })}>
                  {item.completato
                    ? <CheckCircle2 size={24} className="text-green-500 flex-shrink-0" />
                    : <Circle size={24} className="text-gray-300 flex-shrink-0" />}
                </button>
                <span className={`flex-1 text-sm ${item.completato ? 'line-through text-gray-400' : 'text-gray-800'}`}>{item.testo}</span>
                <button onClick={() => deleteMutation.mutate(item.id)} className="p-1 hover:text-red-500 text-gray-300 transition-colors"><Trash2 size={16} /></button>
              </div>
            ))}
          </div>}
    </div>
  )
}

/* ─── TAB VOCE AI ─── */
function VoceAITab({ cantiereId }) {
  const qc = useQueryClient()
  const [stato, setStato] = useState('idle') // idle | recording | processing | done
  const [secondi, setSecondi] = useState(0)
  const [risultato, setRisultato] = useState(null)
  const [salvando, setSalvando] = useState(false)

  const mediaRef = useRef(null)
  const chunksRef = useRef([])
  const timerRef = useRef(null)

  useEffect(() => () => {
    clearInterval(timerRef.current)
    mediaRef.current?.stream?.getTracks().forEach(t => t.stop())
  }, [])

  const avviaRegistrazione = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream, { mimeType: getSupportedMimeType() })
      chunksRef.current = []
      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = () => elaboraAudio(stream)
      recorder.start()
      mediaRef.current = recorder
      setStato('recording')
      setSecondi(0)
      timerRef.current = setInterval(() => setSecondi(s => s + 1), 1000)
    } catch {
      toast.error('Microfono non accessibile. Controlla i permessi del browser.')
    }
  }

  const fermaRegistrazione = () => {
    clearInterval(timerRef.current)
    mediaRef.current?.stop()
  }

  const elaboraAudio = async (stream) => {
    stream.getTracks().forEach(t => t.stop())
    setStato('processing')
    try {
      const mimeType = getSupportedMimeType()
      const ext = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'mp4' : 'webm'
      const blob = new Blob(chunksRef.current, { type: mimeType })
      const fd = new FormData()
      fd.append('file', blob, `audio.${ext}`)
      const r = await api.post('/trascrizioni', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      setRisultato(r.data)
      setStato('done')
    } catch (err) {
      const detail = err.response?.data?.detail || err.message || 'Errore trascrizione'
      toast.error(detail, { duration: 6000 })
      setStato('idle')
    }
  }

  const salvaNelDiario = async () => {
    if (!risultato) return
    setSalvando(true)
    try {
      const oggi = new Date().toISOString().split('T')[0]
      await api.post(`/cantieri/${cantiereId}/diari`, {
        data: oggi,
        attivita: risultato.testo_italiano,
        cantiere_id: Number(cantiereId),
        operai_presenti: 0,
      })
      qc.invalidateQueries(['diari', cantiereId])
      toast.success('Salvato nel diario!')
      setRisultato(null)
      setStato('idle')
    } catch {
      toast.error('Errore salvataggio')
    } finally {
      setSalvando(false)
    }
  }

  const fmt = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  return (
    <div className="space-y-4">
      {/* Pannello registrazione */}
      <div className="card text-center space-y-4 py-6">
        <div className="flex items-center justify-center gap-2 text-gray-500 mb-1">
          <Languages size={18} />
          <span className="text-sm font-medium">Registra in qualsiasi lingua → trascrivo in italiano</span>
        </div>
        <p className="text-xs text-gray-400">Usa anche il 🎙️ nei pin per registrare direttamente sul punto di lavoro</p>

        {stato === 'idle' && (
          <>
            <button onClick={avviaRegistrazione}
              className="mx-auto flex items-center justify-center w-24 h-24 bg-steelex-orange text-white rounded-full shadow-lg hover:bg-orange-600 active:scale-95 transition-all">
              <Mic size={40} />
            </button>
            <p className="text-gray-400 text-sm">Premi per registrare</p>
          </>
        )}

        {stato === 'recording' && (
          <>
            <div className="relative mx-auto w-24 h-24">
              <div className="absolute inset-0 bg-red-100 rounded-full animate-ping opacity-50" />
              <button onClick={fermaRegistrazione}
                className="relative flex items-center justify-center w-24 h-24 bg-red-500 text-white rounded-full shadow-lg hover:bg-red-600 active:scale-95 transition-all">
                <MicOff size={36} />
              </button>
            </div>
            <p className="text-2xl font-mono font-bold text-red-500">{fmt(secondi)}</p>
            <p className="text-gray-400 text-sm">Registrazione in corso… premi per fermare</p>
          </>
        )}

        {stato === 'processing' && (
          <>
            <div className="mx-auto flex items-center justify-center w-24 h-24 bg-gray-100 rounded-full">
              <Loader2 size={40} className="text-steelex-orange animate-spin" />
            </div>
            <p className="text-gray-500 text-sm">Trascrizione in corso con Whisper AI…</p>
          </>
        )}
      </div>

      {/* Risultato trascrizione */}
      {stato === 'done' && risultato && (
        <div className="card space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">
              Rilevato: {risultato.lingua_nome}
            </span>
            {risultato.lingua_rilevata !== 'it' && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-50 text-green-600">
                Tradotto in italiano
              </span>
            )}
          </div>

          {risultato.lingua_rilevata !== 'it' && (
            <div>
              <p className="text-xs text-gray-400 mb-1">Originale ({risultato.lingua_nome})</p>
              <p className="text-sm text-gray-500 italic bg-gray-50 rounded-lg p-3">{risultato.testo_originale}</p>
            </div>
          )}

          <div>
            <p className="text-xs text-gray-400 mb-1">Testo in italiano</p>
            <textarea
              className="input-field h-28 resize-none text-sm"
              value={risultato.testo_italiano}
              onChange={e => setRisultato(r => ({ ...r, testo_italiano: e.target.value }))}
            />
          </div>

          <div className="flex gap-2">
            <button onClick={() => { setRisultato(null); setStato('idle') }} className="btn-secondary flex-1">
              Scarta
            </button>
            <button onClick={salvaNelDiario} disabled={salvando} className="btn-primary flex-1 flex items-center justify-center gap-2">
              {salvando ? <Loader2 size={16} className="animate-spin" /> : <BookOpen size={16} />}
              Salva nel Diario
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── TAB MAPPE ─── */

// Hook: scarica immagine. Se URL pubblica (http) usa direttamente, altrimenti fetch con auth.
function useAuthImage(url) {
  const [src, setSrc] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!url) return
    let objectUrl = null
    setLoading(true)
    setError(false)
    setSrc(null)

    // URL pubblica R2 — usa direttamente
    if (url.startsWith('http')) {
      setSrc(url)
      setLoading(false)
      return
    }

    // URL locale — fetch con Bearer token
    api.get(url, { responseType: 'blob' })
      .then(r => {
        objectUrl = URL.createObjectURL(r.data)
        setSrc(objectUrl)
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))

    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [url])

  return { src, loading, error }
}

const TIPO_PIN = {
  lavorazione: { label: 'Lavorazione', color: '#2563eb', bg: 'bg-blue-100 text-blue-700' },
  criticita:   { label: 'Criticità',   color: '#dc2626', bg: 'bg-red-100 text-red-700'   },
  nota:        { label: 'Nota',        color: '#d97706', bg: 'bg-yellow-100 text-yellow-700' },
}
const STATO_PIN = {
  aperto:        { label: 'Aperto',        bg: 'bg-red-100 text-red-700'    },
  in_lavorazione:{ label: 'In Lavorazione',bg: 'bg-yellow-100 text-yellow-700'},
  risolto:       { label: 'Risolto',       bg: 'bg-green-100 text-green-700' },
}
const ASSEGNATO_LABEL = { admin:'Admin', capo_cantiere:'Capo Cantiere', fornitore:'Fornitore', cliente:'Cliente' }

function MappeTab({ cantiereId }) {
  const { utente } = useAuth()
  const qc = useQueryClient()
  const [docSelezionato, setDocSelezionato] = useState(null)
  const [modalPin, setModalPin] = useState(null)
  const [pinForm, setPinForm] = useState({ tipo: 'lavorazione', nota: '', assegnato_a: 'capo_cantiere', assegnato_a_user_id: null, assegnato_a_nome: null, visibilita: ['admin','capo_cantiere','fornitore'], stato: 'aperto' })
  const [fotePinModal, setFotePinModal] = useState([]) // foto da caricare insieme al pin
  const [pinSelezionato, setPinSelezionato] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [reportTesto, setReportTesto] = useState('')
  const [pinRecStato, setPinRecStato] = useState('idle') // idle | recording | processing (per aggiornamenti)
  const [pinFormRecStato, setPinFormRecStato] = useState('idle') // idle | recording | processing (per nuovo pin)
  const pinRecorderRef = useRef(null)
  const pinChunksRef = useRef([])
  const pinTimerRef = useRef(null)
  const [pinRecSecondi, setPinRecSecondi] = useState(0)
  const [uploadingFoto, setUploadingFoto] = useState(false)
  const imgContainerRef = useRef(null)
  const uploadInputRef = useRef(null)
  const uploadCartellaRef = useRef(null)

  const canWrite   = ['admin','capo_cantiere','capo_cantiere_sub','direzione_lavori'].includes(utente?.ruolo)
  const canContrib = ['admin','capo_cantiere','capo_cantiere_sub','direzione_lavori','fornitore'].includes(utente?.ruolo)

  // Lista utenti per assegnazione pin (solo admin/capo_cantiere)
  const { data: utenti = [] } = useQuery(
    'utenti',
    () => api.get('/utenti').then(r => r.data),
    { enabled: canWrite, staleTime: 60000 }
  )
  const fornitori = utenti.filter(u => u.ruolo === 'fornitore' && u.attivo)

  const { data: docs = [], isLoading } = useQuery(
    ['documenti', cantiereId],
    () => api.get(`/cantieri/${cantiereId}/documenti`).then(r => r.data),
    { enabled: !!utente, retry: 2, staleTime: 0 }
  )

  useEffect(() => {
    if (docSelezionato) {
      const ag = docs.find(d => d.id === docSelezionato.id)
      if (ag) setDocSelezionato(ag)
    }
  }, [docs])

  // Aggiorna pin selezionato con dati freschi
  useEffect(() => {
    if (pinSelezionato && docSelezionato) {
      const pin = (docSelezionato.pin_dati || []).find(p => p.id === pinSelezionato.id)
      if (pin) setPinSelezionato(pin)
    }
  }, [docSelezionato])

  const [uploadProgress, setUploadProgress] = useState(null) // { totale, corrente, nomeFile }

  const uploadMultiMutation = useMutation(
    async (files) => {
      const fileArray = Array.from(files)
      const risultati = []
      for (let i = 0; i < fileArray.length; i++) {
        const file = fileArray[i]
        setUploadProgress({ totale: fileArray.length, corrente: i + 1, nomeFile: file.name })
        try {
          const fd = new FormData()
          fd.append('file', file)
          const r = await api.post(`/cantieri/${cantiereId}/documenti`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
          risultati.push({ ok: true, doc: r.data })
        } catch (e) {
          risultati.push({ ok: false, nome: file.name, errore: e.response?.data?.detail || 'Errore' })
        }
      }
      return risultati
    },
    {
      onSuccess: (risultati) => {
        setUploadProgress(null)
        qc.invalidateQueries(['documenti', cantiereId])
        const ok = risultati.filter(r => r.ok)
        const fail = risultati.filter(r => !r.ok)
        if (ok.length > 0) {
          // Seleziona l'ultimo caricato
          setDocSelezionato(ok[ok.length - 1].doc)
          toast.success(`${ok.length} file caricati!`)
        }
        fail.forEach(f => toast.error(`${f.nome}: ${f.errore}`))
      },
      onError: () => { setUploadProgress(null); toast.error('Errore upload') }
    }
  )
  const deleteMutation = useMutation(
    (docId) => api.delete(`/cantieri/${cantiereId}/documenti/${docId}`),
    { onSuccess: () => { qc.invalidateQueries(['documenti', cantiereId]); setDocSelezionato(null); toast.success('Eliminato') } }
  )

  const salvaPin = async () => {
    if (!docSelezionato || !modalPin || !pinForm.nota.trim()) return
    try {
      const r = await api.post(`/cantieri/${cantiereId}/documenti/${docSelezionato.id}/pin`, { x: modalPin.x, y: modalPin.y, ...pinForm })
      setDocSelezionato(r.data)
      qc.invalidateQueries(['documenti', cantiereId])
      // Seleziona automaticamente il pin appena creato per mostrare il pannello foto/report
      const nuoviPin = r.data.pin_dati || []
      const ultimoPin = nuoviPin[nuoviPin.length - 1]
      // Carica le foto selezionate nel modal
      if (ultimoPin && fotePinModal.length > 0) {
        for (const foto of fotePinModal) {
          const fd = new FormData(); fd.append('file', foto)
          await api.post(`/cantieri/${cantiereId}/documenti/${docSelezionato.id}/pin/${ultimoPin.id}/foto`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
        }
        const rAggiornato = await api.get(`/cantieri/${cantiereId}/documenti`).then(res => res.data.find(d => d.id === docSelezionato.id))
        if (rAggiornato) { setDocSelezionato(rAggiornato); const p = (rAggiornato.pin_dati||[]).find(p=>p.id===ultimoPin.id); if(p) setPinSelezionato(p) }
      } else if (ultimoPin) {
        setPinSelezionato(ultimoPin)
      }
      setFotePinModal([])
      setModalPin(null)
      toast.success('Pin aggiunto!')
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore') }
  }

  const eliminaPin = async (pinId) => {
    try {
      const r = await api.delete(`/cantieri/${cantiereId}/documenti/${docSelezionato.id}/pin/${pinId}`)
      setDocSelezionato(r.data); qc.invalidateQueries(['documenti', cantiereId]); setPinSelezionato(null); toast.success('Pin eliminato')
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore') }
  }

  const aggiornaStato = async (pinId, stato) => {
    try {
      const r = await api.put(`/cantieri/${cantiereId}/documenti/${docSelezionato.id}/pin/${pinId}/stato`, { stato })
      setDocSelezionato(r.data); qc.invalidateQueries(['documenti', cantiereId]); toast.success('Stato aggiornato')
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore') }
  }

  const aggiungiReport = async () => {
    if (!reportTesto.trim() || !pinSelezionato) return
    try {
      const r = await api.post(`/cantieri/${cantiereId}/documenti/${docSelezionato.id}/pin/${pinSelezionato.id}/report`, { testo: reportTesto })
      setDocSelezionato(r.data); qc.invalidateQueries(['documenti', cantiereId]); setReportTesto(''); toast.success('Report aggiunto')
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore') }
  }

  // ── Registrazione vocale nel pin ──
  const avviaPinRec = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = getSupportedMimeType()
      const recorder = new MediaRecorder(stream, { mimeType })
      pinChunksRef.current = []
      recorder.ondataavailable = e => { if (e.data.size > 0) pinChunksRef.current.push(e.data) }
      recorder.onstop = () => elaboraPinAudio(stream)
      recorder.start()
      pinRecorderRef.current = recorder
      setPinRecStato('recording')
      setPinRecSecondi(0)
      pinTimerRef.current = setInterval(() => setPinRecSecondi(s => s + 1), 1000)
    } catch { toast.error('Microfono non accessibile') }
  }
  const fermaPinRec = () => { clearInterval(pinTimerRef.current); pinRecorderRef.current?.stop() }
  const elaboraPinAudio = async (stream) => {
    stream.getTracks().forEach(t => t.stop())
    setPinRecStato('processing')
    try {
      const mimeType = getSupportedMimeType()
      const ext = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'mp4' : 'webm'
      const blob = new Blob(pinChunksRef.current, { type: mimeType })
      const fd = new FormData()
      fd.append('file', blob, `audio.${ext}`)
      const r = await api.post('/trascrizioni', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      setReportTesto(prev => prev ? prev + ' ' + r.data.testo_italiano : r.data.testo_italiano)
      toast.success('Trascritto! Modifica se vuoi, poi premi Invia.')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Errore trascrizione')
    } finally {
      setPinRecStato('idle')
    }
  }
  const fmtPinSec = s => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`

  // Registrazione vocale per il form "Nuovo pin" (testo → nota)
  const avviaPinFormRec = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = getSupportedMimeType()
      const recorder = new MediaRecorder(stream, { mimeType })
      pinChunksRef.current = []
      recorder.ondataavailable = e => { if (e.data.size > 0) pinChunksRef.current.push(e.data) }
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        setPinFormRecStato('processing')
        try {
          const ext = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'mp4' : 'webm'
          const blob = new Blob(pinChunksRef.current, { type: mimeType })
          const fd = new FormData(); fd.append('file', blob, `audio.${ext}`)
          const r = await api.post('/trascrizioni', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
          setPinForm(f => ({ ...f, nota: f.nota ? f.nota + ' ' + r.data.testo_italiano : r.data.testo_italiano }))
          toast.success('Trascritto! Modifica se vuoi, poi premi Aggiungi.')
        } catch (err) { toast.error(err.response?.data?.detail || 'Errore trascrizione') }
        finally { setPinFormRecStato('idle') }
      }
      recorder.start()
      pinRecorderRef.current = recorder
      setPinFormRecStato('recording')
      setPinRecSecondi(0)
      pinTimerRef.current = setInterval(() => setPinRecSecondi(s => s + 1), 1000)
    } catch { toast.error('Microfono non accessibile') }
  }
  const fermaPinFormRec = () => { clearInterval(pinTimerRef.current); pinRecorderRef.current?.stop() }

  const uploadFotoPin = async (file) => {
    if (!pinSelezionato) return
    setUploadingFoto(true)
    try {
      const fd = new FormData(); fd.append('file', file)
      const r = await api.post(`/cantieri/${cantiereId}/documenti/${docSelezionato.id}/pin/${pinSelezionato.id}/foto`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      setDocSelezionato(r.data); qc.invalidateQueries(['documenti', cantiereId]); toast.success('Foto aggiunta')
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore upload foto')
    } finally { setUploadingFoto(false) }
  }

  const onClickMappa = (e) => {
    if (!canWrite) return
    const container = imgContainerRef.current; if (!container) return
    const rect = container.getBoundingClientRect()
    setModalPin({ x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height })
    setPinForm({ tipo: 'lavorazione', nota: '', assegnato_a: 'capo_cantiere', assegnato_a_user_id: null, assegnato_a_nome: null, visibilita: ['admin','capo_cantiere','fornitore'], stato: 'aperto' })
    setFotePinModal([])
    setPinSelezionato(null)
  }

  const supportsPreview = (doc) => ['jpg','jpeg','png','gif','webp','pdf','heic','heif'].includes(doc?.tipo?.toLowerCase())
  const previewUrl = (doc) => `/cantieri/${cantiereId}/documenti/${doc.id}/preview`

  if (isLoading) return <div className="text-center py-8 text-gray-400">Caricamento...</div>

  return (
    <div className="space-y-3">
      {/* Upload multiplo */}
      {canWrite && (
        <div className="space-y-2">
          {/* Input file multiplo */}
          <input ref={uploadInputRef} type="file" className="hidden" accept="image/*,.pdf,.dxf,.dwg" multiple
            onChange={e => { if (e.target.files?.length) { uploadMultiMutation.mutate(e.target.files); e.target.value = '' } }}
            disabled={uploadMultiMutation.isLoading} />
          {/* Input cartella */}
          <input ref={uploadCartellaRef} type="file" className="hidden" webkitdirectory="true" multiple
            onChange={e => { if (e.target.files?.length) { uploadMultiMutation.mutate(e.target.files); e.target.value = '' } }}
            disabled={uploadMultiMutation.isLoading} />

          {uploadMultiMutation.isLoading ? (
            <div className="card flex items-center gap-3 border-2 border-steelex-orange/40 opacity-80">
              <Upload size={20} className="text-steelex-orange flex-shrink-0 animate-bounce" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-gray-800">Caricamento {uploadProgress?.corrente}/{uploadProgress?.totale}…</p>
                <p className="text-xs text-gray-400 truncate">{uploadProgress?.nomeFile}</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => uploadInputRef.current?.click()}
                className="card flex flex-col items-center gap-2 py-4 hover:border-steelex-orange border-2 border-dashed border-gray-200 transition-colors cursor-pointer">
                <Upload size={20} className="text-steelex-orange" />
                <span className="text-xs font-medium text-gray-700">Seleziona file</span>
                <span className="text-xs text-gray-400 text-center">Tieni Ctrl per più file</span>
              </button>
              <button type="button" onClick={() => uploadCartellaRef.current?.click()}
                className="card flex flex-col items-center gap-2 py-4 hover:border-steelex-orange border-2 border-dashed border-gray-200 transition-colors cursor-pointer">
                <FolderOpen size={20} className="text-steelex-orange" />
                <span className="text-xs font-medium text-gray-700">Seleziona cartella</span>
                <span className="text-xs text-gray-400 text-center">Carica tutto il contenuto</span>
              </button>
            </div>
          )}
          {/* Barra progresso */}
          {uploadMultiMutation.isLoading && uploadProgress && (
            <div className="w-full bg-gray-200 rounded-full h-1.5">
              <div
                className="bg-steelex-orange h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${(uploadProgress.corrente / uploadProgress.totale) * 100}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* Lista documenti */}
      {docs.length === 0 ? (
        <div className="card text-center py-8 text-gray-400"><Map size={32} className="mx-auto mb-2 opacity-30" /><p>Nessuna mappa caricata</p></div>
      ) : (
        <div className="space-y-2">
          {docs.map(doc => (
            <div key={doc.id} className={`card flex items-center gap-3 cursor-pointer hover:border-steelex-orange border-2 transition-colors ${docSelezionato?.id === doc.id ? 'border-steelex-orange' : 'border-transparent'}`}
              onClick={() => { setDocSelezionato(docSelezionato?.id === doc.id ? null : doc); setPinSelezionato(null) }}>
              <div className="p-2 bg-gray-100 rounded-lg">{doc.tipo === 'pdf' ? <FileText size={18} className="text-red-500" /> : <Map size={18} className="text-steelex-orange" />}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{doc.nome}</p>
                <p className="text-xs text-gray-400">{doc.tipo?.toUpperCase()} · {doc.pin_dati?.length || 0} pin</p>
              </div>
              {canWrite && (
                <button onClick={e => { e.stopPropagation(); if (confirm('Eliminare?')) deleteMutation.mutate(doc.id) }} className="p-1 text-gray-300 hover:text-red-500 transition-colors"><Trash2 size={16} /></button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Viewer */}
      {docSelezionato && (
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm text-gray-800 truncate">{docSelezionato.nome}</h3>
            <button onClick={() => { setDocSelezionato(null); setPinSelezionato(null) }} className="p-1 text-gray-400"><X size={16} /></button>
          </div>

          {supportsPreview(docSelezionato) ? (<>
            {canWrite && <p className="text-xs text-steelex-orange bg-orange-50 rounded-lg px-3 py-2 flex items-center gap-2"><MapPin size={12} /> Clicca sulla mappa per aggiungere un pin</p>}

            <MappaViewer url={previewUrl(docSelezionato)} nome={docSelezionato.nome}
              pins={docSelezionato.pin_dati || []} canWrite={canWrite}
              pinSelezionato={pinSelezionato}
              onClickMappa={onClickMappa}
              onClickPin={pin => setPinSelezionato(pinSelezionato?.id === pin.id ? null : pin)}
              containerRef={imgContainerRef} />

            {/* Dettaglio pin selezionato */}
            {pinSelezionato && (
              <div className="rounded-xl border-2 space-y-3 overflow-hidden" style={{ borderColor: TIPO_PIN[pinSelezionato.tipo]?.color }}>
                {/* Header pin */}
                <div className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap gap-1">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${TIPO_PIN[pinSelezionato.tipo]?.bg}`}>{TIPO_PIN[pinSelezionato.tipo]?.label}</span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATO_PIN[pinSelezionato.stato]?.bg || 'bg-gray-100 text-gray-600'}`}>{STATO_PIN[pinSelezionato.stato]?.label || pinSelezionato.stato}</span>
                      {pinSelezionato.assegnato_a && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-purple-50 text-purple-700">
                          → {pinSelezionato.assegnato_a_nome || ASSEGNATO_LABEL[pinSelezionato.assegnato_a]}
                        </span>
                      )}
                    </div>
                    {canWrite && (
                      <button onClick={() => eliminaPin(pinSelezionato.id)} className="text-red-400 hover:text-red-600 p-1 flex-shrink-0"><Trash2 size={15} /></button>
                    )}
                  </div>
                  <p className="text-sm text-gray-800 font-medium">{pinSelezionato.nota}</p>
                  {pinSelezionato.autore && <p className="text-xs text-gray-400">Creato da {pinSelezionato.autore}</p>}

                  {/* Cambia stato */}
                  {canWrite && (
                    <div className="flex gap-1 pt-1">
                      {Object.entries(STATO_PIN).map(([k, v]) => (
                        <button key={k} onClick={() => aggiornaStato(pinSelezionato.id, k)}
                          className={`text-xs px-2 py-1 rounded-lg border transition-colors ${pinSelezionato.stato === k ? 'border-steelex-orange bg-orange-50 text-steelex-orange' : 'border-gray-200 text-gray-500 hover:border-gray-400'}`}>
                          {v.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Foto pin */}
                {(pinSelezionato.foto_urls?.length > 0 || canContrib) && (
                  <div className="px-3 space-y-2">
                    {pinSelezionato.foto_urls?.length > 0 && (
                      <div className="flex gap-2 flex-wrap">
                        {pinSelezionato.foto_urls.map((url, i) => (
                          <img key={i} src={url} className="w-20 h-20 object-cover rounded-lg border" alt={`foto ${i+1}`} />
                        ))}
                      </div>
                    )}
                    {canContrib && (
                      <label className={`flex items-center gap-2 text-xs text-steelex-orange cursor-pointer hover:underline ${uploadingFoto ? 'opacity-50' : ''}`}>
                        <Camera size={14} />{uploadingFoto ? 'Caricamento...' : 'Aggiungi foto'}
                        <input type="file" accept="image/*" capture="environment" className="hidden"
                          onChange={e => e.target.files[0] && uploadFotoPin(e.target.files[0])} disabled={uploadingFoto} />
                      </label>
                    )}
                  </div>
                )}

                {/* Reports */}
                <div className="bg-gray-50 px-3 py-3 space-y-2">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Aggiornamenti ({pinSelezionato.reports?.length || 0})</p>
                  {(pinSelezionato.reports || []).map(rep => (
                    <div key={rep.id} className="bg-white rounded-lg p-2 border space-y-0.5">
                      <p className="text-sm text-gray-800">{rep.testo}</p>
                      <p className="text-xs text-gray-400">{rep.autore} · {new Date(rep.data).toLocaleDateString('it-IT')}</p>
                    </div>
                  ))}
                  {canContrib && (
                    <div className="space-y-2 pt-1">
                      {/* Registrazione vocale */}
                      {pinRecStato === 'idle' && (
                        <button onClick={avviaPinRec}
                          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-steelex-orange text-steelex-orange text-sm font-medium hover:bg-orange-50 active:scale-95 transition-all">
                          <Mic size={16} /> 🎙️ Registra aggiornamento vocale
                        </button>
                      )}
                      {pinRecStato === 'recording' && (
                        <button onClick={fermaPinRec}
                          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-500 text-white text-sm font-medium active:scale-95 transition-all">
                          <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                          <MicOff size={16} /> {fmtPinSec(pinRecSecondi)} — Premi per fermare
                        </button>
                      )}
                      {pinRecStato === 'processing' && (
                        <div className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gray-100 text-gray-500 text-sm">
                          <Loader2 size={16} className="animate-spin" /> Trascrizione in corso…
                        </div>
                      )}
                      {/* Campo testo + invio */}
                      <div className="flex gap-2">
                        <input className="input-field text-sm py-2 flex-1" placeholder="Oppure scrivi un aggiornamento..."
                          value={reportTesto} onChange={e => setReportTesto(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && aggiungiReport()} />
                        <button onClick={aggiungiReport} disabled={!reportTesto.trim()} className="btn-primary px-3 py-2 text-sm">Invia</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Legenda pin */}
            {(docSelezionato.pin_dati?.length > 0) && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Pin ({docSelezionato.pin_dati.length})</p>
                {docSelezionato.pin_dati.map(pin => (
                  <button key={pin.id} onClick={() => setPinSelezionato(pinSelezionato?.id === pin.id ? null : pin)}
                    className={`w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-colors ${pinSelezionato?.id === pin.id ? 'bg-gray-100' : 'hover:bg-gray-50'}`}>
                    <MapPin size={14} style={{ color: TIPO_PIN[pin.tipo]?.color, flexShrink: 0 }} fill="currentColor" />
                    <span className="flex-1 truncate text-gray-700">{pin.nota}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full flex-shrink-0 ${STATO_PIN[pin.stato]?.bg || 'bg-gray-100 text-gray-500'}`}>{STATO_PIN[pin.stato]?.label || '—'}</span>
                    {pin.reports?.length > 0 && <span className="text-xs text-gray-400">{pin.reports.length} rep.</span>}
                  </button>
                ))}
              </div>
            )}
          </>) : (
            <div className="text-center py-6 text-gray-400"><FileText size={32} className="mx-auto mb-2 opacity-30" /><p className="text-sm">Formato non supportato</p></div>
          )}
        </div>
      )}

      {/* Modal aggiungi pin */}
      {modalPin && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setModalPin(null)}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 space-y-3 shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-gray-900">Nuovo pin</h3>
            {/* Tipo */}
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(TIPO_PIN).map(([k, v]) => (
                <button key={k} onClick={() => setPinForm(f => ({ ...f, tipo: k }))}
                  className={`py-2.5 rounded-xl text-xs font-medium border-2 transition-colors flex flex-col items-center gap-1 ${pinForm.tipo === k ? 'border-steelex-orange bg-orange-50 text-steelex-orange' : 'border-gray-200 text-gray-600'}`}>
                  {k === 'criticita' ? <AlertTriangle size={15} /> : k === 'lavorazione' ? <Wrench size={15} /> : <MapPin size={15} />}
                  {v.label}
                </button>
              ))}
            </div>
            {/* Descrizione + Registrazione vocale */}
            {pinFormRecStato === 'idle' && (
              <button onClick={avviaPinFormRec}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-steelex-orange text-steelex-orange font-medium hover:bg-orange-50 active:scale-95 transition-all">
                <Mic size={18} /> 🎙️ Registra descrizione vocale
              </button>
            )}
            {pinFormRecStato === 'recording' && (
              <button onClick={fermaPinFormRec}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-red-500 text-white font-medium active:scale-95 transition-all">
                <div className="w-2.5 h-2.5 bg-white rounded-full animate-pulse" />
                <MicOff size={18} /> {fmtPinSec(pinRecSecondi)} — Premi per fermare
              </button>
            )}
            {pinFormRecStato === 'processing' && (
              <div className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gray-100 text-gray-500">
                <Loader2 size={18} className="animate-spin" /> Trascrizione…
              </div>
            )}
            <textarea className="input-field h-20 resize-none" placeholder="Descrizione (o usa il microfono sopra)..." value={pinForm.nota} onChange={e => setPinForm(f => ({ ...f, nota: e.target.value }))} />
            {/* Assegnato a — ruolo */}
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Assegnato a</label>
              <select className="input-field" value={pinForm.assegnato_a} onChange={e => setPinForm(f => ({ ...f, assegnato_a: e.target.value, assegnato_a_user_id: null, assegnato_a_nome: null }))}>
                <option value="capo_cantiere">Capo Cantiere</option>
                <option value="fornitore">Fornitore / Artigiano</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            {/* Se fornitore: selezione utente specifico */}
            {pinForm.assegnato_a === 'fornitore' && (
              <div>
                <label className="text-xs text-gray-500 mb-1 block">
                  Seleziona artigiano specifico <span className="text-gray-400">(opzionale)</span>
                </label>
                {fornitori.length === 0 ? (
                  <p className="text-xs text-gray-400 italic">Nessun fornitore registrato — aggiungili in Utenti</p>
                ) : (
                  <select className="input-field" value={pinForm.assegnato_a_user_id || ''}
                    onChange={e => {
                      const id = e.target.value ? parseInt(e.target.value) : null
                      const user = fornitori.find(u => u.id === id)
                      setPinForm(f => ({ ...f, assegnato_a_user_id: id, assegnato_a_nome: user ? `${user.nome} ${user.cognome}` : null }))
                    }}>
                    <option value="">— Tutti i fornitori —</option>
                    {fornitori.map(u => (
                      <option key={u.id} value={u.id}>{u.nome} {u.cognome}</option>
                    ))}
                  </select>
                )}
              </div>
            )}
            {/* Visibilità */}
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Visibile a</label>
              <div className="flex gap-2 flex-wrap">
                {['admin','capo_cantiere','fornitore','cliente'].map(r => (
                  <button key={r} onClick={() => setPinForm(f => ({
                    ...f, visibilita: f.visibilita.includes(r) ? f.visibilita.filter(x=>x!==r) : [...f.visibilita, r]
                  }))} className={`text-xs px-2 py-1 rounded-lg border transition-colors ${pinForm.visibilita.includes(r) ? 'bg-steelex-orange text-white border-steelex-orange' : 'border-gray-200 text-gray-500'}`}>
                    {ASSEGNATO_LABEL[r]}
                  </button>
                ))}
              </div>
            </div>
            {/* Foto opzionali */}
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Foto (opzionale)</label>
              <label className="flex items-center gap-2 text-sm text-steelex-orange cursor-pointer hover:underline">
                <Camera size={16} />
                {fotePinModal.length > 0 ? `${fotePinModal.length} foto selezionat${fotePinModal.length===1?'a':'e'}` : 'Aggiungi foto'}
                <input type="file" accept="image/*" multiple className="hidden"
                  onChange={e => setFotePinModal(Array.from(e.target.files))} />
              </label>
              {fotePinModal.length > 0 && (
                <div className="flex gap-2 flex-wrap mt-2">
                  {fotePinModal.map((f, i) => (
                    <img key={i} src={URL.createObjectURL(f)} className="w-16 h-16 object-cover rounded-lg border" alt="" />
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setModalPin(null); setFotePinModal([]) }} className="btn-secondary flex-1">Annulla</button>
              <button onClick={salvaPin} disabled={!pinForm.nota.trim()} className="btn-primary flex-1">Aggiungi</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── COMPONENTE VIEWER MAPPA ─── */
function MappaViewer({ url, nome, pins, canWrite, pinSelezionato, onClickMappa, onClickPin, containerRef }) {
  const { src, loading, error } = useAuthImage(url)

  return (
    <div
      ref={containerRef}
      className="relative w-full rounded-xl overflow-hidden border border-gray-200 bg-gray-100 select-none"
      style={{ cursor: canWrite ? 'crosshair' : 'default', minHeight: 120 }}
      onClick={onClickMappa}
    >
      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-gray-400">
          <Loader2 size={28} className="animate-spin text-steelex-orange" />
          <span className="text-sm">Caricamento mappa...</span>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-red-400">
          <FileText size={28} />
          <span className="text-sm">Impossibile caricare la mappa</span>
        </div>
      )}
      {src && (
        <img
          src={src}
          alt={nome}
          className="w-full h-auto block"
          draggable={false}
        />
      )}
      {/* Pin overlay — visibili solo se l'immagine è caricata */}
      {src && pins.map(pin => (
        <button
          key={pin.id}
          onClick={e => { e.stopPropagation(); onClickPin(pin) }}
          style={{
            position: 'absolute',
            left: `calc(${pin.x * 100}% - 14px)`,
            top: `calc(${pin.y * 100}% - 32px)`,
            color: TIPO_PIN[pin.tipo]?.color || '#888',
            filter: pinSelezionato?.id === pin.id
              ? 'drop-shadow(0 0 6px rgba(0,0,0,0.7))'
              : 'drop-shadow(0 2px 3px rgba(0,0,0,0.5))',
            transform: pinSelezionato?.id === pin.id ? 'scale(1.3)' : 'scale(1)',
            transition: 'transform 0.15s, filter 0.15s',
            zIndex: 10,
          }}
          title={pin.nota}
        >
          <MapPin size={28} fill="currentColor" />
        </button>
      ))}
    </div>
  )
}

function getSupportedMimeType() {
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
  return types.find(t => MediaRecorder.isTypeSupported(t)) || 'audio/webm'
}

/* ─── TAB DIARIO ─── */
function DiarioTab({ cantiereId }) {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ data: dayjs().format('YYYY-MM-DD'), attivita: '', meteo: '', operai_presenti: 0 })
  const [uploadingFor, setUploadingFor] = useState(null)
  const [editId, setEditId] = useState(null)       // id nota in modifica
  const [editTesto, setEditTesto] = useState('')    // testo in modifica
  // Stato registrazione vocale
  const [recStato, setRecStato] = useState('idle') // idle | recording | processing
  const [recSecondi, setRecSecondi] = useState(0)
  const mediaRef = useRef(null)
  const chunksRef = useRef([])
  const timerRef = useRef(null)

  const { data: diari = [] } = useQuery(['diari', cantiereId], () => api.get(`/cantieri/${cantiereId}/diari`).then(r => r.data))

  const createMutation = useMutation(
    () => api.post(`/cantieri/${cantiereId}/diari`, { ...form, cantiere_id: Number(cantiereId), operai_presenti: Number(form.operai_presenti) }),
    { onSuccess: () => { qc.invalidateQueries(['diari', cantiereId]); setShowForm(false); toast.success('Diario salvato!') } }
  )

  const updateMutation = useMutation(
    ({ id, attivita, condividi_cliente }) => api.put(`/cantieri/${cantiereId}/diari/${id}`, { attivita, condividi_cliente }),
    { onSuccess: () => { qc.invalidateQueries(['diari', cantiereId]); qc.invalidateQueries(['aggiornamenti-cliente', cantiereId]); setEditId(null) } }
  )

  const deleteMutation = useMutation(
    id => api.delete(`/cantieri/${cantiereId}/diari/${id}`),
    { onSuccess: () => { qc.invalidateQueries(['diari', cantiereId]); toast.success('Nota eliminata') } }
  )

  const uploadFoto = async (diarioId, file) => {
    setUploadingFor(diarioId)
    try {
      const fd = new FormData(); fd.append('file', file)
      await api.post(`/cantieri/${cantiereId}/diari/${diarioId}/foto`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      qc.invalidateQueries(['diari', cantiereId]); toast.success('Foto caricata!')
    } catch { toast.error('Errore upload foto') }
    finally { setUploadingFor(null) }
  }

  // ── Registrazione vocale ──────────────────────────────────────────────────
  const avviaRec = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = getSupportedMimeType()
      const recorder = new MediaRecorder(stream, { mimeType })
      chunksRef.current = []
      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = () => elaboraVoce(stream)
      recorder.start()
      mediaRef.current = recorder
      setRecStato('recording'); setRecSecondi(0)
      timerRef.current = setInterval(() => setRecSecondi(s => s + 1), 1000)
    } catch { toast.error('Microfono non accessibile. Controlla i permessi.') }
  }

  const fermaRec = () => { clearInterval(timerRef.current); mediaRef.current?.stop() }

  const elaboraVoce = async (stream) => {
    stream.getTracks().forEach(t => t.stop())
    setRecStato('processing')
    try {
      const mimeType = getSupportedMimeType()
      const ext = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'mp4' : 'webm'
      const blob = new Blob(chunksRef.current, { type: mimeType })
      const fd = new FormData(); fd.append('file', blob, `audio.${ext}`)
      await api.post(`/cantieri/${cantiereId}/diari/voce`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      qc.invalidateQueries(['diari', cantiereId])
      toast.success('🎙️ Nota vocale salvata nel diario!')
    } catch(err) {
      toast.error(err.response?.data?.detail || 'Errore trascrizione', { duration: 6000 })
    } finally { setRecStato('idle') }
  }

  const fmtSec = s => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`

  // ── Approva voce estratta → registra come spesa o ore ────────────────────
  const approvaVoce = async (diarioId, voce, idx) => {
    try {
      if (voce.tipo === 'ore_extra') {
        await api.post(`/cantieri/${cantiereId}/ore-extra`, {
          operaio_nome: voce.operaio,
          ore: voce.ore,
          attivita: voce.attivita,
          tariffa_oraria: voce.tariffa_oraria,
          diario_id: diarioId,
        })
        toast.success(`Ore ${voce.operaio} registrate!`)
      } else {
        await api.post(`/cantieri/${cantiereId}/spese`, {
          descrizione: voce.descrizione,
          categoria: 'materiali',
          importo: voce.totale || 0,
        })
        toast.success(`${voce.descrizione} aggiunto alle spese!`)
      }
      // Marca come approvato nel diario
      const diario = diari.find(d => d.id === diarioId)
      if (diario?.voci_estratte) {
        const nuoveVoci = diario.voci_estratte.map((v, i) => i === idx ? { ...v, approvato: true } : v)
        await api.put(`/cantieri/${cantiereId}/diari/${diarioId}`, { attivita: diario.attivita })
        qc.invalidateQueries(['diari', cantiereId])
        qc.invalidateQueries(['spese', cantiereId])
        qc.invalidateQueries(['economia', cantiereId])
      }
    } catch(e) { toast.error(e.response?.data?.detail || 'Errore') }
  }

  const METEO = ['☀️ Sole', '⛅ Nuvoloso', '🌧️ Pioggia', '❄️ Neve', '💨 Vento']

  return (
    <div className="space-y-3">
      {/* Header azioni */}
      <div className="flex gap-2">
        <button onClick={() => { setShowForm(!showForm); setRecStato('idle') }}
          className="btn-primary flex-1 flex items-center justify-center gap-2">
          <Plus size={16} /> Nuovo Diario
        </button>
        {/* Pulsante voce */}
        {recStato === 'idle' && (
          <button onClick={avviaRec}
            className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-xl text-sm font-medium hover:bg-red-600 transition-colors"
            title="Registra nota vocale — va direttamente nel diario">
            <Mic size={16} /> Voce
          </button>
        )}
        {recStato === 'recording' && (
          <button onClick={fermaRec}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-medium animate-pulse">
            <MicOff size={16} /> {fmtSec(recSecondi)}
          </button>
        )}
        {recStato === 'processing' && (
          <div className="flex items-center gap-2 px-4 py-2 bg-purple-100 text-purple-700 rounded-xl text-sm font-medium">
            <Loader2 size={16} className="animate-spin" /> Claude...
          </div>
        )}
      </div>

      {/* Form manuale */}
      {showForm && (
        <div className="card space-y-3">
          <h3 className="font-bold text-gray-800">Nuovo Diario Giornaliero</h3>
          <input type="date" className="input-field" value={form.data} onChange={e => setForm(f => ({ ...f, data: e.target.value }))} />
          <textarea className="input-field h-24 resize-none" placeholder="Attività svolte oggi..." value={form.attivita} onChange={e => setForm(f => ({ ...f, attivita: e.target.value }))} />
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-gray-500 mb-1 block">Meteo</label>
              <select className="input-field" value={form.meteo} onChange={e => setForm(f => ({ ...f, meteo: e.target.value }))}>
                <option value="">—</option>
                {METEO.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="w-28">
              <label className="text-xs text-gray-500 mb-1 block">Operai</label>
              <input type="number" min="0" className="input-field" value={form.operai_presenti} onChange={e => setForm(f => ({ ...f, operai_presenti: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowForm(false)} className="btn-secondary flex-1">Annulla</button>
            <button onClick={() => createMutation.mutate()} className="btn-primary flex-1">Salva</button>
          </div>
        </div>
      )}

      {diari.length === 0
        ? <div className="card text-center py-8 text-gray-400"><BookOpen size={32} className="mx-auto mb-2 opacity-30" /><p>Nessun diario</p><p className="text-xs mt-1">Premi "Voce" per registrare direttamente</p></div>
        : diari.map(d => (
          <div key={d.id} className="card space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  {d.fonte === 'voce' && <Mic size={12} className="text-red-400 flex-shrink-0" />}
                  <span className="font-bold text-gray-800 text-sm">{dayjs(d.data).format('dddd D MMMM YYYY')}</span>
                </div>
                {d.autore_nome && <p className="text-xs text-gray-400">{d.autore_nome}</p>}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {d.meteo && <span className="text-sm text-gray-500">{d.meteo}</span>}
                {d.operai_presenti > 0 && <span className="text-sm text-gray-500">👷 {d.operai_presenti}</span>}
                <button onClick={() => { setEditId(d.id); setEditTesto(d.attivita || '') }}
                  className="p-1 text-gray-300 hover:text-steelex-orange transition-colors" title="Modifica">
                  <Edit2 size={14} />
                </button>
                <button onClick={() => { if (window.confirm('Eliminare questa nota?')) deleteMutation.mutate(d.id) }}
                  className="p-1 text-gray-300 hover:text-red-500 transition-colors" title="Elimina">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            {editId === d.id ? (
              <div className="space-y-2">
                <textarea className="input-field h-28 resize-none text-sm w-full" value={editTesto} onChange={e => setEditTesto(e.target.value)} autoFocus />
                <div className="flex gap-2">
                  <button onClick={() => setEditId(null)} className="btn-secondary flex-1 text-sm">Annulla</button>
                  <button onClick={() => updateMutation.mutate({ id: d.id, attivita: editTesto })}
                    disabled={updateMutation.isLoading} className="btn-primary flex-1 text-sm">
                    {updateMutation.isLoading ? 'Salvo...' : 'Salva'}
                  </button>
                </div>
              </div>
            ) : (
              d.attivita && <p className="text-sm text-gray-700 leading-relaxed">{d.attivita}</p>
            )}

            {/* Voci contabilizzabili estratte dalla voce */}
            {d.voci_estratte?.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
                <p className="text-xs font-semibold text-amber-700 flex items-center gap-1">
                  <Wrench size={12} /> Voci da contabilizzare
                </p>
                {d.voci_estratte.map((v, idx) => (
                  <div key={idx} className={`flex items-center justify-between gap-2 py-1.5 border-b border-amber-100 last:border-0 ${v.approvato ? 'opacity-40' : ''}`}>
                    <div className="flex-1 min-w-0">
                      {v.tipo === 'ore_extra' ? (
                        <p className="text-xs font-medium text-gray-800">👷 {v.operaio} — {v.ore}h {v.attivita ? `(${v.attivita})` : ''}</p>
                      ) : (
                        <p className="text-xs font-medium text-gray-800">📦 {v.descrizione} × {v.quantita} {v.um}</p>
                      )}
                      {v.totale > 0 && <p className="text-xs text-gray-500">≈ €{v.totale.toFixed(2)}</p>}
                    </div>
                    {!v.approvato ? (
                      <button onClick={() => approvaVoce(d.id, v, idx)}
                        className="flex-shrink-0 text-xs px-2 py-1 bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-medium whitespace-nowrap">
                        {v.tipo === 'ore_extra' ? '→ Ore' : '→ Spesa'}
                      </button>
                    ) : (
                      <span className="text-xs text-green-600 font-medium flex-shrink-0">✓ Registrato</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Foto */}
            {d.foto_urls?.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {d.foto_urls.map((url, i) => (
                  <img key={i} src={url} className="w-20 h-20 object-cover rounded-lg border" alt={`foto ${i+1}`} />
                ))}
              </div>
            )}

              {/* Spunta condividi cliente */}
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={!!d.condividi_cliente}
                onChange={e => updateMutation.mutate({ id: d.id, attivita: d.attivita, condividi_cliente: e.target.checked })}
                className="w-3.5 h-3.5 accent-steelex-orange" />
              <span className="text-xs text-gray-400">Condividi con cliente</span>
            </label>
          <label className={`flex items-center gap-2 text-sm text-steelex-orange cursor-pointer hover:underline ${uploadingFor===d.id?'opacity-50':''}`}>
              <Camera size={16} />
              {uploadingFor===d.id ? 'Caricamento...' : 'Aggiungi foto'}
              <input type="file" accept="image/*" capture="environment" className="hidden"
                onChange={e => e.target.files[0] && uploadFoto(d.id, e.target.files[0])} disabled={uploadingFor===d.id} />
            </label>
          </div>
        ))}
    </div>
  )
}

/* ─── TAB TEAM ─── */
function TeamTab({ cantiereId, utente }) {
  const qc = useQueryClient()
  const isAdmin = ['admin','capo_cantiere','capo_cantiere_sub','direzione_lavori'].includes(utente?.ruolo)

  const { data: assegnati = [], isLoading } = useQuery(
    ['artigiani', cantiereId],
    () => api.get(`/cantieri/${cantiereId}/artigiani`).then(r => r.data),
  )

  const { data: disponibili = [] } = useQuery(
    ['artigiani-disponibili'],
    () => api.get(`/cantieri/utenti/artigiani`).then(r => r.data),
    { enabled: isAdmin }
  )

  const [selezionato, setSelezionato] = useState('')

  const aggiungi = useMutation(
    (uid) => api.post(`/cantieri/${cantiereId}/artigiani`, { utente_id: uid }),
    { onSuccess: () => { qc.invalidateQueries(['artigiani', cantiereId]); setSelezionato(''); toast.success('Utente assegnato') } }
  )

  const rimuovi = useMutation(
    (uid) => api.delete(`/cantieri/${cantiereId}/artigiani/${uid}`),
    { onSuccess: () => { qc.invalidateQueries(['artigiani', cantiereId]); toast.success('Rimosso') } }
  )

  const assegnatiIds = assegnati.map(a => a.id)
  const nonAssegnati = disponibili.filter(d => !assegnatiIds.includes(d.id))

  const RUOLO_LABEL = { admin: 'Admin', capo_cantiere: 'Capo cantiere', capo_cantiere_sub: 'CC Sub', direzione_lavori: 'Dir. Lavori', artigiano: 'Artigiano', fornitore: 'Fornitore', cliente: 'Cliente' }

  if (isLoading) return <div className="p-4 text-gray-500">Caricamento...</div>

  return (
    <div className="space-y-4">
      <h2 className="font-semibold text-gray-800 flex items-center gap-2"><Users size={16} /> Team assegnato</h2>

      {isAdmin && (
        <div className="flex gap-2">
          <select value={selezionato} onChange={e => setSelezionato(e.target.value)}
            className="flex-1 border rounded-lg px-3 py-2 text-sm">
            <option value="">— Seleziona utente da aggiungere —</option>
            {nonAssegnati.map(u => (
              <option key={u.id} value={u.id}>{u.cognome} {u.nome} ({RUOLO_LABEL[u.ruolo] || u.ruolo})</option>
            ))}
          </select>
          <button onClick={() => selezionato && aggiungi.mutate(Number(selezionato))}
            disabled={!selezionato || aggiungi.isLoading}
            className="flex items-center gap-1 px-4 py-2 bg-steelex-orange text-white rounded-lg text-sm font-medium disabled:opacity-50">
            <UserPlus size={14} /> Aggiungi
          </button>
        </div>
      )}

      {assegnati.length === 0 ? (
        <p className="text-gray-400 text-sm italic">Nessun utente assegnato</p>
      ) : (
        <div className="space-y-2">
          {assegnati.map(a => (
            <div key={a.id} className="flex items-center justify-between bg-white border rounded-lg px-4 py-3">
              <div>
                <span className="font-medium text-gray-800">{a.cognome} {a.nome}</span>
                <span className="ml-2 text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{RUOLO_LABEL[a.ruolo] || a.ruolo}</span>
                <div className="text-xs text-gray-400">{a.email}</div>
              </div>
              {isAdmin && (
                <button onClick={() => rimuovi.mutate(a.id)}
                  className="text-red-400 hover:text-red-600 p-1" title="Rimuovi">
                  <UserMinus size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ─── TAB ARCHIVIO DOCUMENTI ─── */
const CATEGORIE_DOC = {
  progetto:       { label: 'Progetto',       bg: 'bg-blue-100 text-blue-700' },
  strutturale:    { label: 'Strutturale',    bg: 'bg-purple-100 text-purple-700' },
  contratti:      { label: 'Contratti',      bg: 'bg-green-100 text-green-700' },
  autorizzazioni: { label: 'Autorizzazioni', bg: 'bg-yellow-100 text-yellow-700' },
  relazioni:      { label: 'Relazioni',      bg: 'bg-orange-100 text-orange-700' },
  foto:           { label: 'Foto',           bg: 'bg-pink-100 text-pink-700' },
  varie:          { label: 'Varie',          bg: 'bg-gray-100 text-gray-600' },
}

const TIPO_ICONA = { pdf: '📄', dwg: '📐', dxf: '📐', jpg: '🖼', jpeg: '🖼', png: '🖼', xlsx: '📊', xls: '📊', docx: '📝', doc: '📝', zip: '🗜' }

function RaccoltaDocumentiTab({ cantiereId, utente }) {
  const qc = useQueryClient()
  const isStaff = ['admin','capo_cantiere','capo_cantiere_sub','direzione_lavori'].includes(utente?.ruolo)
  const [cerca, setCerca] = useState('')
  const [catFiltro, setCatFiltro] = useState('')
  const [uploading, setUploading] = useState(false)
  const [formUpload, setFormUpload] = useState({ nome: '', categoria: 'varie', descrizione: '' })
  const [fileInAttesa, setFileInAttesa] = useState(null)
  const fileRef = useRef()

  const apiUrl = import.meta.env.VITE_API_URL || ''

  const { data: docs = [], isLoading } = useQuery(
    ['archivio', cantiereId, catFiltro, cerca],
    () => {
      const params = new URLSearchParams()
      if (catFiltro) params.set('categoria', catFiltro)
      if (cerca)    params.set('cerca', cerca)
      return api.get(`/cantieri/${cantiereId}/archivio?${params}`).then(r => r.data)
    },
    { staleTime: 0, keepPreviousData: true }
  )

  const elimina = useMutation(
    (id) => api.delete(`/cantieri/${cantiereId}/archivio/${id}`),
    { onSuccess: () => { qc.invalidateQueries(['archivio', cantiereId]); toast.success('Eliminato') } }
  )

  const selezioneFile = (e) => {
    const f = e.target.files[0]; if (!f) return
    setFileInAttesa(f)
    setFormUpload(p => ({ ...p, nome: f.name.replace(/\.[^.]+$/, '') }))
  }

  const carica = async () => {
    if (!fileInAttesa) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', fileInAttesa)
      const params = new URLSearchParams({ nome: formUpload.nome || fileInAttesa.name, categoria: formUpload.categoria, descrizione: formUpload.descrizione })
      await api.post(`/cantieri/${cantiereId}/archivio?${params}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      qc.invalidateQueries(['archivio', cantiereId])
      setFileInAttesa(null); setFormUpload({ nome: '', categoria: 'varie', descrizione: '' })
      if (fileRef.current) fileRef.current.value = ''
      toast.success('Documento caricato!')
    } catch { toast.error('Errore upload') } finally { setUploading(false) }
  }

  const docPerCategoria = Object.keys(CATEGORIE_DOC).reduce((acc, cat) => {
    const lista = docs.filter(d => d.categoria === cat)
    if (lista.length) acc[cat] = lista
    return acc
  }, {})

  if (isLoading) return <div className="text-center py-8 text-gray-400">Caricamento...</div>

  return (
    <div className="space-y-3">
      {/* Barra ricerca + filtro categoria */}
      <div className="flex gap-2 flex-wrap">
        <div className="flex-1 min-w-[200px] relative">
          <FileText size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input-field pl-8" placeholder="Cerca documento..."
            value={cerca} onChange={e => setCerca(e.target.value)} />
        </div>
        <select className="input-field w-auto" value={catFiltro} onChange={e => setCatFiltro(e.target.value)}>
          <option value="">Tutte le sezioni</option>
          {Object.entries(CATEGORIE_DOC).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        {utente?.ruolo !== 'cliente' && (
          <label className="btn-primary flex items-center gap-1 text-sm px-3 py-2 cursor-pointer">
            <Upload size={14} /> Carica
            <input ref={fileRef} type="file" className="hidden"
              accept=".pdf,.dwg,.dxf,.jpg,.jpeg,.png,.xlsx,.xls,.docx,.doc,.zip"
              onChange={selezioneFile} />
          </label>
        )}
      </div>

      {/* Form upload dopo selezione file */}
      {fileInAttesa && (
        <div className="card border border-steelex-orange/30 space-y-3">
          <p className="font-semibold text-sm text-gray-700">📎 {fileInAttesa.name}</p>
          <input className="input-field" placeholder="Nome documento"
            value={formUpload.nome} onChange={e => setFormUpload(p => ({ ...p, nome: e.target.value }))} />
          <div className="flex gap-2">
            <select className="input-field flex-1" value={formUpload.categoria}
              onChange={e => setFormUpload(p => ({ ...p, categoria: e.target.value }))}>
              {Object.entries(CATEGORIE_DOC).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <input className="input-field" placeholder="Note (opzionale)"
            value={formUpload.descrizione} onChange={e => setFormUpload(p => ({ ...p, descrizione: e.target.value }))} />
          <div className="flex gap-2">
            <button onClick={() => { setFileInAttesa(null); if (fileRef.current) fileRef.current.value = '' }} className="btn-secondary flex-1">Annulla</button>
            <button onClick={carica} disabled={uploading} className="btn-primary flex-1">
              {uploading ? 'Caricamento...' : 'Salva in archivio'}
            </button>
          </div>
        </div>
      )}

      {/* Lista vuota */}
      {docs.length === 0 && !fileInAttesa && (
        <div className="card text-center py-10 text-gray-400">
          <FolderOpen size={32} className="mx-auto mb-2 opacity-30" />
          <p>{cerca || catFiltro ? 'Nessun documento trovato' : 'Archivio vuoto'}</p>
          {utente?.ruolo !== 'cliente' && !cerca && !catFiltro && <p className="text-xs mt-1">Carica disegni, contratti, relazioni e qualsiasi documento di cantiere</p>}
        </div>
      )}

      {/* Documenti raggruppati per categoria (solo se non c'è filtro attivo) */}
      {!catFiltro && !cerca && Object.entries(docPerCategoria).map(([cat, lista]) => (
        <div key={cat}>
          <div className="flex items-center gap-2 mb-2 mt-1">
            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${CATEGORIE_DOC[cat]?.bg}`}>{CATEGORIE_DOC[cat]?.label}</span>
            <span className="text-xs text-gray-400">{lista.length} file</span>
          </div>
          <div className="space-y-1.5">
            {lista.map(doc => <DocRow key={doc.id} doc={doc} apiUrl={apiUrl} isStaff={isStaff} onElimina={() => { if (confirm('Eliminare?')) elimina.mutate(doc.id) }} />)}
          </div>
        </div>
      ))}

      {/* Lista piatta quando c'è ricerca/filtro */}
      {(catFiltro || cerca) && docs.map(doc => (
        <DocRow key={doc.id} doc={doc} apiUrl={apiUrl} isStaff={isStaff} onElimina={() => { if (confirm('Eliminare?')) elimina.mutate(doc.id) }} />
      ))}
    </div>
  )
}

function DocRow({ doc, apiUrl, isStaff, onElimina }) {
  const ext = doc.tipo_file || ''
  const icona = TIPO_ICONA[ext.toLowerCase()] || '📎'
  const cat = CATEGORIE_DOC[doc.categoria]
  const fileUrl = doc.file_url?.startsWith('http') ? doc.file_url : `${apiUrl}${doc.file_url}`
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 bg-white rounded-xl border border-gray-100 hover:border-gray-200 transition-colors group">
      <span className="text-xl flex-shrink-0">{icona}</span>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-800 text-sm truncate">{doc.nome}</p>
        <div className="flex items-center gap-2 mt-0.5">
          {cat && <span className={`text-xs px-1.5 py-0.5 rounded-full ${cat.bg}`}>{cat.label}</span>}
          {doc.descrizione && <span className="text-xs text-gray-400 truncate">{doc.descrizione}</span>}
          <span className="text-xs text-gray-300 ml-auto flex-shrink-0">{new Date(doc.caricato_il).toLocaleDateString('it-IT')}</span>
        </div>
      </div>
      <a href={fileUrl} target="_blank" rel="noreferrer"
        className="p-1.5 text-gray-400 hover:text-blue-600 flex-shrink-0" title="Apri">
        <Download size={14} />
      </a>
      {isStaff && (
        <button onClick={onElimina} className="p-1.5 text-gray-200 hover:text-red-500 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <Trash2 size={14} />
        </button>
      )}
    </div>
  )
}

