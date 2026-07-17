import { useState, useRef, useEffect } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { ArrowLeft, Edit2, Save, X, MapPin, Calendar, Euro, CheckSquare, BookOpen, Plus, Trash2, Camera, CheckCircle2, Circle, Mic, MicOff, Loader2, Languages, Map, Upload, FileText, AlertTriangle, Wrench, BarChart2, Users, UserPlus, UserMinus, FolderOpen, ClipboardCheck, Clock, Download, ThumbsUp, ThumbsDown, MessageSquare, CheckCheck, AlertCircle, HardHat, Minus, Pen, Type, Eraser, RotateCcw, Images, ChevronLeft, ChevronRight } from 'lucide-react'
import EconomiaTab from './EconomiaTab'
import MeteoMappa from '../components/MeteoMappa'
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
  const { hash } = useLocation()
  const qc = useQueryClient()
  const [tab, setTab] = useState(hash ? hash.slice(1) : 'info')
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
      {(() => {
        const ruolo = utente?.ruolo
        const isStaffInterno = ['admin','capo_cantiere','amministrazione'].includes(ruolo)
        const isStaffExt = ['capo_cantiere_sub','direzione_lavori','architetto','responsabile_sicurezza'].includes(ruolo)
        const puoVedereEconomia = ['admin','capo_cantiere','amministrazione','direzione_lavori'].includes(ruolo)

        const tabs = [
          ['info','Info',null],
          ['aggiornamenti','Aggiornamenti',Calendar],
          ...(isStaffInterno || isStaffExt ? [['team','Team',Users]] : []),
          ...(!['cliente','fornitore'].includes(ruolo) ? [
            ['gantt','Gantt',BarChart2],
            ['checklist','Checklist',CheckSquare],
            ['diario','Diario',BookOpen],
            ['mappe','Mappe',Map],
            ['foto','Foto',Images],
          ] : []),
          ...(puoVedereEconomia ? [['economia','Economia',Euro]] : []),
          ...(isStaffInterno || isStaffExt ? [['artigiani','Artigiani',HardHat]] : []),
          ...(isStaffInterno ? [['nc','NC',AlertCircle]] : []),
          ['documenti','Documenti',FolderOpen],
        ]
        return (
          <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1">
            {tabs.map(([key,label,Icon]) => (
              <button key={key} onClick={() => setTab(key)}
                className={`flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap flex-shrink-0 transition-colors ${tab===key ? 'bg-steelex-orange text-white shadow' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {Icon && <Icon size={12} />}{label}
              </button>
            ))}
          </div>
        )
      })()}

      {tab === 'info'          && <InfoTab cantiere={cantiere} editing={editing} form={form} set={set} utente={utente} />}
      {tab === 'aggiornamenti' && <AggiornnamentiTab cantiereId={id} />}
      {tab === 'team'          && <TeamTab cantiereId={id} utente={utente} />}
      {tab === 'gantt'         && <GanttTab cantiereId={id} cantiere={cantiere} />}
      {tab === 'checklist'     && <ChecklistTab cantiereId={id} />}
      {tab === 'diario'        && <DiarioTab cantiereId={id} utente={utente} />}
      {tab === 'mappe'         && <MappeTab cantiereId={id} />}
      {tab === 'foto'          && <FotoTab cantiereId={id} utente={utente} />}

      {tab === 'economia'      && <EconomiaTab cantiereId={id} />}
      {tab === 'artigiani'     && <ArtigianiCantiere cantiereId={id} utente={utente} />}
      {tab === 'nc'            && <NCTab cantiereId={id} utente={utente} />}
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
    <div className="space-y-4">
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
            <input type="range" min="0" max="100" step="5" value={form.avanzamento} onChange={e => set('avanzamento', Number(e.target.value))} className="w-full accent-fr-accent" /></div>
        : <div className="w-full bg-gray-200 rounded-full h-3"><div className="bg-steelex-orange h-3 rounded-full transition-all" style={{ width: `${cantiere.avanzamento}%` }} /></div>}

      {/* Dati cantiere */}
      <div className="grid grid-cols-2 gap-3">
        <InfoField icon="👷" label="Cliente" value={data.cliente || ''} editing={editing} onChange={v => set('cliente', v)} />
        <InfoField icon={<MapPin size={14} />} label="Città" value={data.citta || ''} editing={editing} onChange={v => set('citta', v)} />
        <InfoField icon={<MapPin size={14} />} label="Indirizzo" value={data.indirizzo || ''} editing={editing} onChange={v => set('indirizzo', v)} className="col-span-2" />
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

    {/* Meteo 3 giorni + mappa — sotto la card principale */}
    {!editing && <MeteoMappa cantiere={cantiere} />}
    </div>
  )
}

function InfoField({ icon, label, value, editing, onChange, type = 'text', display, className }) {
  return (
    <div className={className}>
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
      const r = await api.post('/trascrizioni', fd, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 180000 })
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

    // URL R2 pubblica — usa direttamente (no CORS fetch per display)
    if (url.startsWith('http')) {
      setSrc(url)
      setLoading(false)
      return
    }

    // URL locale — fetch con Bearer token
    api.get(url, { responseType: 'blob' })
      .then(blob => {
        objectUrl = URL.createObjectURL(blob.data ?? blob)
        setSrc(objectUrl)
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))

    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [url])

  return { src, loading, error }
}

const TIPO_PIN = {
  lavorazione:       { label: 'Lavorazione',       color: '#2563eb', bg: 'bg-blue-100 text-blue-700' },
  criticita:         { label: 'Criticità',          color: '#dc2626', bg: 'bg-red-100 text-red-700'   },
  nota:              { label: 'Nota',               color: '#d97706', bg: 'bg-yellow-100 text-yellow-700' },
  extra_preventivo:  { label: 'Extra Preventivo ⚠', color: '#ea580c', bg: 'bg-orange-100 text-orange-700' },
}
const STATO_PIN = {
  aperto:        { label: 'Aperto',        bg: 'bg-red-100 text-red-700'    },
  in_lavorazione:{ label: 'In Lavorazione',bg: 'bg-yellow-100 text-yellow-700'},
  risolto:       { label: 'Risolto',       bg: 'bg-green-100 text-green-700' },
}
const ASSEGNATO_LABEL = { admin:'Admin', capo_cantiere:'Capo Cantiere', fornitore:'Fornitore', cliente:'Cliente' }

/* ─── ANNOTATORE FOTO ─── */
function AnnotaFoto({ url, fotoIdx, pinId, docId, cantiereId, onSalva, onChiudi }) {
  const { src: displaySrc, loading: imgLoading } = useAuthImage(url)
  const canvasRef = useRef(null)
  const imgRef = useRef(null)
  const [tool, setTool] = useState('pen')
  const [color, setColor] = useState('#ef4444')
  const [size, setSize] = useState(4)
  const [drawing, setDrawing] = useState(false)
  const [lastPos, setLastPos] = useState(null)
  const [history, setHistory] = useState([])
  const [textInput, setTextInput] = useState('')
  const [textPos, setTextPos] = useState(null)
  const [saving, setSaving] = useState(false)

  const onImgLoad = () => {
    const canvas = canvasRef.current
    const img = imgRef.current
    if (!canvas || !img) return
    canvas.width = img.naturalWidth || img.offsetWidth
    canvas.height = img.naturalHeight || img.offsetHeight
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
  }

  const getPos = (e) => {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY }
  }

  const saveSnapshot = () => {
    const canvas = canvasRef.current
    setHistory(h => [...h, canvas.toDataURL()])
  }

  const undo = () => {
    if (history.length === 0) return
    const prev = history[history.length - 1]
    setHistory(h => h.slice(0, -1))
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const img = new Image()
    img.onload = () => { ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0) }
    img.src = prev
  }

  const onMouseDown = (e) => {
    e.preventDefault()
    if (tool === 'text') {
      const pos = getPos(e)
      setTextPos(pos)
      setTextInput('')
      return
    }
    saveSnapshot()
    setDrawing(true)
    setLastPos(getPos(e))
  }

  const onMouseMove = (e) => {
    e.preventDefault()
    if (!drawing) return
    const pos = getPos(e)
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    ctx.beginPath()
    ctx.moveTo(lastPos.x, lastPos.y)
    ctx.lineTo(pos.x, pos.y)
    ctx.strokeStyle = tool === 'eraser' ? 'rgba(0,0,0,1)' : color
    ctx.lineWidth = tool === 'eraser' ? size * 4 : size
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    if (tool === 'eraser') ctx.globalCompositeOperation = 'destination-out'
    else ctx.globalCompositeOperation = 'source-over'
    ctx.stroke()
    setLastPos(pos)
  }

  const onMouseUp = (e) => { e.preventDefault(); setDrawing(false); setLastPos(null) }

  const confermaText = () => {
    if (!textInput || !textPos) return
    saveSnapshot()
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    ctx.globalCompositeOperation = 'source-over'
    ctx.font = `bold ${size * 6}px sans-serif`
    ctx.fillStyle = color
    ctx.strokeStyle = 'white'
    ctx.lineWidth = size / 2
    ctx.strokeText(textInput, textPos.x, textPos.y)
    ctx.fillText(textInput, textPos.x, textPos.y)
    setTextPos(null)
    setTextInput('')
  }

  const salva = async () => {
    const canvas = canvasRef.current
    if (!canvas || canvas.width === 0 || canvas.height === 0) {
      toast.error('Attendi il caricamento immagine'); return
    }
    setSaving(true)
    try {
      // Invia solo il layer disegno (PNG trasparente) — compositing lato server
      const overlayBlob = await new Promise(res => canvas.toBlob(res, 'image/png'))
      if (!overlayBlob) { toast.error('Errore canvas'); setSaving(false); return }
      const fd = new FormData()
      fd.append('overlay', overlayBlob, 'overlay.png')
      await api.post(
        `/cantieri/${cantiereId}/documenti/${docId}/pin/${pinId}/annota?idx=${fotoIdx}`,
        fd, { headers: { 'Content-Type': 'multipart/form-data' } }
      )
      await onSalva()
    } catch { toast.error('Errore salvataggio') }
    finally { setSaving(false) }
  }

  const COLORS = ['#ef4444','#f97316','#eab308','#22c55e','#3b82f6','#8b5cf6','#ffffff','#000000']

  return (
    <div className="fixed inset-0 bg-black z-[100] flex flex-col" onClick={e => e.stopPropagation()}>
      {/* Toolbar */}
      <div className="bg-gray-900 px-3 py-2 flex items-center gap-2 overflow-x-auto flex-shrink-0">
        <button onClick={onChiudi} className="p-1.5 text-gray-400 hover:text-white flex-shrink-0"><X size={18}/></button>
        <div className="w-px h-6 bg-gray-600 flex-shrink-0"/>
        {/* Strumenti */}
        {[['pen',<Pen size={16}/>],['text',<Type size={16}/>],['eraser',<Eraser size={16}/>]].map(([t, icon]) => (
          <button key={t} onClick={() => setTool(t)}
            className={`p-1.5 rounded-lg flex-shrink-0 ${tool === t ? 'bg-white text-gray-900' : 'text-gray-400 hover:text-white'}`}>
            {icon}
          </button>
        ))}
        <div className="w-px h-6 bg-gray-600 flex-shrink-0"/>
        {/* Colori */}
        {COLORS.map(c => (
          <button key={c} onClick={() => setColor(c)}
            className={`w-6 h-6 rounded-full flex-shrink-0 border-2 transition-all ${color === c ? 'border-white scale-125' : 'border-transparent'}`}
            style={{ background: c }} />
        ))}
        <div className="w-px h-6 bg-gray-600 flex-shrink-0"/>
        {/* Dimensione */}
        <input type="range" min="2" max="20" value={size} onChange={e => setSize(+e.target.value)}
          className="w-20 flex-shrink-0" />
        <div className="w-px h-6 bg-gray-600 flex-shrink-0"/>
        <button onClick={undo} disabled={history.length === 0}
          className="p-1.5 text-gray-400 hover:text-white disabled:opacity-30 flex-shrink-0"><RotateCcw size={16}/></button>
        <div className="flex-1"/>
        <button onClick={salva} disabled={saving}
          className="px-3 py-1.5 bg-steelex-orange text-white rounded-lg text-sm font-medium flex-shrink-0 disabled:opacity-50">
          {saving ? '...' : '💾 Salva'}
        </button>
      </div>

      {/* Canvas area */}
      <div className="flex-1 overflow-auto flex items-center justify-center bg-black relative">
        {imgLoading && (
          <div className="text-gray-400 text-sm flex items-center gap-2">
            <Loader2 size={20} className="animate-spin text-steelex-orange" /> Caricamento...
          </div>
        )}
        <div className="relative" style={{ display: imgLoading ? 'none' : 'inline-block' }}>
          <img ref={imgRef} src={displaySrc || ''} alt=""
            className="max-w-full max-h-[calc(100vh-100px)] block" style={{ userSelect: 'none' }} onLoad={onImgLoad} />
          <canvas ref={canvasRef}
            className="absolute inset-0 w-full h-full"
            style={{ cursor: tool === 'eraser' ? 'cell' : tool === 'text' ? 'text' : 'crosshair', touchAction: 'none' }}
            onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
            onTouchStart={onMouseDown} onTouchMove={onMouseMove} onTouchEnd={onMouseUp}
          />
        </div>
      </div>

      {/* Input testo flottante */}
      {textPos && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 flex gap-2 bg-gray-800 p-2 rounded-xl shadow-xl z-[101]">
          <input autoFocus className="bg-gray-700 text-white px-3 py-1.5 rounded-lg text-sm w-48"
            placeholder="Scrivi testo..." value={textInput}
            onChange={e => setTextInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') confermaText(); if (e.key === 'Escape') setTextPos(null) }} />
          <button onClick={confermaText} className="px-3 py-1.5 bg-steelex-orange text-white rounded-lg text-sm">OK</button>
          <button onClick={() => setTextPos(null)} className="px-2 py-1.5 text-gray-400 hover:text-white"><X size={14}/></button>
        </div>
      )}
    </div>
  )
}

function MappeTab({ cantiereId }) {
  const { utente } = useAuth()
  const qc = useQueryClient()
  const [docSelezionato, setDocSelezionato] = useState(null)
  const [modalPin, setModalPin] = useState(null)
  const [pinForm, setPinForm] = useState({ tipo: 'lavorazione', nota: '', importo: null, assegnato_a: 'capo_cantiere', assegnato_a_user_id: null, assegnato_a_nome: null, visibilita: ['admin','capo_cantiere','fornitore'], stato: 'aperto' })
  const [fotePinModal, setFotePinModal] = useState([]) // foto da caricare insieme al pin
  const [lightbox, setLightbox] = useState(null) // {urls: [], idx: 0}
  const [annotaState, setAnnotaState] = useState(null) // { url, idx }
  const [confirmPending, setConfirmPending] = useState(null) // { messaggio, onConfirm }
  const [pinSelezionato, setPinSelezionato] = useState(null)
  const [editPinMode, setEditPinMode] = useState(false)
  const [editPinForm, setEditPinForm] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [reportTesto, setReportTesto] = useState('')
  const [pinRecStato, setPinRecStato] = useState('idle') // idle | recording | processing (per aggiornamenti)
  const [pinFormRecStato, setPinFormRecStato] = useState('idle') // idle | recording | processing (per nuovo pin)
  const pinRecorderRef = useRef(null)
  const pinChunksRef = useRef([])
  const pinTimerRef = useRef(null)
  const [pinRecSecondi, setPinRecSecondi] = useState(0)
  const [uploadingFotoCount, setUploadingFotoCount] = useState(0) // quante foto in upload parallelo
  const imgContainerRef = useRef(null)
  const uploadInputRef = useRef(null)
  const uploadCartellaRef = useRef(null)

  const canWrite   = ['admin','capo_cantiere','capo_cantiere_sub','direzione_lavori'].includes(utente?.ruolo)
  const canContrib = ['admin','capo_cantiere','capo_cantiere_sub','direzione_lavori','fornitore'].includes(utente?.ruolo)

  // Team del cantiere (per assegnazione pin) — responsabile + assegnati
  const { data: teamAttivo = [] } = useQuery(
    ['team', cantiereId],
    () => api.get(`/cantieri/${cantiereId}/team`).then(r => r.data).catch(() => []),
    { staleTime: 60000 }
  )
  const fornitori = teamAttivo.filter(u => u.ruolo === 'fornitore')
  // Chip visibilità: ogni membro ha il suo chip con nome
  // Ruoli "unici" (admin, capo_cantiere, direzione_lavori) → chip ruolo
  // Ruoli "multipli" (artigiano, fornitore, cliente) → chip per persona
  // Ruoli sempre presenti come chip (indipendentemente dal team)
  const CHIP_RUOLI_FISSI = [
    { key: 'admin',                label: 'Admin' },
    { key: 'capo_cantiere',        label: 'Capo Cantiere' },
    { key: 'capo_cantiere_sub',    label: 'Vice Capo' },
    { key: 'direzione_lavori',     label: 'Dir. Lavori' },
    { key: 'amministrazione',      label: 'Amministrazione' },
  ]
  const RUOLI_FISSI_KEYS = new Set(CHIP_RUOLI_FISSI.map(c => c.key))

  // Chip visibilità: ruoli fissi + persone specifiche del team (fornitori, artigiani, clienti)
  const chipVisibilita = [
    ...CHIP_RUOLI_FISSI,
    ...teamAttivo
      .filter(u => !RUOLI_FISSI_KEYS.has(u.ruolo))
      .map(u => ({ key: `user_${u.id}`, label: `${u.nome} ${u.cognome}` }))
  ]

  // Verifica se una chip key riguarda il cliente (per conferma condivisione)
  const isClienteKey = (key) => {
    if (key.startsWith('user_')) {
      const uid = parseInt(key.replace('user_', ''))
      const u = teamAttivo.find(u => u.id === uid)
      return u?.ruolo === 'cliente'
    }
    return false
  }

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

  const uploadMutation = useMutation(
    async (file) => {
      const fd = new FormData()
      fd.append('file', file)
      return api.post(`/cantieri/${cantiereId}/documenti`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
    },
    {
      onSuccess: (risultati) => {
        qc.invalidateQueries(['documenti', cantiereId])
        const ok = [{ ok: true, doc: risultati.data }]
        const fail = []
        if (ok.length > 0) {
          // Seleziona l'ultimo caricato
          setDocSelezionato(ok[ok.length - 1].doc)
          toast.success(`${ok.length} file caricati!`)
        }
        fail.forEach(f => toast.error(`${f.nome}: ${f.errore}`))
      },
      onError: (err) => toast.error(err.response?.data?.detail || 'Errore upload')
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
      setPinForm(f => ({ ...f, importo: null, nota: '' }))
      qc.invalidateQueries(['extra-preventivo', cantiereId])
      toast.success('Pin aggiunto!')
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore') }
  }

  const eliminaPin = async (pinId) => {
    try {
      const r = await api.delete(`/cantieri/${cantiereId}/documenti/${docSelezionato.id}/pin/${pinId}`)
      setDocSelezionato(r.data); qc.invalidateQueries(['documenti', cantiereId]); setPinSelezionato(null); toast.success('Pin eliminato')
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore') }
  }

  const salvaModificaPin = async () => {
    if (!pinSelezionato || !editPinForm) return
    try {
      const r = await api.patch(`/cantieri/${cantiereId}/documenti/${docSelezionato.id}/pin/${pinSelezionato.id}`, editPinForm)
      setDocSelezionato(r.data)
      qc.invalidateQueries(['documenti', cantiereId])
      const pinAggiornato = (r.data.pin_dati || []).find(p => p.id === pinSelezionato.id)
      if (pinAggiornato) setPinSelezionato(pinAggiornato)
      setEditPinMode(false); setEditPinForm(null)
      toast.success('Pin aggiornato!')
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
      const r = await api.post('/trascrizioni', fd, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 180000 })
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
          const r = await api.post('/trascrizioni', fd, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 180000 })
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

  const uploadFotoPin = async (files) => {
    if (!pinSelezionato) return
    const fileList = Array.from(files)
    if (fileList.length === 0) return
    setUploadingFotoCount(n => n + fileList.length)
    // Upload in background — non blocca l'UI
    Promise.all(fileList.map(async (file) => {
      try {
        const fd = new FormData(); fd.append('file', file)
        const r = await api.post(`/cantieri/${cantiereId}/documenti/${docSelezionato.id}/pin/${pinSelezionato.id}/foto`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
        setDocSelezionato(r.data)
      } catch (e) { toast.error(e.response?.data?.detail || `Errore upload ${file.name}`) }
      finally { setUploadingFotoCount(n => n - 1) }
    })).then(() => {
      qc.invalidateQueries(['documenti', cantiereId])
      toast.success(fileList.length > 1 ? `${fileList.length} foto aggiunte` : 'Foto aggiunta')
    })
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
      {/* Upload singolo */}
      {canWrite && (
        <label className={`card flex items-center gap-3 cursor-pointer hover:border-fr-accent border-2 border-dashed border-gray-200 transition-colors ${uploadMutation.isLoading ? 'opacity-50 pointer-events-none' : ''}`}>
          <Upload size={20} className="text-steelex-orange flex-shrink-0" />
          <div>
            <p className="font-medium text-sm text-gray-800">{uploadMutation.isLoading ? 'Caricamento...' : 'Carica mappa o documento'}</p>
            <p className="text-xs text-gray-400">JPG, PNG, PDF, DXF — max 50MB</p>
          </div>
          <input type="file" className="hidden" accept="image/*,.pdf,.dxf,.dwg"
            onChange={e => { if (e.target.files[0]) uploadMutation.mutate(e.target.files[0]) }}
            disabled={uploadMutation.isLoading} />
        </label>
      )}

      {/* Lista documenti */}
      {docs.length === 0 ? (
        <div className="card text-center py-8 text-gray-400"><Map size={32} className="mx-auto mb-2 opacity-30" /><p>Nessuna mappa caricata</p></div>
      ) : (
        <div className="space-y-2">
          {docs.map(doc => (
            <div key={doc.id} className={`card flex items-center gap-3 cursor-pointer hover:border-fr-accent border-2 transition-colors ${docSelezionato?.id === doc.id ? 'border-fr-accent' : 'border-transparent'}`}
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
                  {!editPinMode ? (
                    <>
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
                          <div className="flex gap-1 flex-shrink-0">
                            <button onClick={() => { setEditPinForm({ tipo: pinSelezionato.tipo, nota: pinSelezionato.nota, assegnato_a: pinSelezionato.assegnato_a, assegnato_a_user_id: pinSelezionato.assegnato_a_user_id, assegnato_a_nome: pinSelezionato.assegnato_a_nome, visibilita: pinSelezionato.visibilita || [] }); setEditPinMode(true) }}
                              className="text-gray-400 hover:text-steelex-orange p-1" title="Modifica"><Edit2 size={14} /></button>
                            <button onClick={() => eliminaPin(pinSelezionato.id)} className="text-red-400 hover:text-red-600 p-1"><Trash2 size={14} /></button>
                          </div>
                        )}
                      </div>
                      <p className="text-sm text-gray-800 font-medium">{pinSelezionato.nota}</p>
                      {pinSelezionato.autore && <p className="text-xs text-gray-400">Creato da {pinSelezionato.autore}</p>}
                      {canWrite && (
                        <div className="flex gap-1 pt-1">
                          {Object.entries(STATO_PIN).map(([k, v]) => (
                            <button key={k} onClick={() => aggiornaStato(pinSelezionato.id, k)}
                              className={`text-xs px-2 py-1 rounded-lg border transition-colors ${pinSelezionato.stato === k ? 'border-fr-accent bg-orange-50 text-steelex-orange' : 'border-gray-200 text-gray-500 hover:border-gray-400'}`}>
                              {v.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    /* Form modifica pin */
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Modifica pin</p>
                      {/* Tipo */}
                      <div className="grid grid-cols-3 gap-1.5">
                        {Object.entries(TIPO_PIN).map(([k, v]) => (
                          <button key={k} type="button" onClick={() => setEditPinForm(f => ({ ...f, tipo: k }))}
                            className={`py-2 rounded-lg text-xs font-medium border-2 transition-colors ${editPinForm.tipo === k ? 'border-fr-accent bg-orange-50 text-steelex-orange' : 'border-gray-200 text-gray-600'}`}>
                            {v.label}
                          </button>
                        ))}
                      </div>
                      {/* Nota */}
                      <textarea className="input-field h-16 resize-none text-sm" value={editPinForm.nota}
                        onChange={e => setEditPinForm(f => ({ ...f, nota: e.target.value }))} />
                      {/* Assegnato a — tutto il team */}
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Assegnato a</label>
                        <select className="input-field text-sm" value={editPinForm.assegnato_a_user_id || editPinForm.assegnato_a || ''}
                          onChange={e => {
                            const val = e.target.value
                            const utente = teamAttivo.find(u => String(u.id) === val)
                            if (utente) {
                              setEditPinForm(f => ({ ...f, assegnato_a: utente.ruolo, assegnato_a_user_id: utente.id, assegnato_a_nome: `${utente.nome} ${utente.cognome}` }))
                            } else {
                              setEditPinForm(f => ({ ...f, assegnato_a: val, assegnato_a_user_id: null, assegnato_a_nome: null }))
                            }
                          }}>
                          <optgroup label="Per ruolo">
                            <option value="admin">Admin</option>
                            <option value="capo_cantiere">Capo Cantiere</option>
                            <option value="fornitore">Tutti i Fornitori</option>
                          </optgroup>
                          {teamAttivo.length > 0 && (
                            <optgroup label="Membro specifico">
                              {teamAttivo.map(u => (
                                <option key={u.id} value={String(u.id)}>{u.nome} {u.cognome} ({u.ruolo.replace('_',' ')})</option>
                              ))}
                            </optgroup>
                          )}
                        </select>
                      </div>
                      {/* Visibilità — per membro specifico */}
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Visibile a</label>
                        <div className="flex gap-1.5 flex-wrap">
                          {chipVisibilita.map(({ key, label }) => (
                            <button key={key} type="button"
                              onClick={() => {
                                const staAggiungendo = !(editPinForm.visibilita?.includes(key))
                                if (staAggiungendo && isClienteKey(key)) {
                                  setConfirmPending({ messaggio: `Stai rendendo questo pin visibile a "${label}". Confermi?`, onConfirm: () => setEditPinForm(f => ({ ...f, visibilita: [...(f.visibilita||[]), key] })) })
                                } else {
                                  setEditPinForm(f => ({ ...f, visibilita: f.visibilita?.includes(key) ? f.visibilita.filter(x=>x!==key) : [...(f.visibilita||[]), key] }))
                                }
                              }}
                              className={`text-xs px-2 py-1 rounded-lg border transition-colors ${editPinForm.visibilita?.includes(key) ? 'bg-steelex-orange text-white border-fr-accent' : 'border-gray-200 text-gray-500'}`}>
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="flex gap-2 pt-1">
                        <button onClick={() => { setEditPinMode(false); setEditPinForm(null) }} className="btn-secondary flex-1 text-sm py-1.5">Annulla</button>
                        <button onClick={salvaModificaPin} className="btn-primary flex-1 text-sm py-1.5">Salva</button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Foto pin */}
                {(pinSelezionato.foto_urls?.length > 0 || canContrib) && (
                  <div className="px-3 space-y-2">
                    {pinSelezionato.foto_urls?.length > 0 && (
                      <div className="flex gap-2 flex-wrap">
                        {pinSelezionato.foto_urls.map((url, i) => (
                          <div key={i} className="relative group">
                            <img src={url} onClick={() => setLightbox({ urls: pinSelezionato.foto_urls, idx: i })}
                              className="w-20 h-20 object-cover rounded-lg border cursor-zoom-in hover:opacity-90 transition-opacity" alt={`foto ${i+1}`} />
                            {canContrib && (
                              <div className="absolute bottom-0.5 right-0.5 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => setAnnotaState({ url, idx: i })}
                                  className="bg-black/60 text-white text-[9px] px-1 py-0.5 rounded flex items-center gap-0.5">
                                  <Pen size={9}/>Annota
                                </button>
                                <button onClick={async () => {
                                  if (!window.confirm('Eliminare questa foto?')) return
                                  const r = await api.delete(`/cantieri/${cantiereId}/documenti/${docSelezionato.id}/pin/${pinSelezionato.id}/foto?idx=${i}`)
                                  setDocSelezionato(r.data)
                                  qc.invalidateQueries(['documenti', cantiereId])
                                }}
                                  className="bg-red-600/80 text-white text-[9px] px-1 py-0.5 rounded flex items-center gap-0.5">
                                  <Trash2 size={9}/>
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {canContrib && (
                      <label className="flex items-center gap-2 text-xs text-steelex-orange cursor-pointer hover:underline">
                        <Camera size={14} />
                        {uploadingFotoCount > 0 ? `⏳ ${uploadingFotoCount} in upload...` : 'Aggiungi foto'}
                        <input type="file" accept="image/*" multiple className="hidden"
                          onChange={e => e.target.files.length && uploadFotoPin(e.target.files)} />
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
                          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-fr-accent text-steelex-orange text-sm font-medium hover:bg-orange-50 active:scale-95 transition-all">
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
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(TIPO_PIN).map(([k, v]) => (
                <button key={k} onClick={() => setPinForm(f => ({ ...f, tipo: k }))}
                  className={`py-2.5 rounded-xl text-xs font-medium border-2 transition-colors flex flex-col items-center gap-1 ${pinForm.tipo === k ? 'border-fr-accent bg-orange-50 text-steelex-orange' : 'border-gray-200 text-gray-600'}`}>
                  {k === 'criticita' ? <AlertTriangle size={15} /> : k === 'lavorazione' ? <Wrench size={15} /> : k === 'extra_preventivo' ? <AlertCircle size={15} className="text-orange-500" /> : <MapPin size={15} />}
                  {v.label}
                </button>
              ))}
            </div>
            {pinForm.tipo === 'extra_preventivo' && (
              <div className="space-y-2">
                <div className="bg-orange-50 border border-orange-300 rounded-xl p-3 text-xs text-orange-800">
                  ⚠️ <strong>Extra preventivo</strong>: verrà inviata una notifica al direttore dei lavori e all'amministrazione. La voce apparirà nella sezione Spese → Extra Preventivo.
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Importo stimato (€)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="es. 1.500,00"
                    className="input-field"
                    value={pinForm.importo || ''}
                    onChange={e => setPinForm(f => ({ ...f, importo: e.target.value ? parseFloat(e.target.value) : null }))}
                  />
                </div>
              </div>
            )}
            {/* Descrizione + Registrazione vocale */}
            {pinFormRecStato === 'idle' && (
              <button onClick={avviaPinFormRec}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-fr-accent text-steelex-orange font-medium hover:bg-orange-50 active:scale-95 transition-all">
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
            {/* Assegnato a — tutto il team */}
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Assegnato a</label>
              <select className="input-field" value={pinForm.assegnato_a_user_id || pinForm.assegnato_a || ''}
                onChange={e => {
                  const val = e.target.value
                  const membro = teamAttivo.find(u => String(u.id) === val)
                  if (membro) {
                    setPinForm(f => ({ ...f, assegnato_a: membro.ruolo, assegnato_a_user_id: membro.id, assegnato_a_nome: `${membro.nome} ${membro.cognome}` }))
                  } else {
                    setPinForm(f => ({ ...f, assegnato_a: val, assegnato_a_user_id: null, assegnato_a_nome: null }))
                  }
                }}>
                <optgroup label="Per ruolo">
                  <option value="admin">Admin</option>
                  <option value="capo_cantiere">Capo Cantiere</option>
                  <option value="fornitore">Tutti i Fornitori</option>
                </optgroup>
                {teamAttivo.length > 0 && (
                  <optgroup label="Membro specifico">
                    {teamAttivo.map(u => (
                      <option key={u.id} value={String(u.id)}>{u.nome} {u.cognome} ({u.ruolo.replace('_',' ')})</option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
            {/* Visibilità — per membro specifico */}
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Visibile a</label>
              <div className="flex gap-2 flex-wrap">
                {chipVisibilita.map(({ key, label }) => (
                  <button key={key} type="button"
                    onClick={() => {
                      const staAggiungendo = !pinForm.visibilita.includes(key)
                      if (staAggiungendo && isClienteKey(key)) {
                        setConfirmPending({ messaggio: `Stai rendendo questo pin visibile a "${label}". Confermi?`, onConfirm: () => setPinForm(f => ({ ...f, visibilita: [...f.visibilita, key] })) })
                      } else {
                        setPinForm(f => ({ ...f, visibilita: f.visibilita.includes(key) ? f.visibilita.filter(x=>x!==key) : [...f.visibilita, key] }))
                      }
                    }}
                    className={`text-xs px-2 py-1 rounded-lg border transition-colors ${pinForm.visibilita.includes(key) ? 'bg-steelex-orange text-white border-fr-accent' : 'border-gray-200 text-gray-500'}`}>
                    {label}
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

      {/* ── Conferma condivisione cliente ── */}
      {confirmPending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
                <AlertTriangle size={20} className="text-steelex-orange" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 text-base">Condivisione con cliente</h3>
                <p className="text-sm text-gray-500 mt-1">{confirmPending.messaggio}</p>
              </div>
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setConfirmPending(null)} className="btn-secondary flex-1">Annulla</button>
              <button onClick={() => { confirmPending.onConfirm(); setConfirmPending(null) }} className="btn-primary flex-1">Sì, condividi</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Lightbox foto (navigabile) ── */}
      {lightbox && (
        <LightboxNav
          urls={lightbox.urls}
          idx={lightbox.idx}
          onClose={() => setLightbox(null)}
          onSetIdx={fn => setLightbox(lb => ({ ...lb, idx: fn(lb.idx) }))}
        />
      )}

      {/* ── Annotazione foto ── */}
      {annotaState && (
        <AnnotaFoto
          url={annotaState.url}
          fotoIdx={annotaState.idx}
          pinId={pinSelezionato?.id}
          docId={docSelezionato?.id}
          cantiereId={cantiereId}
          onSalva={async () => {
            await qc.invalidateQueries(['documenti', cantiereId])
            toast.success('Annotazione salvata')
            setAnnotaState(null)
          }}
          onChiudi={() => setAnnotaState(null)}
        />
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
function DiarioTab({ cantiereId, utente }) {
  const qc = useQueryClient()
  const ruolo = utente?.ruolo
  // Solo admin può scrivere/modificare/eliminare note nel diario direttamente
  const isAdminDiario = ruolo === 'admin'
  const puoInserireNota = ['artigiano', 'fornitore', 'capo_cantiere_sub'].includes(ruolo)
  const puoValidare = ['admin', 'capo_cantiere', 'amministrazione'].includes(ruolo)

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ data: dayjs().format('YYYY-MM-DD'), attivita: '', meteo: '', operai_presenti: 0, extra_preventivo: false, extra_preventivo_nota: '' })
  const [uploadingFor, setUploadingFor] = useState(null)
  const [lightbox, setLightbox] = useState(null) // {urls: [], idx: 0}
  const [confirmDiario, setConfirmDiario] = useState(null) // { id, attivita } da confermare
  const [editId, setEditId] = useState(null)       // id nota in modifica
  const [confermaEliminaId, setConfermaEliminaId] = useState(null)
  const [editTesto, setEditTesto] = useState('')    // testo in modifica
  // Stato registrazione vocale
  const [recStato, setRecStato] = useState('idle') // idle | recording | processing
  const [recSecondi, setRecSecondi] = useState(0)
  const mediaRef = useRef(null)
  const chunksRef = useRef([])
  const timerRef = useRef(null)

  const { data: diari = [] } = useQuery(['diari', cantiereId], () => api.get(`/cantieri/${cantiereId}/diari`).then(r => r.data))
  const validaDiario = useMutation(
    (diarioId) => api.put(`/cantieri/${cantiereId}/diari/${diarioId}/valida`),
    { onSuccess: () => { qc.invalidateQueries(['diari', cantiereId]); toast.success('Voce diario pubblicata!') } }
  )
  const diariBozza = diari.filter(d => d.stato_validazione === 'bozza')
  const diariPubblicati = diari.filter(d => d.stato_validazione !== 'bozza')
  // Rapportini pending dell'utente corrente per questo cantiere (mostrati in trasparenza)
  const { data: mieiRapportini = [] } = useQuery(
    ['rapportini-miei-cantiere', cantiereId],
    () => api.get('/rapportini/miei').then(r => r.data),
    { enabled: !isAdminDiario, staleTime: 30000 }
  )
  const rapportiniPendingQui = mieiRapportini.filter(
    r => r.cantiere_id === Number(cantiereId) && r.stato === 'inviato'
  )
  const { data: noteArtigiani = [] } = useQuery(
    ['note-campo', cantiereId],
    () => api.get(`/cantieri/${cantiereId}/note-campo`).then(r => r.data),
    { enabled: puoInserireNota || puoValidare }
  )
  const [testoNota, setTestoNota] = useState('')
  const [inserendoSpesa, setInserendoSpesa] = useState(null)
  const [spesaForm, setSpesaForm] = useState({ descrizione: '', importo: '', data: dayjs().format('YYYY-MM-DD') })

  const creaNota = useMutation(
    () => api.post(`/cantieri/${cantiereId}/note-campo`, { testo: testoNota }),
    { onSuccess: () => { qc.invalidateQueries(['note-campo', cantiereId]); setTestoNota(''); toast.success('Nota inviata al capocantiere!') } }
  )
  const validaNota = useMutation(
    ({ notaId, stato }) => api.put(`/cantieri/${cantiereId}/note-campo/${notaId}/valida`, { stato }),
    { onSuccess: () => { qc.invalidateQueries(['note-campo', cantiereId]); toast.success('Nota aggiornata') } }
  )
  const spesaDaNota = useMutation(
    ({ notaId, body }) => api.post(`/cantieri/${cantiereId}/note-campo/${notaId}/inserisci-spesa`, body),
    {
      onSuccess: () => {
        qc.invalidateQueries(['note-campo', cantiereId]); qc.invalidateQueries(['spese', cantiereId])
        setInserendoSpesa(null); setSpesaForm({ descrizione: '', importo: '', data: dayjs().format('YYYY-MM-DD') })
        toast.success('Spesa inserita in economia!')
      },
      onError: err => toast.error(err.response?.data?.detail || 'Errore'),
    }
  )

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
    {
      onSuccess: () => { qc.invalidateQueries(['diari', cantiereId]); toast.success('Nota eliminata'); setConfermaEliminaId(null) },
      onError: err => { toast.error(err.response?.data?.detail || 'Errore eliminazione'); setConfermaEliminaId(null) }
    }
  )

  const uploadFoto = async (diarioId, files) => {
    const fileList = Array.from(files)
    if (!fileList.length) return
    setUploadingFor(diarioId)
    try {
      await Promise.all(fileList.map(async (file) => {
        const fd = new FormData(); fd.append('file', file)
        await api.post(`/cantieri/${cantiereId}/diari/${diarioId}/foto`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      }))
      qc.invalidateQueries(['diari', cantiereId])
      toast.success(fileList.length > 1 ? `${fileList.length} foto caricate!` : 'Foto caricata!')
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

  const noteBozza = noteArtigiani.filter(n => n.stato === 'bozza')
  const STATO_NOTA_STYLE = { bozza: 'bg-yellow-100 text-yellow-700', validata: 'bg-blue-100 text-blue-700', pubblicata: 'bg-green-100 text-green-700' }
  const STATO_NOTA_LABEL = { bozza: 'In attesa', validata: 'Validata', pubblicata: 'Pubblicata' }

  return (
    <div className="space-y-3">

      {/* ── PANNELLO NOTE ARTIGIANI / FORNITORI ─────────────────────────── */}

      {/* Form inserimento nota (artigiani/fornitori/capo_sub) */}
      {puoInserireNota && (
        <div className="card border border-yellow-200 bg-yellow-50 space-y-2">
          <p className="text-xs font-semibold text-yellow-800 flex items-center gap-1"><MessageSquare size={13} /> Invia nota al capocantiere</p>
          <textarea className="input-field h-20 resize-none text-sm bg-white" placeholder="Descrivi il lavoro svolto, ore, materiali... (es. 5 ore stuccature pareti nord)"
            value={testoNota} onChange={e => setTestoNota(e.target.value)} />
          <button onClick={() => testoNota.trim() && creaNota.mutate()} disabled={!testoNota.trim() || creaNota.isLoading}
            className="btn-primary w-full text-sm py-2">{creaNota.isLoading ? 'Invio...' : 'Invia nota'}</button>
          {noteArtigiani.length > 0 && (
            <div className="space-y-1 pt-1 border-t border-yellow-200">
              <p className="text-xs text-yellow-700 font-medium">Le mie note:</p>
              {noteArtigiani.map(n => (
                <div key={n.id} className="flex items-center justify-between gap-2 text-xs text-gray-600 py-0.5">
                  <span className="truncate flex-1">{n.testo.substring(0, 60)}{n.testo.length > 60 ? '…' : ''}</span>
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium flex-shrink-0 ${STATO_NOTA_STYLE[n.stato]}`}>{STATO_NOTA_LABEL[n.stato]}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Note in attesa di validazione (capocantiere/admin) */}
      {puoValidare && noteBozza.length > 0 && (
        <div className="card border border-amber-300 bg-amber-50 space-y-2">
          <p className="text-sm font-semibold text-amber-800 flex items-center gap-2">
            <AlertCircle size={15} /> {noteBozza.length} nota/e in attesa di validazione
          </p>
          {noteBozza.map(nota => (
            <div key={nota.id} className="bg-white rounded-xl p-3 space-y-2 border border-amber-100">
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-500 font-medium">{nota.autore_nome} · {nota.creato_il ? dayjs(nota.creato_il).format('D MMM') : ''}</p>
                {nota.spesa_inserita && <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full flex items-center gap-0.5"><CheckCheck size={9} /> Spesa ok</span>}
              </div>
              <p className="text-sm text-gray-800">{nota.testo}</p>
              {/* Azioni validazione */}
              <div className="flex gap-1.5">
                <button onClick={() => validaNota.mutate({ notaId: nota.id, stato: 'validata' })}
                  className="flex-1 py-1 text-xs font-medium rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 flex items-center justify-center gap-1">
                  <ThumbsUp size={11} /> Valida
                </button>
                <button onClick={() => validaNota.mutate({ notaId: nota.id, stato: 'pubblicata' })}
                  className="flex-1 py-1 text-xs font-medium rounded-lg bg-green-50 text-green-700 hover:bg-green-100 flex items-center justify-center gap-1">
                  <CheckCheck size={11} /> Pubblica
                </button>
              </div>
              {/* Inserimento spesa */}
              {!nota.spesa_inserita && (
                inserendoSpesa === nota.id ? (
                  <div className="space-y-1.5 pt-1 border-t border-gray-100">
                    <input className="input-field text-xs" placeholder="Descrizione spesa" value={spesaForm.descrizione} onChange={e => setSpesaForm(f => ({...f, descrizione: e.target.value}))} />
                    <div className="flex gap-1.5">
                      <input className="input-field text-xs" type="number" placeholder="€" value={spesaForm.importo} onChange={e => setSpesaForm(f => ({...f, importo: e.target.value}))} />
                      <input className="input-field text-xs" type="date" value={spesaForm.data} onChange={e => setSpesaForm(f => ({...f, data: e.target.value}))} />
                    </div>
                    <div className="flex gap-1.5">
                      <button onClick={() => setInserendoSpesa(null)} className="flex-1 btn-secondary text-xs py-1">Annulla</button>
                      <button onClick={() => spesaForm.descrizione && spesaForm.importo && spesaDaNota.mutate({ notaId: nota.id, body: { descrizione: spesaForm.descrizione, importo: Number(spesaForm.importo), data: spesaForm.data } })}
                        disabled={!spesaForm.descrizione || !spesaForm.importo} className="flex-1 btn-primary text-xs py-1">→ Economia</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => { setInserendoSpesa(nota.id); setSpesaForm(f => ({...f, descrizione: nota.testo.substring(0, 80)})) }}
                    className="w-full py-1 text-xs text-steelex-orange hover:bg-orange-50 rounded-lg border border-dashed border-fr-accent/50 flex items-center justify-center gap-1">
                    <Euro size={11} /> Inserisci in Economia
                  </button>
                )
              )}
            </div>
          ))}
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────── */}

      {/* Header azioni — solo admin può inserire note direttamente */}
      {isAdminDiario && (
        <div className="flex gap-2">
          <button onClick={() => { setShowForm(!showForm); setRecStato('idle') }}
            className="btn-primary flex-1 flex items-center justify-center gap-2">
            <Plus size={16} /> Nuovo Diario
          </button>
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
      )}

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
          {/* Tag Extra Preventivo */}
          <label className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${form.extra_preventivo ? 'border-orange-400 bg-orange-50' : 'border-gray-200'}`}>
            <input type="checkbox" checked={form.extra_preventivo || false}
              onChange={e => setForm(f => ({ ...f, extra_preventivo: e.target.checked }))}
              className="w-4 h-4 accent-orange-500" />
            <div>
              <p className="text-sm font-medium text-gray-800">⚠️ Extra preventivo</p>
              <p className="text-xs text-gray-500">Notifica DL e amministrazione — aggiungi poi nelle spese</p>
            </div>
          </label>
          {form.extra_preventivo && (
            <input className="input-field" placeholder="Nota extra preventivo (opzionale)..."
              value={form.extra_preventivo_nota || ''}
              onChange={e => setForm(f => ({ ...f, extra_preventivo_nota: e.target.value }))} />
          )}
          <div className="flex gap-2">
            <button onClick={() => setShowForm(false)} className="btn-secondary flex-1">Annulla</button>
            <button onClick={() => createMutation.mutate()} className="btn-primary flex-1">Salva</button>
          </div>
        </div>
      )}

      {/* Bozze da validare (solo capocantiere/admin) */}
      {puoValidare && diariBozza.length > 0 && (
        <div className="card border border-amber-300 bg-amber-50 space-y-2">
          <p className="text-sm font-semibold text-amber-800 flex items-center gap-2">
            <AlertCircle size={15} /> {diariBozza.length} voce/i diario in attesa di validazione
          </p>
          {diariBozza.map(d => (
            <div key={d.id} className="bg-white rounded-xl p-3 space-y-2 border border-amber-100">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-700 flex items-center gap-1">
                    {d.fonte === 'voce' && <Mic size={11} className="text-red-400" />}
                    {d.autore_nome} · {dayjs(d.data).format('D MMM')}
                  </p>
                  <p className="text-xs text-gray-600 mt-0.5">{d.attivita}</p>
                </div>
                <button onClick={() => validaDiario.mutate(d.id)}
                  className="flex-shrink-0 text-xs px-3 py-1.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 flex items-center gap-1">
                  <CheckCheck size={12} />Pubblica
                </button>
              </div>
              {/* Voci contabilizzabili — capocantiere può approvarle anche da bozza */}
              {d.voci_estratte?.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 space-y-1.5">
                  <p className="text-xs font-semibold text-amber-700 flex items-center gap-1">
                    <Wrench size={11} /> Voci da contabilizzare
                  </p>
                  {d.voci_estratte.map((v, idx) => (
                    <div key={idx} className={`flex items-center justify-between gap-2 py-1 border-b border-amber-100 last:border-0 ${v.approvato ? 'opacity-40' : ''}`}>
                      <div className="flex-1 min-w-0">
                        {v.tipo === 'ore_extra'
                          ? <p className="text-xs text-gray-800">👷 {v.operaio} — {v.ore}h {v.attivita ? `(${v.attivita})` : ''}</p>
                          : <p className="text-xs text-gray-800">📦 {v.descrizione} × {v.quantita} {v.um}</p>}
                        {v.totale > 0 && <p className="text-xs text-gray-500">≈ €{v.totale.toFixed(2)}</p>}
                      </div>
                      {!v.approvato
                        ? <button onClick={() => approvaVoce(d.id, v, idx)}
                            className="flex-shrink-0 text-xs px-2 py-1 bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-medium whitespace-nowrap">
                            {v.tipo === 'ore_extra' ? '→ Ore' : '→ Spesa'}
                          </button>
                        : <span className="text-xs text-green-600 font-medium flex-shrink-0">✓ Registrato</span>
                      }
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Rapportini pending (in trasparenza) — solo per il mittente, in attesa di validazione admin */}
      {!isAdminDiario && rapportiniPendingQui.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1">
            <Loader2 size={11} className="animate-spin" /> In attesa di validazione
          </p>
          {rapportiniPendingQui.map(r => (
            <div key={r.id} className="card opacity-50 border border-dashed border-gray-300 space-y-1">
              <div className="flex items-center gap-2">
                <Mic size={12} className="text-gray-400" />
                <span className="text-xs text-gray-500 font-medium">{dayjs(r.creato_il).format('dddd D MMMM YYYY')}</span>
                <span className="text-[10px] bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full ml-auto">In attesa</span>
              </div>
              <p className="text-sm text-gray-500 leading-relaxed">{r.testo_italiano || r.riassunto}</p>
              {r.foto_urls?.length > 0 && (
                <div className="flex gap-1.5 flex-wrap">
                  {r.foto_urls.map((url, i) => (
                    <img key={i} src={url} alt="" className="w-12 h-12 object-cover rounded-lg border border-gray-200 opacity-60" />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {diariPubblicati.length === 0 && diariBozza.length === 0 && rapportiniPendingQui.length === 0
        ? <div className="card text-center py-8 text-gray-400"><BookOpen size={32} className="mx-auto mb-2 opacity-30" /><p>Nessun diario</p><p className="text-xs mt-1">Registra dalla dashboard per aggiungere una nota</p></div>
        : diariPubblicati.map(d => (
          <div key={d.id} className="card space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  {d.fonte === 'voce' && <Mic size={12} className="text-red-400 flex-shrink-0" />}
                  <span className="font-bold text-gray-800 text-sm">{dayjs(d.data).format('dddd D MMMM YYYY')}</span>
                  {d.extra_preventivo && <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">⚠ Extra preventivo</span>}
                </div>
                {d.autore_nome && <p className="text-xs text-gray-400">{d.autore_nome}</p>}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {d.meteo && <span className="text-sm text-gray-500">{d.meteo}</span>}
                {d.operai_presenti > 0 && <span className="text-sm text-gray-500">👷 {d.operai_presenti}</span>}
                {isAdminDiario && (<>
                  <button onClick={() => { setEditId(d.id); setEditTesto(d.attivita || '') }}
                    className="p-1 text-gray-300 hover:text-steelex-orange transition-colors" title="Modifica">
                    <Edit2 size={14} />
                  </button>
                  {confermaEliminaId === d.id ? (
                    <div className="flex items-center gap-1">
                      <button onClick={() => deleteMutation.mutate(d.id)}
                        className="text-xs bg-red-600 text-white px-2 py-0.5 rounded font-semibold">
                        Sì
                      </button>
                      <button onClick={() => setConfermaEliminaId(null)}
                        className="text-xs text-gray-400 hover:text-gray-600 px-1">
                        No
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => setConfermaEliminaId(d.id)}
                      className="p-1 text-gray-300 hover:text-red-500 transition-colors" title="Elimina">
                      <Trash2 size={14} />
                    </button>
                  )}
                </>)}
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
                  <div key={i} className="relative group">
                    <img src={url} onClick={() => setLightbox({ urls: d.foto_urls, idx: i })}
                      className="w-20 h-20 object-cover rounded-lg border cursor-zoom-in hover:opacity-90 transition-opacity" alt={`foto ${i+1}`} />
                    {isAdminDiario && (
                      <button
                        onClick={async () => {
                          try {
                            await api.delete(`/cantieri/${cantiereId}/diari/${d.id}/foto`, { params: { url } })
                            qc.invalidateQueries(['diari', cantiereId])
                          } catch { toast.error('Errore eliminazione foto') }
                        }}
                        className="absolute -top-1.5 -right-1.5 bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow"
                        title="Elimina foto">
                        <X size={10} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

              {/* Spunta condividi cliente */}
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={!!d.condividi_cliente}
                onChange={e => {
                  if (e.target.checked) {
                    setConfirmDiario({ id: d.id, attivita: d.attivita })
                  } else {
                    updateMutation.mutate({ id: d.id, attivita: d.attivita, condividi_cliente: false })
                  }
                }}
                className="w-3.5 h-3.5 accent-fr-accent" />
              <span className="text-xs text-gray-400">Condividi con cliente</span>
            </label>
          <label className={`flex items-center gap-2 text-sm text-steelex-orange cursor-pointer hover:underline ${uploadingFor===d.id?'opacity-50':''}`}>
              <Camera size={16} />
              {uploadingFor===d.id ? 'Caricamento...' : 'Aggiungi foto'}
              <input type="file" accept="image/*" multiple className="hidden"
                onChange={e => e.target.files.length && uploadFoto(d.id, e.target.files)} disabled={uploadingFor===d.id} />
            </label>
          </div>
        ))}

      {/* ── Conferma condivisione diario con cliente ── */}
      {confirmDiario && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
                <AlertTriangle size={20} className="text-steelex-orange" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 text-base">Condivisione con cliente</h3>
                <p className="text-sm text-gray-500 mt-1">Stai per rendere visibile questa nota del diario al cliente. Confermi?</p>
              </div>
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setConfirmDiario(null)} className="btn-secondary flex-1">Annulla</button>
              <button onClick={() => { updateMutation.mutate({ id: confirmDiario.id, attivita: confirmDiario.attivita, condividi_cliente: true }); setConfirmDiario(null) }} className="btn-primary flex-1">Sì, condividi</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Lightbox foto diario (navigabile) ── */}
      {lightbox && (
        <LightboxNav
          urls={lightbox.urls}
          idx={lightbox.idx}
          onClose={() => setLightbox(null)}
          onSetIdx={fn => setLightbox(lb => ({ ...lb, idx: fn(lb.idx) }))}
        />
      )}
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
  sicurezza:         { label: '🦺 Sicurezza',           bg: 'bg-red-100 text-red-700' },
  relazioni_disegni: { label: '📐 Relazioni e Disegni', bg: 'bg-blue-100 text-blue-700' },
  amministrazione:   { label: '📋 Amministrazione',     bg: 'bg-green-100 text-green-700' },
  operativita:       { label: '⚙️ Operatività',         bg: 'bg-orange-100 text-orange-700' },
}

const TIPO_ICONA = { pdf: '📄', dwg: '📐', dxf: '📐', jpg: '🖼', jpeg: '🖼', png: '🖼', xlsx: '📊', xls: '📊', docx: '📝', doc: '📝', zip: '🗜' }

// File di sistema da ignorare nell'upload cartella
const FILE_SISTEMA = new Set(['desktop.ini', 'thumbs.db', '.ds_store', '.localized', 'picasa.ini', 'folder.jpg', 'albumartsmall.jpg'])
function isFileSistema(nome) {
  const n = nome.toLowerCase()
  return n.startsWith('.') || n.startsWith('__macosx') || FILE_SISTEMA.has(n)
}

function RaccoltaDocumentiTab({ cantiereId, utente }) {
  const qc = useQueryClient()
  const isStaff = ['admin','capo_cantiere','capo_cantiere_sub','direzione_lavori'].includes(utente?.ruolo)
  const [cerca, setCerca] = useState('')
  const [catFiltro, setCatFiltro] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(null)
  const [formUpload, setFormUpload] = useState({ nome: '', categoria: 'operativita', descrizione: '' })
  const [fileInAttesa, setFileInAttesa] = useState(null)       // singolo file → form dettagli
  const [filesMulti, setFilesMulti] = useState(null)           // array file → panel categoria
  const [catMulti, setCatMulti] = useState('operativita')
  const [selezionati, setSelezionati] = useState(new Set())    // ID selezionati per delete multiplo
  const fileRef = useRef()
  const cartellaRef = useRef()
  const multiRef = useRef()

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
    { onSuccess: () => { qc.invalidateQueries(['archivio', cantiereId]) } }
  )

  const selezioneFile = (e) => {
    const f = e.target.files[0]; if (!f) return
    setFileInAttesa(f)
    setFormUpload(p => ({ ...p, nome: f.name.replace(/\.[^.]+$/, '') }))
  }

  const onSelezioneMulti = (e) => {
    const tutti = Array.from(e.target.files || [])
    e.target.value = ''
    if (!tutti.length) return
    if (tutti.length === 1) { setFileInAttesa(tutti[0]); setFormUpload(p => ({ ...p, nome: tutti[0].name.replace(/\.[^.]+$/, '') })); return }
    const puliti = tutti.filter(f => !isFileSistema(f.name) && f.size > 0 && f.size <= 50 * 1024 * 1024)
    if (!puliti.length) { toast.error('Nessun file valido trovato'); return }
    setFilesMulti(puliti)
    setCatMulti('varie')
  }

  const onSelezioneCartella = (e) => {
    const tutti = Array.from(e.target.files || [])
    e.target.value = ''
    const puliti = tutti.filter(f => !isFileSistema(f.name) && f.size > 0 && f.size <= 50 * 1024 * 1024)
    if (!puliti.length) { toast.error('Nessun file valido trovato nella cartella'); return }
    setFilesMulti(puliti)
    setCatMulti('varie')
  }

  const caricaMultipli = async () => {
    if (!filesMulti?.length) return
    setFilesMulti(null)
    setUploading(true)
    let caricati = 0
    for (let i = 0; i < filesMulti.length; i++) {
      const f = filesMulti[i]
      setUploadProgress({ corrente: i + 1, totale: filesMulti.length, nomeFile: f.name })
      try {
        const fd = new FormData(); fd.append('file', f)
        const params = new URLSearchParams({ nome: f.name.replace(/\.[^.]+$/, ''), categoria: catMulti, descrizione: '' })
        await api.post(`/cantieri/${cantiereId}/archivio?${params}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
        caricati++
      } catch { toast.error(`Errore: ${f.name}`) }
    }
    setUploading(false); setUploadProgress(null)
    qc.invalidateQueries(['archivio', cantiereId])
    if (caricati > 0) toast.success(`${caricati} file caricati!`)
  }

  const carica = async () => {
    if (!fileInAttesa) return
    setUploading(true)
    try {
      const fd = new FormData(); fd.append('file', fileInAttesa)
      const params = new URLSearchParams({ nome: formUpload.nome || fileInAttesa.name, categoria: formUpload.categoria, descrizione: formUpload.descrizione })
      await api.post(`/cantieri/${cantiereId}/archivio?${params}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      qc.invalidateQueries(['archivio', cantiereId])
      setFileInAttesa(null); setFormUpload({ nome: '', categoria: 'varie', descrizione: '' })
      if (fileRef.current) fileRef.current.value = ''
      toast.success('Documento caricato!')
    } catch { toast.error('Errore upload') } finally { setUploading(false) }
  }

  const eliminaSelezionati = async () => {
    if (!selezionati.size) return
    if (!confirm(`Eliminare ${selezionati.size} document${selezionati.size > 1 ? 'i' : 'o'}?`)) return
    for (const id of selezionati) { try { await api.delete(`/cantieri/${cantiereId}/archivio/${id}`) } catch {} }
    setSelezionati(new Set())
    qc.invalidateQueries(['archivio', cantiereId])
    toast.success('Eliminati')
  }

  const toggleSel = (id) => setSelezionati(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  const tuttiSelezionati = docs.length > 0 && docs.every(d => selezionati.has(d.id))
  const toggleTutti = () => setSelezionati(tuttiSelezionati ? new Set() : new Set(docs.map(d => d.id)))

  const docPerCategoria = Object.keys(CATEGORIE_DOC).reduce((acc, cat) => {
    const lista = docs.filter(d => d.categoria === cat)
    if (lista.length) acc[cat] = lista
    return acc
  }, {})

  if (isLoading) return <div className="text-center py-8 text-gray-400">Caricamento...</div>

  return (
    <div className="space-y-3">
      {/* Barra ricerca + filtro + pulsanti upload */}
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
        {isStaff && (
          <>
            <input ref={fileRef} type="file" className="hidden"
              accept=".pdf,.dwg,.dxf,.jpg,.jpeg,.png,.xlsx,.xls,.docx,.doc,.zip"
              onChange={selezioneFile} />
            <input ref={multiRef} type="file" className="hidden" multiple
              accept=".pdf,.dwg,.dxf,.jpg,.jpeg,.png,.xlsx,.xls,.docx,.doc,.zip"
              onChange={onSelezioneMulti} disabled={uploading} />
            <input ref={cartellaRef} type="file" className="hidden" webkitdirectory="true" multiple
              onChange={onSelezioneCartella} disabled={uploading} />
            <button type="button" disabled={uploading} onClick={() => multiRef.current?.click()}
              className="btn-primary flex items-center gap-1 text-sm px-3 py-2">
              <Upload size={14} /> {uploading ? `${uploadProgress?.corrente}/${uploadProgress?.totale}` : 'Carica'}
            </button>
            <button type="button" disabled={uploading} onClick={() => cartellaRef.current?.click()}
              className="btn-secondary flex items-center gap-1 text-sm px-3 py-2">
              <FolderOpen size={14} /> Cartella
            </button>
          </>
        )}
      </div>

      {/* Barra progresso */}
      {uploading && uploadProgress && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-gray-500">
            <span className="truncate max-w-[80%]">{uploadProgress.nomeFile}</span>
            <span>{uploadProgress.corrente}/{uploadProgress.totale}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-1.5">
            <div className="bg-steelex-orange h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${(uploadProgress.corrente / uploadProgress.totale) * 100}%` }} />
          </div>
        </div>
      )}

      {/* Panel conferma upload multiplo — scegli sezione */}
      {filesMulti && (
        <div className="card border border-fr-accent/40 space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-sm text-gray-700">📂 {filesMulti.length} file selezionati</p>
            <button onClick={() => setFilesMulti(null)} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
          </div>
          <div className="max-h-32 overflow-y-auto space-y-1">
            {filesMulti.map((f, i) => <p key={i} className="text-xs text-gray-500 truncate">• {f.name}</p>)}
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Sezione per tutti i file</label>
            <select className="input-field w-full" value={catMulti} onChange={e => setCatMulti(e.target.value)}>
              {Object.entries(CATEGORIE_DOC).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setFilesMulti(null)} className="btn-secondary flex-1">Annulla</button>
            <button onClick={caricaMultipli} className="btn-primary flex-1">Carica tutti</button>
          </div>
        </div>
      )}

      {/* Form upload singolo file */}
      {fileInAttesa && (
        <div className="card border border-fr-accent/30 space-y-3">
          <p className="font-semibold text-sm text-gray-700">📎 {fileInAttesa.name}</p>
          <input className="input-field" placeholder="Nome documento"
            value={formUpload.nome} onChange={e => setFormUpload(p => ({ ...p, nome: e.target.value }))} />
          <select className="input-field w-full" value={formUpload.categoria}
            onChange={e => setFormUpload(p => ({ ...p, categoria: e.target.value }))}>
            {Object.entries(CATEGORIE_DOC).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
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

      {/* Barra selezione multipla */}
      {isStaff && docs.length > 0 && !fileInAttesa && !filesMulti && (
        <div className="flex items-center gap-3 px-1">
          <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-500 select-none">
            <input type="checkbox" checked={tuttiSelezionati} onChange={toggleTutti}
              className="w-4 h-4 accent-fr-accent" />
            {tuttiSelezionati ? 'Deseleziona tutto' : 'Seleziona tutto'}
          </label>
          {selezionati.size > 0 && (
            <button onClick={eliminaSelezionati}
              className="ml-auto flex items-center gap-1 text-xs text-red-500 hover:text-red-700 font-medium">
              <Trash2 size={13} /> Elimina {selezionati.size} selezionat{selezionati.size > 1 ? 'i' : 'o'}
            </button>
          )}
        </div>
      )}

      {/* Lista vuota */}
      {docs.length === 0 && !fileInAttesa && !filesMulti && (
        <div className="card text-center py-10 text-gray-400">
          <FolderOpen size={32} className="mx-auto mb-2 opacity-30" />
          <p>{cerca || catFiltro ? 'Nessun documento trovato' : 'Archivio vuoto'}</p>
          {isStaff && !cerca && !catFiltro && <p className="text-xs mt-1">Carica disegni, contratti, relazioni e qualsiasi documento di cantiere</p>}
        </div>
      )}

      {/* Documenti raggruppati per categoria */}
      {!catFiltro && !cerca && Object.entries(docPerCategoria).map(([cat, lista]) => (
        <div key={cat}>
          <div className="flex items-center gap-2 mb-2 mt-1">
            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${CATEGORIE_DOC[cat]?.bg}`}>{CATEGORIE_DOC[cat]?.label}</span>
            <span className="text-xs text-gray-400">{lista.length} file</span>
          </div>
          <div className="space-y-1.5">
            {lista.map(doc => (
              <DocRow key={doc.id} doc={doc} apiUrl={apiUrl} isStaff={isStaff}
                selezionato={selezionati.has(doc.id)} onToggleSel={() => toggleSel(doc.id)}
                onElimina={() => { if (confirm('Eliminare?')) elimina.mutate(doc.id) }} />
            ))}
          </div>
        </div>
      ))}

      {/* Lista piatta con ricerca/filtro */}
      {(catFiltro || cerca) && docs.map(doc => (
        <DocRow key={doc.id} doc={doc} apiUrl={apiUrl} isStaff={isStaff}
          selezionato={selezionati.has(doc.id)} onToggleSel={() => toggleSel(doc.id)}
          onElimina={() => { if (confirm('Eliminare?')) elimina.mutate(doc.id) }} />
      ))}
    </div>
  )
}

function DocRow({ doc, apiUrl, isStaff, onElimina, selezionato, onToggleSel }) {
  const ext = doc.tipo_file || ''
  const icona = TIPO_ICONA[ext.toLowerCase()] || '📎'
  const cat = CATEGORIE_DOC[doc.categoria]
  const fileUrl = doc.file_url?.startsWith('http') ? doc.file_url : `${apiUrl}${doc.file_url}`
  return (
    <div className={`flex items-center gap-3 px-3 py-2.5 bg-white rounded-xl border transition-colors group ${selezionato ? 'border-fr-accent bg-orange-50' : 'border-gray-100 hover:border-gray-200'}`}>
      {isStaff && (
        <input type="checkbox" checked={selezionato} onChange={onToggleSel}
          className="w-4 h-4 accent-fr-accent flex-shrink-0 cursor-pointer" />
      )}
      <span className="text-xl flex-shrink-0">{icona}</span>
      <a href={fileUrl} target="_blank" rel="noreferrer" className="flex-1 min-w-0 hover:text-steelex-orange transition-colors">
        <p className="font-medium text-gray-800 text-sm truncate hover:text-steelex-orange">{doc.nome}</p>
        <div className="flex items-center gap-2 mt-0.5">
          {cat && <span className={`text-xs px-1.5 py-0.5 rounded-full ${cat.bg}`}>{cat.label}</span>}
          {doc.descrizione && <span className="text-xs text-gray-400 truncate">{doc.descrizione}</span>}
          <span className="text-xs text-gray-300 ml-auto flex-shrink-0">{new Date(doc.caricato_il).toLocaleDateString('it-IT')}</span>
        </div>
      </a>
      {isStaff && (
        <button onClick={onElimina} className="p-1.5 text-gray-200 hover:text-red-500 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <Trash2 size={14} />
        </button>
      )}
    </div>
  )
}


// ─── TAB ARTIGIANI DEL CANTIERE ───────────────────────────────────────────────

const VOTO_CFG = {
  su:    { label: 'Positivo', icon: ThumbsUp,   color: 'text-green-600',  bg: 'bg-green-100'  },
  medio: { label: 'Neutro',   icon: Minus,      color: 'text-yellow-600', bg: 'bg-yellow-100' },
  giu:   { label: 'Negativo', icon: ThumbsDown, color: 'text-red-500',    bg: 'bg-red-100'    },
}

function ArtigianiCantiere({ cantiereId, utente }) {
  const qc = useQueryClient()
  const puoScrivere = ['admin','capo_cantiere','capo_cantiere_sub','direzione_lavori','amministrazione'].includes(utente?.ruolo)
  const [showForm, setShowForm] = useState(false)
  const [artigianoSel, setArtigianoSel] = useState('')
  const [voto, setVoto] = useState('su')
  const [nota, setNota] = useState('')

  const { data: artigianiCantiere = [] } = useQuery(
    ['artigiani-cantiere', cantiereId],
    () => api.get(`/artigiani?cantiere_id=${cantiereId}`).then(r => r.data),
  )
  const { data: tuttiArtigiani = [] } = useQuery(
    'artigiani-tutti',
    () => api.get('/artigiani').then(r => r.data),
    { enabled: showForm }
  )

  const feedbackMutation = useMutation(
    ({ id, body }) => api.post(`/artigiani/${id}/feedback`, body),
    {
      onSuccess: () => {
        qc.invalidateQueries(['artigiani-cantiere', cantiereId])
        setShowForm(false); setArtigianoSel(''); setVoto('su'); setNota('')
        toast.success('Feedback salvato!')
      },
      onError: e => toast.error(e.response?.data?.detail || 'Errore'),
    }
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-800">Artigiani di questo cantiere</h3>
          <p className="text-xs text-gray-500 mt-0.5">Valutazioni lasciate su questo cantiere</p>
        </div>
        {puoScrivere && (
          <button onClick={() => setShowForm(!showForm)}
            className="btn-primary text-sm py-1.5 px-3 flex items-center gap-1.5">
            <Plus size={14} /> Valuta
          </button>
        )}
      </div>

      {showForm && (
        <div className="card border-2 border-fr-accent/30 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">Nuova valutazione artigiano</h4>
            <button onClick={() => setShowForm(false)}><X size={16} className="text-gray-400" /></button>
          </div>
          <select className="input-field text-sm" value={artigianoSel} onChange={e => setArtigianoSel(e.target.value)}>
            <option value="">— Seleziona artigiano —</option>
            {tuttiArtigiani.map(a => (
              <option key={a.id} value={a.id}>{a.nome} {a.cognome}{a.azienda ? ` (${a.azienda})` : ''} — {a.categoria_label || a.categoria}</option>
            ))}
          </select>
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(VOTO_CFG).map(([v, cfg]) => {
              const Icon = cfg.icon
              return (
                <button key={v} onClick={() => setVoto(v)}
                  className={`py-3 rounded-xl flex flex-col items-center gap-1 border-2 transition-all ${voto === v ? `${cfg.bg} border-current ${cfg.color}` : 'bg-white border-gray-200 text-gray-400'}`}>
                  <Icon size={20} /><span className="text-xs font-medium">{cfg.label}</span>
                </button>
              )
            })}
          </div>
          <textarea className="input-field text-sm h-14 resize-none" placeholder="Nota (opzionale)..."
            value={nota} onChange={e => setNota(e.target.value)} />
          <button
            disabled={!artigianoSel || feedbackMutation.isLoading}
            onClick={() => feedbackMutation.mutate({ id: parseInt(artigianoSel), body: { voto, nota: nota || null, cantiere_id: parseInt(cantiereId) } })}
            className="btn-primary w-full py-2.5 text-sm">
            {feedbackMutation.isLoading ? 'Salvataggio...' : 'Salva valutazione'}
          </button>
        </div>
      )}

      {artigianiCantiere.length === 0 ? (
        <div className="card text-center py-10 text-gray-400">
          <p className="text-3xl mb-2">👷</p>
          <p className="font-medium text-sm">Nessuna valutazione per questo cantiere</p>
          {puoScrivere && <p className="text-xs mt-1">Clicca "Valuta" per aggiungere un artigiano</p>}
        </div>
      ) : (
        <div className="space-y-2">
          {artigianiCantiere.map(a => {
            const scoreColor = a.score === null ? 'bg-gray-300' : a.score >= 75 ? 'bg-green-500' : a.score >= 45 ? 'bg-yellow-500' : 'bg-red-500'
            return (
              <div key={a.id} className="card flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0 ${scoreColor}`}>
                  {a.score ?? '—'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-gray-900">{a.nome} {a.cognome}</p>
                  <p className="text-xs text-gray-500">{a.categoria_label || a.categoria}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-green-600">👍{a.su}</span>
                    <span className="text-xs text-yellow-600">👌{a.medio}</span>
                    <span className="text-xs text-red-500">👎{a.giu}</span>
                    <span className="text-xs text-gray-400">· score globale {a.score ?? 'N/D'}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ─── TAB NON CONFORMITÀ ─── */
function NCTab({ cantiereId, utente }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({ descrizione: '', responsabile_id: '', scadenza: '', foto_url: '' })
  const [apriForm, setApriForm] = useState(false)
  const [chiudiId, setChiudiId] = useState(null)
  const [notaChiusura, setNotaChiusura] = useState('')

  const { data: ncs = [], isLoading } = useQuery(['nc', cantiereId], () =>
    api.get(`/non-conformita/cantiere/${cantiereId}`).then(r => r.data))
  const { data: team = [] } = useQuery(['team', cantiereId], () =>
    api.get(`/cantieri/${cantiereId}/team`).then(r => r.data).catch(() => []))

  const crea = useMutation(body => api.post('/non-conformita', body), {
    onSuccess: () => { qc.invalidateQueries(['nc', cantiereId]); setApriForm(false); setForm({ descrizione: '', responsabile_id: '', scadenza: '', foto_url: '' }); toast.success('NC registrata') }
  })
  const chiudi = useMutation(({ id, nota }) => api.post(`/non-conformita/${id}/chiudi`, { nota_chiusura: nota }), {
    onSuccess: () => { qc.invalidateQueries(['nc', cantiereId]); setChiudiId(null); setNotaChiusura(''); toast.success('NC chiusa') }
  })

  const aperte = ncs.filter(n => n.stato === 'aperta')
  const chiuse = ncs.filter(n => n.stato === 'chiusa')
  const canWrite = ['admin','capo_cantiere','capo_cantiere_sub','direzione_lavori','amministrazione'].includes(utente?.ruolo)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-3 text-sm">
          <span className="font-bold text-red-600">{aperte.length} aperte</span>
          <span className="text-gray-400">{chiuse.length} chiuse</span>
        </div>
        {canWrite && (
          <button onClick={() => setApriForm(!apriForm)}
            className="flex items-center gap-1 px-3 py-2 bg-red-600 text-white rounded-lg text-sm font-medium">
            <Plus size={14} /> Nuova NC
          </button>
        )}
      </div>

      {apriForm && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3">
          <textarea placeholder="Descrivi il problema *" rows={3}
            className="w-full border border-red-200 rounded-lg px-3 py-2 text-sm resize-none"
            value={form.descrizione} onChange={e => setForm(f => ({ ...f, descrizione: e.target.value }))} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Responsabile chiusura</label>
              <select className="w-full border rounded-lg px-3 py-2 text-sm"
                value={form.responsabile_id} onChange={e => setForm(f => ({ ...f, responsabile_id: e.target.value }))}>
                <option value="">— nessuno —</option>
                {team.map(u => <option key={u.id} value={u.id}>{u.nome} {u.cognome}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Da chiudere entro</label>
              <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm"
                value={form.scadenza} onChange={e => setForm(f => ({ ...f, scadenza: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => crea.mutate({ cantiere_id: parseInt(cantiereId), descrizione: form.descrizione, responsabile_id: form.responsabile_id ? parseInt(form.responsabile_id) : null, scadenza: form.scadenza || null })}
              disabled={!form.descrizione || crea.isLoading}
              className="flex-1 bg-red-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50">
              Registra NC
            </button>
            <button onClick={() => setApriForm(false)} className="px-4 border rounded-lg text-sm">Annulla</button>
          </div>
        </div>
      )}

      {isLoading ? <div className="text-center py-8 text-gray-400">Caricamento...</div> : (
        <div className="space-y-2">
          {aperte.map(nc => (
            <div key={nc.id} className={`bg-white border rounded-xl p-4 space-y-2 ${nc.scaduta ? 'border-red-400 bg-red-50' : 'border-orange-200'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${nc.scaduta ? 'bg-red-600 text-white' : 'bg-orange-500 text-white'}`}>
                      {nc.scaduta ? '⚠ SCADUTA' : 'APERTA'}
                    </span>
                    {nc.scadenza && <span className="text-xs text-gray-500">entro {new Date(nc.scadenza).toLocaleDateString('it-IT')}</span>}
                  </div>
                  <p className="text-sm text-gray-800">{nc.descrizione}</p>
                  <div className="flex gap-3 mt-1 text-xs text-gray-500">
                    {nc.responsabile_nome && <span>👤 {nc.responsabile_nome}</span>}
                    <span>Segnalata da {nc.autore_nome}</span>
                  </div>
                </div>
                {canWrite && (
                  <button onClick={() => { setChiudiId(nc.id); setNotaChiusura('') }}
                    className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg font-medium flex-shrink-0">
                    Chiudi
                  </button>
                )}
              </div>
              {chiudiId === nc.id && (
                <div className="border-t pt-2 space-y-2">
                  <textarea placeholder="Nota di chiusura (opzionale)" rows={2}
                    className="w-full border rounded-lg px-3 py-2 text-sm resize-none"
                    value={notaChiusura} onChange={e => setNotaChiusura(e.target.value)} />
                  <div className="flex gap-2">
                    <button onClick={() => chiudi.mutate({ id: nc.id, nota: notaChiusura })}
                      className="flex-1 bg-green-600 text-white rounded-lg py-2 text-sm font-medium">
                      Conferma chiusura
                    </button>
                    <button onClick={() => setChiudiId(null)} className="px-4 border rounded-lg text-sm">Annulla</button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {chiuse.length > 0 && (
            <details className="mt-2">
              <summary className="text-sm text-gray-500 cursor-pointer py-1">Mostra {chiuse.length} NC chiuse</summary>
              <div className="space-y-2 mt-2">
                {chiuse.map(nc => (
                  <div key={nc.id} className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">CHIUSA</span>
                      <span className="text-xs text-gray-400">{nc.chiusa_il ? new Date(nc.chiusa_il).toLocaleDateString('it-IT') : ''}</span>
                    </div>
                    <p className="text-sm text-gray-600">{nc.descrizione}</p>
                    {nc.nota_chiusura && <p className="text-xs text-gray-500 mt-1 italic">"{nc.nota_chiusura}"</p>}
                  </div>
                ))}
              </div>
            </details>
          )}
          {ncs.length === 0 && (
            <div className="text-center py-10 text-gray-400">
              <AlertCircle size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">Nessuna non conformità registrata</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ─── TAB FOTO ─── */
function FotoTab({ cantiereId, utente }) {
  const qc = useQueryClient()
  const canWrite = ['admin','capo_cantiere','capo_cantiere_sub','direzione_lavori','artigiano'].includes(utente?.ruolo)
  const [uploadingCount, setUploadingCount] = useState(0)
  const [selIdx, setSelIdx] = useState(null)
  const fileRef = useRef(null)

  const { data: foto = [], isLoading } = useQuery(
    ['foto-cantiere', cantiereId],
    () => api.get(`/cantieri/${cantiereId}/foto`).then(r => r.data),
    { staleTime: 0 }
  )

  const uploadFoto = async (file) => {
    setUploadingCount(n => n + 1)
    try {
      const fd = new FormData(); fd.append('file', file)
      await api.post(`/cantieri/${cantiereId}/foto`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      qc.invalidateQueries(['foto-cantiere', cantiereId])
      qc.invalidateQueries(['diari', cantiereId])
    } catch { toast.error('Errore upload foto') }
    finally { setUploadingCount(n => n - 1) }
  }

  if (isLoading) return <div className="text-center py-10 text-gray-400">Caricamento...</div>

  return (
    <div className="space-y-3">
      {/* Header con pulsante upload */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-900">Archivio Foto</h3>
          <p className="text-xs text-gray-400">{foto.length} foto totali (diario + pin mappa)</p>
        </div>
        {canWrite && (
          <label className={`btn-primary flex items-center gap-2 cursor-pointer ${uploadingCount > 0 ? 'opacity-50 pointer-events-none' : ''}`}>
            {uploadingCount > 0 ? <Loader2 size={15} className="animate-spin" /> : <Camera size={15} />}
            {uploadingCount > 0 ? `⏳ ${uploadingCount} in caricamento...` : 'Aggiungi foto'}
            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
              onChange={e => {
                const files = Array.from(e.target.files)
                if (!files.length) return
                Promise.all(files.map(f => uploadFoto(f))).then(() => {
                  toast.success(files.length > 1 ? `${files.length} foto caricate!` : 'Foto caricata!')
                })
                e.target.value = ''
              }} />
          </label>
        )}
      </div>

      {/* Griglia foto */}
      {foto.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">
          <Images size={40} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">Nessuna foto ancora</p>
          <p className="text-xs mt-1">Le foto caricate nel diario e sui pin della mappa appariranno qui</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {foto.map((f, i) => (
            <div key={i} className="relative group cursor-pointer rounded-xl overflow-hidden bg-gray-100 aspect-square"
              onClick={() => setSelIdx(i)}>
              <AuthImage url={f.url} className="w-full h-full object-cover" />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <p className="text-white text-xs font-medium truncate">{f.fonte_label}</p>
                {f.autore && <p className="text-white/70 text-xs truncate">{f.autore}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox navigabile */}
      {selIdx !== null && foto[selIdx] && (
        <LightboxNav
          urls={foto.map(f => f.url)}
          idx={selIdx}
          onClose={() => setSelIdx(null)}
          onSetIdx={fn => setSelIdx(i => fn(i))}
          renderImg={(url) => {
            const item = foto.find(f => f.url === url)
            return (
              <div className="max-w-2xl w-full">
                <AuthImage url={url} className="w-full rounded-xl max-h-[75vh] object-contain" />
                {item && (
                  <div className="mt-3 text-white/80 text-sm space-y-0.5">
                    <p className="font-medium">{item.fonte_label}</p>
                    {item.autore && <p className="text-white/60 text-xs">{item.autore}</p>}
                    {item.nota && <p className="text-white/60 text-xs italic">"{item.nota}"</p>}
                    {item.data && <p className="text-white/60 text-xs">{item.data}</p>}
                  </div>
                )}
              </div>
            )
          }}
        />
      )}
    </div>
  )
}

// Lightbox navigabile con frecce prev/next
// urls: string[] — indice corrente; onClose; onSetIdx
function LightboxNav({ urls, idx, onClose, onSetIdx, renderImg }) {
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') onSetIdx(i => Math.min(i + 1, urls.length - 1))
      if (e.key === 'ArrowLeft')  onSetIdx(i => Math.max(i - 1, 0))
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [urls.length, onClose, onSetIdx])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
      onClick={onClose}>
      <button onClick={onClose}
        className="absolute top-4 right-4 text-white bg-black/50 rounded-full p-2 hover:bg-black/80 transition-colors z-10">
        <X size={24} />
      </button>
      {urls.length > 1 && (
        <>
          <button
            onClick={e => { e.stopPropagation(); onSetIdx(i => Math.max(i - 1, 0)) }}
            disabled={idx === 0}
            className="absolute left-3 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/80 text-white rounded-full p-2 transition-colors disabled:opacity-20 z-10">
            <ChevronLeft size={28} />
          </button>
          <button
            onClick={e => { e.stopPropagation(); onSetIdx(i => Math.min(i + 1, urls.length - 1)) }}
            disabled={idx === urls.length - 1}
            className="absolute right-3 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/80 text-white rounded-full p-2 transition-colors disabled:opacity-20 z-10">
            <ChevronRight size={28} />
          </button>
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
            {urls.map((_, i) => (
              <button key={i} onClick={e => { e.stopPropagation(); onSetIdx(() => i) }}
                className={`w-2 h-2 rounded-full transition-colors ${i === idx ? 'bg-white' : 'bg-white/40 hover:bg-white/70'}`} />
            ))}
          </div>
        </>
      )}
      <div className="max-w-[95vw] max-h-[90vh]" onClick={e => e.stopPropagation()}>
        {renderImg ? renderImg(urls[idx]) : (
          <img src={urls[idx]} alt={`foto ${idx + 1}`}
            className="max-w-[95vw] max-h-[90vh] object-contain rounded-xl shadow-2xl" />
        )}
      </div>
    </div>
  )
}

function AuthImage({ url, className }) {
  const { src } = useAuthImage(url)
  return <img src={src} className={className} alt="" loading="lazy" />
}
