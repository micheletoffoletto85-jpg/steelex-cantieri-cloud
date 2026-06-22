import { useQuery, useMutation, useQueryClient } from 'react-query'
import { Link } from 'react-router-dom'
import { HardHat, TrendingUp, Clock, CheckCircle, AlertCircle, CheckCircle2, AlertTriangle, PauseCircle, Mic, MicOff, ChevronRight, Calendar, Bell, BellOff, ClipboardList, Send, Camera, X, ChevronDown } from 'lucide-react'
import api from '../lib/api'
import { useAuth } from '../lib/auth'
import { useState, useRef } from 'react'
import dayjs from 'dayjs'
import 'dayjs/locale/it'
import relativeTime from 'dayjs/plugin/relativeTime'
dayjs.locale('it')
dayjs.extend(relativeTime)

const STATO_LABEL = {
  preventivo: { label: 'Preventivo', color: 'bg-gray-100 text-gray-700' },
  in_corso: { label: 'In Corso', color: 'bg-blue-100 text-blue-700' },
  sospeso: { label: 'Sospeso', color: 'bg-yellow-100 text-yellow-700' },
  completato: { label: 'Completato', color: 'bg-green-100 text-green-700' },
  annullato: { label: 'Annullato', color: 'bg-red-100 text-red-700' },
}

const STATO_FASE = {
  pianificata:  { label: 'Pianificata',  icon: Clock,         cls: 'text-gray-500' },
  in_corso:     { label: 'In corso',     icon: Clock,         cls: 'text-blue-600' },
  completata:   { label: 'Completata',   icon: CheckCircle2,  cls: 'text-green-600' },
  in_ritardo:   { label: 'In ritardo',   icon: AlertTriangle, cls: 'text-red-500' },
  sospesa:      { label: 'Sospesa',      icon: PauseCircle,   cls: 'text-amber-500' },
}

