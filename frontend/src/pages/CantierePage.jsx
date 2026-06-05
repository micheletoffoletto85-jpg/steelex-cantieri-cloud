import { useState, useRef, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { ArrowLeft, Edit2, Save, X, MapPin, Calendar, Euro, CheckSquare, BookOpen, Plus, Trash2, Camera, CheckCircle2, Circle, Mic, MicOff, Loader2, Languages, Map, Upload, FileText, AlertTriangle, Wrench, BarChart2 } from 'lucide-react'
import EconomiaTab from './EconomiaTab'
import ClienteView from './ClienteView'
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
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/cantieri')} className="p-2 hover:bg-gray-100 rounded-lg"><ArrowLeft size={20} /></button>
          <h1 className="text-xl font-bold truncate">{cantiere.nome}</h1>
        </div>
        <ClienteView cantiere={cantiere} />
      </div>
    )
  }

  const data = editing ? form : cantiere
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div className="max-w-2xl mx-auto space-y-4">
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

      {/* Tab bar */}
      <div className="grid grid-cols-3 gap-1 bg-gray-100 rounded-xl p-1 sm:grid-cols-6">
        {[['info','Info',null],['checklist','Checklist',CheckSquare],['diario','Diario',BookOpen],['mappe','Mappe',Map],['economia','Economia',Euro],['voce','Voce AI',Mic]].map(([key,label,Icon]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-medium transition-colors ${tab===key ? 'bg-white shadow text-steelex-orange' : 'text-gray-500'}`}>
            {Icon && <Icon size={12} />}{label}
          </button>
        ))}
      </div>

      {tab === 'info'     && <InfoTab cantiere={cantiere} editing={editing} form={form} set={set} />}
      {tab === 'checklist'&& <ChecklistTab cantiereId={id} />}
      {tab === 'diario'   && <DiarioTab cantiereId={id} />}
      {tab === 'mappe'    && <MappeTab cantiereId={id} />}
      {tab === 'economia' && <EconomiaTab cantiereId={id} />}
      {tab === 'voce'     && <VoceAITab cantiereId={id} />}
    </div>
  )
}

/* ─── TAB INFO ─── */
function InfoTab({ cantiere, editing, form, set }) {
  const data = editing ? form : cantiere
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
      {editing
        ? <div><label className="text-sm text-gray-500 mb-1 block">Avanzamento: {form.avanzamento}%</label>
            <input type="range" min="0" max="100" step="5" value={form.avanzamento} onChange={e => set('avanzamento', Number(e.target.value))} className="w-full accent-steelex-orange" /></div>
        : <div className="w-full bg-gray-200 rounded-full h-3"><div className="bg-steelex-orange h-3 rounded-full transition-all" style={{ width: `${cantiere.avanzamento}%` }} /></div>}
      <div className="grid grid-cols-2 gap-3">
        <InfoField icon="👷" label="Cliente" value={data.cliente || ''} editing={editing} onChange={v => set('cliente', v)} />
        <InfoField icon={<MapPin size={14} />} label="Città" value={data.citta || ''} editing={editing} onChange={v => set('citta', v)} />
        <InfoField icon={<Calendar size={14} />} label="Inizio" type="date" value={data.data_inizio || ''} editing={editing} onChange={v => set('data_inizio', v)} />
        <InfoField icon={<Calendar size={14} />} label="Fine Prevista" type="date" value={data.data_fine_prevista || ''} editing={editing} onChange={v => set('data_fine_prevista', v)} />
        <InfoField icon={<Euro size={14} />} label="Budget" type="number" value={data.budget || 0} editing={editing} onChange={v => set('budget', Number(v))} display={`€${(data.budget || 0).toLocaleString('it-IT')}`} />
      </div>
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
          <span className="text-sm font-medium">Registra in qualsiasi lingua — traduco io in italiano</span>
        </div>

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
  const [uploadingFoto, setUploadingFoto] = useState(false)
  const imgContainerRef = useRef(null)

  const canWrite   = ['admin','capo_cantiere'].includes(utente?.ruolo)
  const canContrib = ['admin','capo_cantiere','fornitore'].includes(utente?.ruolo)

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

  const uploadMutation = useMutation(
    async (file) => { const fd = new FormData(); fd.append('file', file); return api.post(`/cantieri/${cantiereId}/documenti`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }) },
    { onSuccess: r => { qc.invalidateQueries(['documenti', cantiereId]); setDocSelezionato(r.data); toast.success('Mappa caricata!') },
      onError: err => toast.error(err.response?.data?.detail || 'Errore upload') }
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

  const supportsPreview = (doc) => ['jpg','jpeg','png','gif','webp','pdf'].includes(doc?.tipo?.toLowerCase())
  const previewUrl = (doc) => `/cantieri/${cantiereId}/documenti/${doc.id}/preview`

  if (isLoading) return <div className="text-center py-8 text-gray-400">Caricamento...</div>

  return (
    <div className="space-y-3">
      {/* Upload */}
      {canWrite && (
        <label className={`card flex items-center gap-3 cursor-pointer hover:border-steelex-orange border-2 border-dashed border-gray-200 transition-colors ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
          <Upload size={20} className="text-steelex-orange flex-shrink-0" />
          <div>
            <p className="font-medium text-sm text-gray-800">{uploading ? 'Caricamento...' : 'Carica mappa o documento'}</p>
            <p className="text-xs text-gray-400">JPG, PNG, PDF — max 50MB</p>
          </div>
          <input type="file" className="hidden" accept=".jpg,.jpeg,.png,.gif,.webp,.pdf"
            onChange={e => { if (e.target.files[0]) { setUploading(true); uploadMutation.mutate(e.target.files[0], { onSettled: () => setUploading(false) }) } }} disabled={uploading} />
        </label>
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
                    <div className="flex gap-2 pt-1">
                      <input className="input-field text-sm py-2 flex-1" placeholder="Aggiungi aggiornamento..."
                        value={reportTesto} onChange={e => setReportTesto(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && aggiungiReport()} />
                      <button onClick={aggiungiReport} disabled={!reportTesto.trim()} className="btn-primary px-3 py-2 text-sm">Invia</button>
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
            {/* Descrizione */}
            <textarea className="input-field h-20 resize-none" placeholder="Descrizione..." value={pinForm.nota} onChange={e => setPinForm(f => ({ ...f, nota: e.target.value }))} autoFocus />
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

  const { data: diari = [] } = useQuery(['diari', cantiereId], () => api.get(`/cantieri/${cantiereId}/diari`).then(r => r.data))

  const createMutation = useMutation(
    () => api.post(`/cantieri/${cantiereId}/diari`, { ...form, cantiere_id: Number(cantiereId), operai_presenti: Number(form.operai_presenti) }),
    { onSuccess: () => { qc.invalidateQueries(['diari', cantiereId]); setShowForm(false); toast.success('Diario salvato!') } }
  )

  const uploadFoto = async (diarioId, file) => {
    setUploadingFor(diarioId)
    try {
      const fd = new FormData()
      fd.append('file', file)
      await api.post(`/cantieri/${cantiereId}/diari/${diarioId}/foto`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      qc.invalidateQueries(['diari', cantiereId])
      toast.success('Foto caricata!')
    } catch { toast.error('Errore upload foto') }
    finally { setUploadingFor(null) }
  }

  const METEO = ['☀️ Sole', '⛅ Nuvoloso', '🌧️ Pioggia', '❄️ Neve', '💨 Vento']

  return (
    <div className="space-y-3">
      <button onClick={() => setShowForm(!showForm)} className="btn-primary w-full flex items-center justify-center gap-2">
        <Plus size={18} /> Nuovo Diario
      </button>

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
        ? <div className="card text-center py-8 text-gray-400"><BookOpen size={32} className="mx-auto mb-2 opacity-30" /><p>Nessun diario</p></div>
        : diari.map(d => (
          <div key={d.id} className="card space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-gray-800">{dayjs(d.data).format('dddd D MMMM YYYY')}</span>
              <div className="flex items-center gap-2 text-sm text-gray-500">
                {d.meteo && <span>{d.meteo}</span>}
                {d.operai_presenti > 0 && <span>👷 {d.operai_presenti}</span>}
              </div>
            </div>
            {d.attivita && <p className="text-sm text-gray-700">{d.attivita}</p>}

            {/* Foto */}
            {d.foto_urls?.length > 0 && (
              <div className="flex gap-2 flex-wrap mt-2">
                {d.foto_urls.map((url, i) => (
                  <img key={i} src={url}
                    className="w-20 h-20 object-cover rounded-lg border" alt={`foto ${i + 1}`} />
                ))}
              </div>
            )}

            {/* Upload foto */}
            <label className={`flex items-center gap-2 text-sm text-steelex-orange cursor-pointer hover:underline ${uploadingFor === d.id ? 'opacity-50' : ''}`}>
              <Camera size={16} />
              {uploadingFor === d.id ? 'Caricamento...' : 'Aggiungi foto'}
              <input type="file" accept="image/*" capture="environment" className="hidden"
                onChange={e => e.target.files[0] && uploadFoto(d.id, e.target.files[0])} disabled={uploadingFor === d.id} />
            </label>
          </div>
        ))}
    </div>
  )
}
