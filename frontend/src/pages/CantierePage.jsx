import { useState, useRef, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { ArrowLeft, Edit2, Save, X, MapPin, Calendar, Euro, CheckSquare, BookOpen, Plus, Trash2, Camera, CheckCircle2, Circle, Mic, MicOff, Loader2, Languages } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../lib/api'
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

  const { data: cantiere, isLoading } = useQuery(['cantiere', id], () => api.get(`/cantieri/${id}`).then(r => r.data), {
    onSuccess: d => { if (!form) setForm(d) }
  })

  const updateMutation = useMutation(
    data => api.put(`/cantieri/${id}`, data),
    { onSuccess: r => { qc.setQueryData(['cantiere', id], r.data); qc.invalidateQueries('cantieri'); setEditing(false); toast.success('Salvato!') } }
  )

  if (isLoading) return <div className="text-center py-8 text-gray-400">Caricamento...</div>
  if (!cantiere) return <div className="text-center py-8 text-red-400">Cantiere non trovato</div>

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
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
        {[['info', 'Info', null], ['checklist', 'Checklist', CheckSquare], ['diario', 'Diario', BookOpen], ['voce', 'Voce AI', Mic]].map(([key, label, Icon]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-colors ${tab === key ? 'bg-white shadow text-steelex-orange' : 'text-gray-500'}`}>
            {Icon && <Icon size={14} />}{label}
          </button>
        ))}
      </div>

      {tab === 'info' && <InfoTab cantiere={cantiere} editing={editing} form={form} set={set} />}
      {tab === 'checklist' && <ChecklistTab cantiereId={id} />}
      {tab === 'diario' && <DiarioTab cantiereId={id} />}
      {tab === 'voce' && <VoceAITab cantiereId={id} />}
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
      toast.error(err.response?.data?.detail || 'Errore trascrizione')
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
                  <img key={i} src={`https://steelex-cantieri-cloud-production.up.railway.app${url}`}
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
