/**
 * Vista unica del cliente per un cantiere — avanzamento, cronoprogramma,
 * appuntamenti, note e planimetrie con pin. Sostituisce la vecchia coppia
 * Dashboard+Aggiornamenti+Mappe (dati duplicati tre volte) con un'unica
 * schermata senza ripetizioni, pensata per lo smartphone.
 */
import { useState, useRef, useEffect } from 'react'
import { useQuery } from 'react-query'
import { MapPin, Map, FileText, Calendar, Mic, ChevronDown, ChevronRight, CheckCircle2, Clock, AlertTriangle, PauseCircle } from 'lucide-react'
import api from '../lib/api'
import { useAuth } from '../lib/auth'
import dayjs from 'dayjs'
import 'dayjs/locale/it'
import relativeTime from 'dayjs/plugin/relativeTime'
import { GanttChart } from './GanttTab'

dayjs.locale('it')
dayjs.extend(relativeTime)

const NOOP = () => {}

const TIPO_PIN = {
  lavorazione: { label: 'Lavorazione', color: '#2563eb', bg: 'bg-blue-100 text-blue-700' },
  criticita:   { label: 'Criticità',   color: '#dc2626', bg: 'bg-red-100 text-red-700' },
  nota:        { label: 'Nota',        color: '#d97706', bg: 'bg-yellow-100 text-yellow-700' },
}
const STATO_STYLE = {
  preventivo: 'bg-gray-100 text-gray-700',
  in_corso:   'bg-blue-100 text-blue-700',
  sospeso:    'bg-yellow-100 text-yellow-700',
  completato: 'bg-green-100 text-green-700',
  annullato:  'bg-red-100 text-red-700',
}
const STATO_LABEL = { preventivo: 'Preventivo', in_corso: 'In Corso', sospeso: 'Sospeso', completato: 'Completato', annullato: 'Annullato' }

const STATO_FASE = {
  pianificata:  { label: 'Pianificata',  icon: Clock,         cls: 'text-gray-500' },
  in_corso:     { label: 'In corso',     icon: Clock,         cls: 'text-blue-600' },
  completata:   { label: 'Completata',   icon: CheckCircle2,  cls: 'text-green-600' },
  in_ritardo:   { label: 'In ritardo',   icon: AlertTriangle, cls: 'text-red-500' },
  sospesa:      { label: 'Sospesa',      icon: PauseCircle,   cls: 'text-amber-500' },
}

// Conteggio animato da 0 al valore target (ease-out) — dà "vita" al numero in apertura
function useCountUp(target, duration = 900) {
  const [value, setValue] = useState(0)
  useEffect(() => {
    let raf, start = null
    const tick = (ts) => {
      if (start === null) start = ts
      const t = Math.min((ts - start) / duration, 1)
      const eased = 1 - Math.pow(1 - t, 3)
      setValue(Math.round(target * eased))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])
  return value
}

function useAuthImage(url) {
  const [src, setSrc] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const prevUrl = useRef(null)

  if (url && url !== prevUrl.current) {
    prevUrl.current = url
    setSrc(null); setLoading(true); setError(false)
    if (url.startsWith('http')) {
      setSrc(url); setLoading(false)
    } else {
      api.get(url, { responseType: 'blob' })
        .then(r => { const o = URL.createObjectURL(r.data); setSrc(o) })
        .catch(() => setError(true))
        .finally(() => setLoading(false))
    }
  }
  return { src, loading, error }
}

// Anello di avanzamento animato — sostituisce le tre barre percentuale ripetute
function AnelloProgresso({ value, size = 76, stroke = 7 }) {
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (Math.min(100, Math.max(0, value)) / 100) * circumference
  return (
    <svg width={size} height={size} className="flex-shrink-0 -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={radius} stroke="rgba(255,255,255,0.15)" strokeWidth={stroke} fill="none" />
      <circle cx={size / 2} cy={size / 2} r={radius} stroke="#FF6B00" strokeWidth={stroke} fill="none"
        strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset}
        style={{ transition: 'stroke-dashoffset 1s ease-out' }} />
    </svg>
  )
}