function ClienteDashboard({ utente, cantieri }) {
  const cantiere = cantieri.find(c => c.stato === 'in_corso') || cantieri[0]
  const oggi = dayjs()

  const { data, isLoading } = useQuery(
    ['aggiornamenti-cliente', cantiere?.id],
    () => api.get(`/cantieri/${cantiere.id}/aggiornamenti-cliente`).then(r => r.data),
    { enabled: !!cantiere, staleTime: 0 }
  )

  // Fasi "calde": in corso, in ritardo, o che iniziano/finiscono entro 21 giorni
  const fasiCalde = (data?.fasi || []).filter(f => {
    if (['in_corso', 'in_ritardo'].includes(f.stato)) return true
    if (f.data_inizio && dayjs(f.data_inizio).diff(oggi, 'day') <= 21 && dayjs(f.data_inizio).isAfter(oggi)) return true
    if (f.data_fine_prevista && dayjs(f.data_fine_prevista).diff(oggi, 'day') <= 14 && f.percentuale < 100) return true
    return false
  })

  // Prossimi appuntamenti: fasi future ordinate per data (mix Gantt + appuntamenti)
  const prossimi = (data?.fasi || [])
    .filter(f => f.data_inizio && dayjs(f.data_inizio).isAfter(oggi) && f.percentuale < 100)
    .sort((a, b) => dayjs(a.data_inizio).diff(dayjs(b.data_inizio)))
    .slice(0, 5)

  // Aggiunge anche le appuntamenti dall'endpoint (fasi con data_fine vicina)
  const scadenze = (data?.fasi || [])
    .filter(f => f.data_fine_prevista && dayjs(f.data_fine_prevista).isAfter(oggi) && f.percentuale < 100)
    .filter(f => !prossimi.find(p => p.id === f.id))
    .sort((a, b) => dayjs(a.data_fine_prevista).diff(dayjs(b.data_fine_prevista)))
    .slice(0, 3)

  const eventiCalendario = [
    ...prossimi.map(f => ({ id: `i-${f.id}`, nome: f.nome, data: f.data_inizio, colore: f.colore, tipo: 'inizio' })),
    ...scadenze.map(f => ({ id: `f-${f.id}`, nome: `Fine: ${f.nome}`, data: f.data_fine_prevista, colore: f.colore, tipo: 'fine' })),
  ].sort((a, b) => dayjs(a.data).diff(dayjs(b.data))).slice(0, 5)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="bg-steelex-dark rounded-2xl p-6 text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full bg-fr-charcoal" />
          <div className="absolute -bottom-12 -left-4 w-32 h-32 rounded-full bg-fr-charcoal" />
        </div>
        <div className="relative">
          <img src="/logo-steelex.png" alt="Steelex" className="h-7 mb-4 opacity-80" />
          <p className="text-sm tracking-widest text-gray-400 uppercase mb-1">Benvenuto</p>
          <h1 className="text-2xl font-bold text-white">{utente?.nome}</h1>
          <div className="mt-3 h-0.5 w-16 bg-fr-charcoal rounded" />
          {cantiere && <p className="text-gray-400 text-sm mt-3">Stai seguendo: <span className="text-white font-medium">{cantiere.nome}</span></p>}
        </div>
      </div>

      {cantieri.length === 0 && (
        <div className="card text-center py-10 text-gray-400">
          <HardHat size={40} className="mx-auto mb-2 opacity-30" />
          <p>Non sei ancora assegnato a nessun cantiere.</p>
          <p className="text-xs mt-1">Contatta il responsabile per ricevere l'accesso.</p>
        </div>
      )}

      {cantiere && (
        <>
          {/* Avanzamento + fasi calde nella stessa card */}
          {isLoading && (
            <div className="flex items-center justify-center py-8 text-gray-400 gap-3">
              <div className="w-6 h-6 border-2 border-fr-charcoal border-t-transparent rounded-full animate-spin" />
              <span className="text-sm">Caricamento aggiornamenti...</span>
            </div>
          )}

          {data && (
            <div className="card space-y-4">
              {/* Barra avanzamento */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Avanzamento lavori</p>
                  <span className="text-2xl font-bold text-fr-charcoal">{data.avanzamento_globale}%</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-3">
                  <div className="bg-fr-charcoal h-3 rounded-full transition-all duration-1000"
                    style={{ width: `${Math.min(100, data.avanzamento_globale)}%` }} />
                </div>
              </div>

              {/* Fasi in corso / prossime scadenze */}
              {fasiCalde.length > 0 && (
                <div className="space-y-2 pt-1 border-t border-gray-100">
                  <p className="text-xs text-gray-400 font-medium">In questo momento</p>
                  {fasiCalde.slice(0, 3).map(f => {
                    const stato = STATO_FASE[f.stato] || STATO_FASE.pianificata
                    const Icona = stato.icon
                    return (
                      <div key={f.id} className="flex items-center gap-2">
                        <Icona size={13} className={stato.cls + ' flex-shrink-0'} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-sm font-medium text-gray-800 truncate">{f.nome}</span>
                            <span className="text-xs font-bold text-fr-charcoal flex-shrink-0">{f.percentuale}%</span>
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-1 mt-0.5">
                            <div className="h-1 rounded-full" style={{ width: `${f.percentuale}%`, backgroundColor: f.colore || '#FF6B00' }} />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {fasiCalde.length === 0 && data.totale_fasi > 0 && (
                <p className="text-xs text-gray-400 text-center py-2">Nessuna fase attiva al momento — il responsabile aggiornerà presto.</p>
              )}
            </div>
          )}

          {/* Prossimi appuntamenti — mini calendario */}
          {data && eventiCalendario.length > 0 && (
            <div className="card space-y-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-2">
                <Calendar size={13} /> Prossimi appuntamenti
              </p>
              {eventiCalendario.map(a => (
                <div key={a.id} className="flex items-center gap-3 py-1.5 border-b border-gray-50 last:border-0">
                  <div className="flex-shrink-0 w-11 h-11 rounded-xl flex flex-col items-center justify-center text-center"
                    style={{ backgroundColor: (a.colore || '#FF6B00') + '18', border: `1.5px solid ${(a.colore || '#FF6B00')}35` }}>
                    <span className="text-sm font-bold leading-tight" style={{ color: a.colore || '#FF6B00' }}>{dayjs(a.data).format('D')}</span>
                    <span className="text-[9px] uppercase font-medium" style={{ color: a.colore || '#FF6B00' }}>{dayjs(a.data).format('MMM')}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{a.nome}</p>
                    <p className="text-xs text-gray-400">{dayjs(a.data).fromNow()}</p>
                  </div>
                  {a.tipo === 'fine' && <span className="text-[10px] bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded-full font-medium flex-shrink-0">scadenza</span>}
                </div>
              ))}
            </div>
          )}

          {/* Ultime note dal cantiere */}
          {data && data.note_condivise?.length > 0 && (
            <div className="card space-y-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Ultime note dal cantiere</p>
              {data.note_condivise.slice(0, 3).map(n => (
                <div key={n.id} className="border-l-2 border-fr-charcoal pl-3 py-1 space-y-0.5">
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-gray-400">{dayjs(n.data).format('D MMMM YYYY')}{n.meteo && <span className="ml-1">{n.meteo}</span>}</p>
                    {n.fonte === 'voce' && <Mic size={10} className="text-red-400" />}
                  </div>
                  <p className="text-sm text-gray-700 leading-relaxed">{n.testo}</p>
                </div>
              ))}
            </div>
          )}

          {/* CTA cantiere */}
          <Link to={`/cantieri/${cantiere.id}`}
            className="block w-full text-center py-3 rounded-xl border-2 border-fr-charcoal text-fr-charcoal font-semibold text-sm hover:bg-orange-50 transition-colors">
            Cronoprogramma completo →
          </Link>
        </>
      )}
    </div>
  )
}

// ── Dashboard operativo interno (artigiano) ───────────────────────────────────
function ArtigianoDashboard({ utente, cantieri }) {
  const qc = useQueryClient()
  const [fase, setFase] = useState('idle') // idle | recording | processing | done | error
  const [testoLibero, setTestoLibero] = useState('')
  const [cantiereSelezionato, setCantiereSelezionato] = useState('')
  const [foto, setFoto] = useState([]) // array di File
  const [risultato, setRisultato] = useState(null)
  const [errore, setErrore] = useState(null)
  const [mostraTestuale, setMostraTestuale] = useState(false)
  const mediaRef = useRef(null)
  const chunksRef = useRef([])
  const fotoInputRef = useRef(null)

  const { data: miei = [] } = useQuery('rapportini-miei',
    () => api.get('/rapportini/miei').then(r => r.data), { staleTime: 60000 })

  const oggi = dayjs().format('dddd D MMMM')
  const ultimoRapportino = miei[0]

  const inviaMutation = useMutation(
    async (formData) => {
      const res = await api.post('/rapportini/invia', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      return res.data
    },
    {
      onSuccess: (data) => {
        setRisultato(data)
        setFase('done')
        setTestoLibero('')
        setFoto([])
        setCantiereSelezionato('')
        setMostraTestuale(false)
        qc.invalidateQueries('rapportini-miei')
      },
      onError: (err) => {
        setErrore(err?.response?.data?.detail || 'Errore invio')
        setFase('error')
      }
    }
  )

  const _buildFormData = (audioBlob) => {
    const fd = new FormData()
    if (audioBlob) fd.append('file', audioBlob, 'rapportino.webm')
    if (testoLibero.trim()) fd.append('testo', testoLibero.trim())
    if (cantiereSelezionato) fd.append('cantiere_id', cantiereSelezionato)
    foto.forEach(f => fd.append('foto', f))
    return fd
  }

  const startRec = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      chunksRef.current = []
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        setFase('processing')
        inviaMutation.mutate(_buildFormData(blob))
      }
      mr.start()
      mediaRef.current = mr
      setFase('recording')
      setErrore(null)
    } catch {
      setErrore('Microfono non disponibile')
    }
  }

  const stopRec = () => {
    if (mediaRef.current?.state === 'recording') mediaRef.current.stop()
  }

  const inviaTestuale = () => {
    if (!testoLibero.trim()) return
    setFase('processing')
    setErrore(null)
    inviaMutation.mutate(_buildFormData(null))
  }

  const aggiungiAnteprima = (files) => {
    const nuove = Array.from(files).filter(f => f.type.startsWith('image/'))
    setFoto(prev => [...prev, ...nuove].slice(0, 5))
  }

  return (
    <div className="space-y-5 max-w-lg mx-auto">
      {/* Header personale */}
      <div className="bg-steelex-dark rounded-2xl p-5 text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full bg-fr-charcoal" />
        </div>
        <div className="relative flex items-center gap-3">
          <img src="/logo-steelex.png" alt="STEELEX" className="h-7 opacity-80" />
          <div>
            <p className="text-gray-400 text-xs uppercase tracking-widest">{oggi}</p>
            <h1 className="text-xl font-bold text-white">Ciao, {utente?.nome}</h1>
          </div>
        </div>
      </div>

      {/* ── BLOCCO REGISTRAZIONE ── */}
      {fase === 'done' ? (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-5 space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
              <CheckCircle size={20} className="text-green-600" />
            </div>
            <div className="flex-1">
              <p className="font-bold text-green-800">Rapportino inviato!</p>
              <p className="text-sm text-green-700 mt-0.5">{risultato?.riassunto}</p>
              {risultato?.cantiere_nome && (
                <p className="text-xs text-green-600 font-medium mt-1">{risultato.cantiere_nome}</p>
              )}
            </div>
          </div>
          <button onClick={() => { setFase('idle'); setRisultato(null) }}
            className="w-full py-2.5 rounded-xl border-2 border-green-400 text-green-700 font-semibold text-sm hover:bg-green-100 transition-colors">
            + Nuovo rapportino
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Rapportino di oggi</p>

          {/* Selezione cantiere (se ce ne sono più di 1) */}
          {cantieri.length > 1 && (
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Cantiere (opzionale — viene rilevato automaticamente)</label>
              <div className="relative">
                <select
                  value={cantiereSelezionato}
                  onChange={e => setCantiereSelezionato(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm appearance-none bg-gray-50 focus:outline-none focus:ring-2 focus:ring-steelex-orange pr-8"
                >
                  <option value="">Rileva automaticamente dalla voce</option>
                  {cantieri.map(c => (
                    <option key={c.id} value={c.id}>{c.nome}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </div>
          )}
          {cantieri.length === 1 && (
            <div className="flex items-center gap-2 bg-orange-50 rounded-xl px-3 py-2">
              <HardHat size={14} className="text-steelex-orange flex-shrink-0" />
              <span className="text-sm font-medium text-steelex-orange">{cantieri[0].nome}</span>
            </div>
          )}

          {/* Pulsante microfono grande */}
          <div className="flex flex-col items-center gap-3">
            {fase === 'idle' || fase === 'error' ? (
              <button
                onClick={startRec}
                className="w-28 h-28 rounded-full bg-steelex-orange text-white flex items-center justify-center shadow-xl hover:bg-orange-700 active:scale-95 transition-all">
                <Mic size={44} />
              </button>
            ) : fase === 'recording' ? (
              <button
                onClick={stopRec}
                className="w-28 h-28 rounded-full bg-red-600 text-white flex items-center justify-center shadow-xl animate-pulse hover:bg-red-700 active:scale-95 transition-all">
                <MicOff size={44} />
              </button>
            ) : (
              <div className="w-28 h-28 rounded-full bg-gray-100 flex items-center justify-center">
                <div className="animate-spin w-10 h-10 border-4 border-steelex-orange border-t-transparent rounded-full" />
              </div>
            )}
            <p className="text-sm font-semibold text-gray-600 text-center">
              {fase === 'idle' && 'Tocca per registrare cosa hai fatto oggi'}
              {fase === 'recording' && '🔴 Registrazione — tocca per fermare'}
              {fase === 'processing' && 'Elaborazione in corso...'}
              {fase === 'error' && '❌ Riprova'}
            </p>
          </div>

          {errore && (
            <div className="bg-red-50 text-red-700 p-3 rounded-xl text-sm text-center">{errore}</div>
          )}

          {/* Foto */}
          <div>
            <input
              ref={fotoInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={e => aggiungiAnteprima(e.target.files)}
            />
            {foto.length > 0 ? (
              <div className="flex gap-2 flex-wrap">
                {foto.map((f, i) => (
                  <div key={i} className="relative">
                    <img src={URL.createObjectURL(f)} alt="" className="w-16 h-16 object-cover rounded-lg border border-gray-200" />
                    <button
                      onClick={() => setFoto(prev => prev.filter((_, j) => j !== i))}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center">
                      <X size={10} />
                    </button>
                  </div>
                ))}
                {foto.length < 5 && (
                  <button onClick={() => fotoInputRef.current?.click()}
                    className="w-16 h-16 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center text-gray-400 hover:border-steelex-orange hover:text-steelex-orange transition-colors">
                    <Camera size={20} />
                  </button>
                )}
              </div>
            ) : (
              <button
                onClick={() => fotoInputRef.current?.click()}
                className="flex items-center gap-2 text-sm text-gray-500 hover:text-steelex-orange transition-colors py-1">
                <Camera size={16} /> Allega foto (opzionale)
              </button>
            )}
          </div>

          {/* Alternativa testuale */}
          <div>
            <button
              onClick={() => setMostraTestuale(v => !v)}
              className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
              <ChevronDown size={12} className={mostraTestuale ? 'rotate-180' : ''} />
              {mostraTestuale ? 'Nascondi testo' : 'Oppure scrivi il rapportino'}
            </button>
            {mostraTestuale && (
              <div className="mt-2 space-y-2">
                <textarea
                  value={testoLibero}
                  onChange={e => setTestoLibero(e.target.value)}
                  rows={3}
                  placeholder="Descrivi cosa hai fatto, materiali usati, eventuali problemi..."
                  className="w-full border border-gray-200 rounded-xl p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-steelex-orange"
                />
                <button
                  onClick={inviaTestuale}
                  disabled={!testoLibero.trim() || fase === 'processing'}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-steelex-orange text-white rounded-xl font-semibold text-sm hover:bg-orange-700 disabled:opacity-40 transition-colors">
                  <Send size={15} /> Invia rapportino scritto
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Ultimo rapportino inviato */}
      {ultimoRapportino && fase !== 'done' && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-1.5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Ultimo rapportino inviato</p>
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-gray-800 leading-snug flex-1">{ultimoRapportino.riassunto}</p>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${
              ultimoRapportino.stato === 'validato' ? 'bg-green-100 text-green-700'
              : ultimoRapportino.stato === 'rifiutato' ? 'bg-red-100 text-red-700'
              : 'bg-yellow-100 text-yellow-700'
            }`}>
              {ultimoRapportino.stato}
            </span>
          </div>
          {ultimoRapportino.cantiere_nome && (
            <p className="text-xs text-steelex-orange font-medium">{ultimoRapportino.cantiere_nome}</p>
          )}
          {ultimoRapportino.data_lavoro && (
            <p className="text-xs text-gray-400">{dayjs(ultimoRapportino.data_lavoro).format('D MMMM YYYY')}</p>
          )}
        </div>
      )}

      {/* Cantieri assegnati */}
      {cantieri.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1">I tuoi cantieri</p>
          {cantieri.map(c => (
            <a key={c.id} href={`/cantieri/${c.id}`}
              className="flex items-center gap-3 bg-white rounded-xl border border-gray-100 shadow-sm p-3.5 hover:border-steelex-orange transition-colors">
              <div className="w-9 h-9 rounded-lg bg-orange-50 flex items-center justify-center flex-shrink-0">
                <HardHat size={16} className="text-steelex-orange" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 text-sm truncate">{c.nome}</p>
                {c.indirizzo && <p className="text-xs text-gray-400 truncate">{c.indirizzo}</p>}
              </div>
              <ChevronRight size={15} className="text-gray-400 flex-shrink-0" />
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

export default function DashboardPage() {
  const { utente } = useAuth()
  const isCliente = utente?.ruolo === 'cliente'
  const { data: cantieri = [] } = useQuery('cantieri', () => api.get('/cantieri').then(r => r.data))

  const stats = {
    totale: cantieri.length,
    in_corso: cantieri.filter(c => c.stato === 'in_corso').length,
    completati: cantieri.filter(c => c.stato === 'completato').length,
    avanzamento_medio: cantieri.length
      ? Math.round(cantieri.reduce((s, c) => s + c.avanzamento, 0) / cantieri.length)
      : 0,
  }

  // Mostra i cantieri non completati/annullati, poi tutti gli altri — max 5
  const cantieriRecenti = [
    ...cantieri.filter(c => c.stato === 'in_corso'),
    ...cantieri.filter(c => c.stato === 'preventivo'),
    ...cantieri.filter(c => c.stato === 'sospeso'),
    ...cantieri.filter(c => !['in_corso', 'preventivo', 'sospeso'].includes(c.stato)),
  ].slice(0, 5)

  const STATO_BADGE = {
    preventivo: 'bg-gray-100 text-gray-600',
    in_corso: 'bg-blue-100 text-blue-700',
    sospeso: 'bg-yellow-100 text-yellow-700',
    completato: 'bg-green-100 text-green-700',
    annullato: 'bg-red-100 text-red-700',
  }
  const STATO_LABEL_DASH = { preventivo: 'Preventivo', in_corso: 'In Corso', sospeso: 'Sospeso', completato: 'Completato', annullato: 'Annullato' }

  if (isCliente) return <ClienteDashboard utente={utente} cantieri={cantieri} />
  if (utente?.ruolo === 'artigiano' && utente?.tipo_professione === 'Operativo Interno') return <ArtigianoDashboard utente={utente} cantieri={cantieri} />

  return (
    <div className="space-y-6">
      {/* Intestazione */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Ciao, {utente?.nome} 👋</h1>
        <p className="text-gray-500 text-sm">Ecco la situazione dei cantieri oggi</p>
      </div>

      {/* Layout desktop: 2 colonne | mobile: stack */}
      <div className="lg:grid lg:grid-cols-3 lg:gap-6 space-y-6 lg:space-y-0">

        {/* Colonna sinistra: stats + azioni rapide */}
        <div className="lg:col-span-1 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <StatCard icon={HardHat} label="Totale Cantieri" value={stats.totale} color="orange" />
            <StatCard icon={Clock} label="In Corso" value={stats.in_corso} color="blue" />
            <StatCard icon={CheckCircle} label="Completati" value={stats.completati} color="green" />
            <StatCard icon={TrendingUp} label="Avanz. Medio" value={`${stats.avanzamento_medio}%`} color="purple" />
          </div>

          {/* Notifiche */}
          <NotifichePanel />

          {/* Azioni rapide — solo desktop, no cliente */}
          {!isCliente && (
            <div className="hidden lg:block card space-y-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Azioni rapide</p>
              <Link to="/cantieri" className="flex items-center gap-2 text-sm text-gray-700 hover:text-fr-charcoal font-medium py-1.5 transition-colors">
                <HardHat size={16} className="text-fr-charcoal" /> Vai ai cantieri
              </Link>
              <Link to="/cantieri" state={{ nuovo: true }} className="flex items-center gap-2 text-sm text-gray-700 hover:text-fr-charcoal font-medium py-1.5 transition-colors">
                <AlertCircle size={16} className="text-blue-500" /> Nuovo cantiere
              </Link>
            </div>
          )}
        </div>

        {/* Colonna destra: cantieri recenti */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-gray-800">Cantieri Recenti</h2>
            <Link to="/cantieri" className="text-fr-charcoal text-sm font-medium">Vedi tutti →</Link>
          </div>
          {cantieri.length === 0 ? (
            <div className="card text-center py-8 text-gray-400">
              <HardHat size={40} className="mx-auto mb-2 opacity-30" />
              {isCliente ? (
                <p>Non sei ancora assegnato a nessun cantiere.<br/><span className="text-xs">Contatta il responsabile per ricevere l'accesso.</span></p>
              ) : (
                <>
                  <p>Nessun cantiere ancora</p>
                  <Link to="/cantieri" className="text-fr-charcoal text-sm font-medium mt-2 inline-block">Crea il primo cantiere →</Link>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {cantieriRecenti.map(c => (
                <Link key={c.id} to={`/cantieri/${c.id}`}
                  className="card flex items-center gap-3 hover:border-fr-charcoal border-2 border-transparent transition-colors">
                  <div className="w-9 h-9 rounded-xl bg-orange-50 flex items-center justify-center flex-shrink-0">
                    <HardHat size={18} className="text-fr-charcoal" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{c.nome}</p>
                    <p className="text-sm text-gray-500 truncate">{c.cliente}{c.citta ? ` — ${c.citta}` : ''}</p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATO_BADGE[c.stato]}`}>
                      {STATO_LABEL_DASH[c.stato]}
                    </span>
                    <div className="text-right hidden sm:block w-16">
                      <div className="text-fr-charcoal font-bold text-sm">{c.avanzamento}%</div>
                      <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
                        <div className="bg-fr-charcoal h-1.5 rounded-full transition-all" style={{ width: `${c.avanzamento}%` }} />
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function NotifichePanel() {
  const qc = useQueryClient()
  const { data: notifiche = [], isLoading } = useQuery(
    'notifiche-inapp',
    () => api.get('/notifiche/inapp').then(r => r.data),
    { staleTime: 30000, refetchInterval: 60000 }
  )
  const leggiTutte = useMutation(
    () => api.post('/notifiche/inapp/leggi-tutte'),
    { onSuccess: () => qc.invalidateQueries('notifiche-inapp') }
  )
  const leggi = useMutation(
    (id) => api.post(`/notifiche/inapp/${id}/leggi`),
    { onSuccess: () => qc.invalidateQueries('notifiche-inapp') }
  )

  const nonLette = notifiche.filter(n => !n.letta).length
  const TIPO_COLOR = {
    extra_preventivo: 'border-l-orange-500 bg-orange-50',
    warning: 'border-l-yellow-500 bg-yellow-50',
    nc: 'border-l-red-500 bg-red-50',
    fattura: 'border-l-blue-500 bg-blue-50',
    info: 'border-l-gray-300 bg-white',
  }

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell size={16} className="text-fr-charcoal" />
          <h2 className="font-bold text-gray-800">Notifiche</h2>
          {nonLette > 0 && <span className="text-xs bg-red-500 text-white px-1.5 py-0.5 rounded-full font-bold">{nonLette}</span>}
        </div>
        {nonLette > 0 && (
          <button onClick={() => leggiTutte.mutate()} className="text-xs text-gray-400 hover:text-fr-charcoal">
            Segna tutte lette
          </button>
        )}
      </div>
      {isLoading && <div className="text-center py-4 text-gray-400 text-sm">Caricamento...</div>}
      {!isLoading && notifiche.length === 0 && (
        <div className="text-center py-6 text-gray-400">
          <BellOff size={28} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">Nessuna notifica</p>
        </div>
      )}
      <div className="space-y-2 max-h-80 overflow-y-auto">
        {notifiche.map(n => (
          <div key={n.id}
            className={`border-l-4 rounded-r-xl px-3 py-2 cursor-pointer transition-opacity ${TIPO_COLOR[n.tipo] || TIPO_COLOR.info} ${n.letta ? 'opacity-50' : ''}`}
            onClick={() => {
              if (!n.letta) leggi.mutate(n.id)
              if (n.url) window.location.href = n.url
            }}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${n.letta ? 'text-gray-500' : 'text-gray-900'}`}>{n.titolo}</p>
                {n.corpo && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.corpo}</p>}
              </div>
              <span className="text-xs text-gray-400 flex-shrink-0">{dayjs(n.creato_il).fromNow()}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, color }) {
  const colors = {
    orange: 'bg-orange-50 text-gray-700',
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