export default function ClienteView({ cantiere }) {
  const { utente } = useAuth()
  const cantiereId = cantiere.id
  const [pinSel, setPinSel] = useState(null)
  const [mostraGantt, setMostraGantt] = useState(false)
  const [mostraTutteNote, setMostraTutteNote] = useState(false)
  const [tooltipFase, setTooltipFase] = useState(null)
  const oggi = dayjs()

  const { data: agg, isLoading: aggLoading } = useQuery(
    ['aggiornamenti-cliente', cantiereId],
    () => api.get(`/cantieri/${cantiereId}/aggiornamenti-cliente`).then(r => r.data),
    { enabled: !!utente, staleTime: 0 }
  )

  const { data: docs = [] } = useQuery(
    ['documenti', cantiereId],
    () => api.get(`/cantieri/${cantiereId}/documenti`).then(r => r.data),
    { enabled: !!utente }
  )

  const avanzamento = agg?.avanzamento_globale ?? cantiere.avanzamento ?? 0
  const avanzamentoAnimato = useCountUp(avanzamento)

  // Fasi "calde": in corso, in ritardo, o che iniziano/finiscono entro breve
  const fasiCalde = (agg?.fasi || []).filter(f => {
    if (['in_corso', 'in_ritardo'].includes(f.stato)) return true
    if (f.data_inizio && dayjs(f.data_inizio).diff(oggi, 'day') <= 21 && dayjs(f.data_inizio).isAfter(oggi)) return true
    if (f.data_fine_prevista && dayjs(f.data_fine_prevista).diff(oggi, 'day') <= 14 && f.percentuale < 100) return true
    return false
  })

  const noteVisibili = mostraTutteNote ? (agg?.note_condivise || []) : (agg?.note_condivise || []).slice(0, 3)

  // Solo documenti con pin visibili al cliente
  const docsConPinCliente = docs.filter(d =>
    (d.pin_dati || []).some(p => (p.visibilita || []).includes('cliente'))
  )

  const previewUrl = (doc) => `/cantieri/${cantiereId}/documenti/${doc.id}/preview`

  return (
    <div className="max-w-2xl mx-auto space-y-4">

      {/* ── Hero: cantiere + avanzamento (unica volta) ── */}
      <div className="relative bg-steelex-dark rounded-2xl p-6 text-white overflow-hidden text-center">
        <div className="absolute inset-0 opacity-10 pointer-events-none">
          <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full bg-steelex-orange" />
          <div className="absolute -bottom-12 -left-4 w-32 h-32 rounded-full bg-steelex-orange" />
        </div>
        <div className="relative">
          <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${STATO_STYLE[cantiere.stato]}`}>
            {STATO_LABEL[cantiere.stato]}
          </span>
          <h1 className="text-xl font-bold mt-2 truncate">{cantiere.nome}</h1>
          {(cantiere.citta || cantiere.indirizzo) && (
            <p className="text-xs text-gray-400 truncate mt-0.5">
              {cantiere.indirizzo}{cantiere.indirizzo && cantiere.citta ? ' · ' : ''}{cantiere.citta}{cantiere.provincia ? ` (${cantiere.provincia})` : ''}
            </p>
          )}

          {/* Anello di avanzamento — grande, al centro, sotto l'intestazione */}
          <div className="flex justify-center my-5">
            <div className="relative">
              <AnelloProgresso value={avanzamentoAnimato} size={152} stroke={11} />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-bold leading-none">{avanzamentoAnimato}%</span>
                <span className="text-[10px] text-gray-400 uppercase tracking-wide mt-1">completato</span>
              </div>
            </div>
          </div>

          {(cantiere.data_inizio || cantiere.data_fine_prevista) && (
            <div className="flex justify-center gap-8 pt-3 border-t border-white/10">
              {cantiere.data_inizio && (
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide">Inizio lavori</p>
                  <p className="text-sm font-medium">{dayjs(cantiere.data_inizio).format('D MMMM YYYY')}</p>
                </div>
              )}
              {cantiere.data_fine_prevista && (
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide">Fine prevista</p>
                  <p className="text-sm font-medium">{dayjs(cantiere.data_fine_prevista).format('D MMMM YYYY')}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {aggLoading && (
        <div className="flex items-center justify-center py-6 text-gray-400 gap-3">
          <div className="w-6 h-6 border-2 border-steelex-orange border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Caricamento aggiornamenti...</span>
        </div>
      )}

      {/* ── In questo momento (fasi calde) ── */}
      {fasiCalde.length > 0 && (
        <div className="card space-y-2.5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">In questo momento</p>
          {fasiCalde.slice(0, 3).map(f => {
            const stato = STATO_FASE[f.stato] || STATO_FASE.pianificata
            const Icona = stato.icon
            return (
              <div key={f.id} className="flex items-center gap-2">
                <Icona size={13} className={stato.cls + ' flex-shrink-0'} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-sm font-medium text-gray-800 truncate">{f.nome}</span>
                    <span className="text-xs font-bold text-steelex-orange flex-shrink-0">{f.percentuale}%</span>
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

      {/* ── Cronoprogramma completo — collassato di default ── */}
      {agg?.fasi?.length > 0 && (
        <div className="card space-y-3">
          <button onClick={() => setMostraGantt(v => !v)} className="w-full flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              Cronoprogramma ({agg.fasi_condivise} fase{agg.fasi_condivise !== 1 ? 'i' : ''})
            </p>
            <ChevronDown size={16} className={`text-gray-400 transition-transform ${mostraGantt ? 'rotate-180' : ''}`} />
          </button>
          {mostraGantt && (
            <GanttChart
              fasi={agg.fasi}
              salList={[]}
              canWrite={false}
              onEdit={NOOP}
              onDelete={NOOP}
              onUpdate={NOOP}
              onReorder={NOOP}
              onToggleCliente={NOOP}
              tooltipFase={tooltipFase}
              setTooltipFase={setTooltipFase}
            />
          )}
        </div>
      )}
      {agg && agg.fasi.length === 0 && agg.totale_fasi > 0 && (
        <div className="card text-center py-5 border-2 border-dashed border-orange-200">
          <p className="text-sm text-gray-500">Il cronoprogramma non è ancora stato condiviso.</p>
        </div>
      )}

      {/* ── Prossimi appuntamenti ── */}
      {agg?.appuntamenti?.length > 0 && (
        <div className="card space-y-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-2">
            <Calendar size={13} /> Prossimi appuntamenti
          </p>
          {agg.appuntamenti.map(a => (
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
              <ChevronRight size={14} className="text-gray-300 flex-shrink-0" />
            </div>
          ))}
        </div>
      )}

      {/* ── Note dal cantiere ── */}
      {agg?.note_condivise?.length > 0 ? (
        <div className="card space-y-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Note dal cantiere</p>
          {noteVisibili.map(n => (
            <div key={n.id} className="border-l-2 border-steelex-orange pl-3 py-1 space-y-0.5">
              <div className="flex items-center gap-2">
                <p className="text-xs text-gray-400">{dayjs(n.data).format('D MMMM YYYY')}{n.meteo && <span className="ml-1">{n.meteo}</span>}</p>
                {n.fonte === 'voce' && <Mic size={10} className="text-red-400" />}
              </div>
              <p className="text-sm text-gray-700 leading-relaxed">{n.testo}</p>
            </div>
          ))}
          {agg.note_condivise.length > 3 && (
            <button onClick={() => setMostraTutteNote(v => !v)} className="text-xs font-medium text-steelex-orange hover:underline">
              {mostraTutteNote ? 'Mostra meno' : `Vedi tutte (${agg.note_condivise.length})`}
            </button>
          )}
        </div>
      ) : agg && (
        <div className="card text-center py-6 text-gray-400">
          <p className="text-sm">Nessun aggiornamento condiviso ancora.</p>
          <p className="text-xs mt-1 text-gray-300">Il responsabile di cantiere pubblicherà gli aggiornamenti qui.</p>
        </div>
      )}

      {/* ── Planimetrie con pin visibili al cliente ── */}
      {docsConPinCliente.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-bold text-gray-800 flex items-center gap-2">
            <Map size={18} className="text-steelex-orange" /> Planimetrie e lavorazioni
          </h2>
          {docsConPinCliente.map(doc => (
            <div key={doc.id} className="card space-y-3">
              <div className="flex items-center gap-2">
                {doc.tipo === 'pdf' ? <FileText size={16} className="text-red-500" /> : <Map size={16} className="text-steelex-orange" />}
                <p className="font-medium text-sm text-gray-800">{doc.nome}</p>
              </div>

              <MappaClienteViewer
                url={previewUrl(doc)}
                pins={(doc.pin_dati || []).filter(p => (p.visibilita || []).includes('cliente'))}
                pinSel={pinSel}
                onClickPin={pin => setPinSel(pinSel?.id === pin.id ? null : pin)}
              />

              {/* Dettaglio pin selezionato */}
              {pinSel && (doc.pin_dati||[]).find(p=>p.id===pinSel.id) && (
                <div className="rounded-xl border-2 p-3 space-y-1" style={{ borderColor: TIPO_PIN[pinSel.tipo]?.color || '#888' }}>
                  <div className="flex flex-wrap gap-1 mb-1">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${TIPO_PIN[pinSel.tipo]?.bg}`}>
                      {TIPO_PIN[pinSel.tipo]?.label}
                    </span>
                    {pinSel.stato === 'risolto' && (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700 flex items-center gap-1">
                        <CheckCircle2 size={10} /> Risolto
                      </span>
                    )}
                    {pinSel.stato === 'in_lavorazione' && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">In lavorazione</span>
                    )}
                    {pinSel.stato === 'aperto' && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">Segnalato</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-800">{pinSel.nota}</p>
                  {/* Foto del pin (se ci sono) */}
                  {pinSel.foto_urls?.length > 0 && (
                    <div className="flex gap-2 flex-wrap mt-1">
                      {pinSel.foto_urls.map((url, i) => (
                        <img key={i} src={url} className="w-20 h-20 object-cover rounded-lg border" alt="" />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Lista pin visibili */}
              {(() => {
                const pinsVisibili = (doc.pin_dati||[]).filter(p => (p.visibilita||[]).includes('cliente'))
                if (pinsVisibili.length === 0) return null
                return (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Punti segnalati ({pinsVisibili.length})</p>
                    {pinsVisibili.map(pin => (
                      <button key={pin.id} onClick={() => setPinSel(pinSel?.id === pin.id ? null : pin)}
                        className={`w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-colors ${pinSel?.id === pin.id ? 'bg-gray-100' : 'hover:bg-gray-50'}`}>
                        <MapPin size={14} style={{ color: TIPO_PIN[pin.tipo]?.color, flexShrink: 0 }} fill="currentColor" />
                        <span className="flex-1 truncate text-gray-700">{pin.nota}</span>
                        {pin.stato === 'risolto'
                          ? <CheckCircle2 size={14} className="text-green-500 flex-shrink-0" />
                          : pin.stato === 'in_lavorazione'
                            ? <span className="text-xs text-yellow-600 flex-shrink-0">In corso</span>
                            : <span className="text-xs text-red-500 flex-shrink-0">Aperto</span>}
                      </button>
                    ))}
                  </div>
                )
              })()}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function MappaClienteViewer({ url, pins, pinSel, onClickPin }) {
  const { src, loading, error } = useAuthImage(url)
  const containerRef = useRef(null)

  return (
    <div ref={containerRef} className="relative w-full rounded-xl overflow-hidden border border-gray-200 bg-gray-100 select-none" style={{ minHeight: 80 }}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm">Caricamento mappa...</div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm">Mappa non disponibile</div>
      )}
      {src && <img src={src} alt="mappa" className="w-full h-auto block" draggable={false} />}
      {src && pins.map(pin => (
        <button key={pin.id}
          onClick={e => { e.stopPropagation(); onClickPin(pin) }}
          style={{
            position: 'absolute',
            left: `calc(${pin.x * 100}% - 14px)`,
            top: `calc(${pin.y * 100}% - 32px)`,
            color: pin.stato === 'risolto' ? '#16a34a' : (TIPO_PIN[pin.tipo]?.color || '#888'),
            filter: pinSel?.id === pin.id ? 'drop-shadow(0 0 6px rgba(0,0,0,0.7))' : 'drop-shadow(0 2px 3px rgba(0,0,0,0.5))',
            transform: pinSel?.id === pin.id ? 'scale(1.3)' : 'scale(1)',
            transition: 'transform 0.15s',
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
