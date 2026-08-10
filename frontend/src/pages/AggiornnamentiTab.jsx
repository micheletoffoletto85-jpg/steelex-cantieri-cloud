/**
 * Tab Aggiornamenti — visibile al cliente (e agli admin come preview)
 * Mix tra Gantt e Diario: avanzamento fasi + note condivise + prossimi appuntamenti
 */
import { useQuery } from 'react-query'
import api from '../lib/api'
import dayjs from 'dayjs'
import 'dayjs/locale/it'
import relativeTime from 'dayjs/plugin/relativeTime'
import { Calendar, CheckCircle2, Clock, AlertTriangle, PauseCircle, Mic, ChevronRight } from 'lucide-react'

dayjs.locale('it')
dayjs.extend(relativeTime)

const STATO_LABEL = {
  pianificata:  { label: 'Pianificata',  icon: Clock,         cls: 'text-gray-500' },
  in_corso:     { label: 'In corso',     icon: Clock,         cls: 'text-blue-600' },
  completata:   { label: 'Completata',   icon: CheckCircle2,  cls: 'text-green-600' },
  in_ritardo:   { label: 'In ritardo',   icon: AlertTriangle, cls: 'text-red-500' },
  sospesa:      { label: 'Sospesa',      icon: PauseCircle,   cls: 'text-amber-500' },
}

export default function AggiornnamentiTab({ cantiereId }) {
  const { data, isLoading, error } = useQuery(
    ['aggiornamenti-cliente', cantiereId],
    () => api.get(`/cantieri/${cantiereId}/aggiornamenti-cliente`).then(r => r.data),
    { staleTime: 0, retry: 1 }
  )

  if (isLoading) return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-400">
      <div className="w-8 h-8 border-2 border-steelex-orange border-t-transparent rounded-full animate-spin" />
      <p className="text-sm">Caricamento aggiornamenti...</p>
    </div>
  )

  if (error || !data) return (
    <div className="card text-center py-10 text-gray-400">
      <p>Impossibile caricare gli aggiornamenti.</p>
    </div>
  )

  const { avanzamento_globale, fasi, note_condivise, appuntamenti, fasi_condivise, totale_fasi } = data

  return (
    <div className="space-y-5">

      {/* ── Avanzamento globale ── */}
      <div className="bg-steelex-dark rounded-2xl p-5 text-white">
        <p className="text-xs tracking-widest text-gray-400 uppercase mb-1">Avanzamento cantiere</p>
        <div className="flex items-end justify-between mb-3">
          <p className="text-4xl font-bold text-steelex-orange">{avanzamento_globale}%</p>
          <p className="text-xs text-gray-400 mb-1">completato</p>
        </div>
        <div className="w-full bg-white/10 rounded-full h-2.5">
          <div
            className="bg-steelex-orange h-2.5 rounded-full transition-all duration-1000"
            style={{ width: `${Math.min(100, avanzamento_globale)}%` }}
          />
        </div>
      </div>

      {/* ── Fasi lavoro ── */}
      {fasi.length === 0 && totale_fasi > 0 && (
        <div className="card text-center py-6 border-2 border-dashed border-orange-200">
          <p className="text-sm text-gray-500">Nessuna fase condivisa ancora.</p>
          <p className="text-xs text-gray-400 mt-1">
            Vai nel <strong>Gantt</strong> → modifica una fase → attiva <em>"Mostra al cliente"</em>
          </p>
        </div>
      )}
      {fasi.length > 0 && <GanttClienteVisuale fasi={fasi} />}
      {fasi.length > 0 && (
        <div className="card space-y-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
            Cronoprogramma ({fasi_condivise} fase{fasi_condivise !== 1 ? 'i' : ''} condivisa{fasi_condivise !== 1 ? '' : ''})
          </p>
          {fasi.map(f => {
            const stato = STATO_LABEL[f.stato] || STATO_LABEL.pianificata
            const Icona = stato.icon
            return (
              <div key={f.id} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Icona size={13} className={stato.cls + ' flex-shrink-0'} />
                    <span className="text-sm font-medium text-gray-800 truncate">{f.nome}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`text-xs font-medium ${stato.cls}`}>{stato.label}</span>
                    <span className="text-xs font-bold text-steelex-orange w-8 text-right">{f.percentuale}%</span>
                  </div>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-1.5">
                  <div
                    className="h-1.5 rounded-full transition-all duration-700"
                    style={{ width: `${Math.min(100, f.percentuale)}%`, backgroundColor: f.colore || '#FF6B00' }}
                  />
                </div>
                {(f.data_inizio || f.data_fine_prevista) && (
                  <p className="text-[10px] text-gray-400">
                    {f.data_inizio && dayjs(f.data_inizio).format('D MMM')}
                    {f.data_inizio && f.data_fine_prevista && ' → '}
                    {f.data_fine_prevista && dayjs(f.data_fine_prevista).format('D MMM YYYY')}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Prossimi appuntamenti ── */}
      {appuntamenti.length > 0 && (
        <div className="card space-y-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-2">
            <Calendar size={13} /> Prossimi aggiornamenti
          </p>
          {appuntamenti.map(a => (
            <div key={a.id} className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0">
              <div className="flex-shrink-0 w-10 h-10 rounded-xl flex flex-col items-center justify-center text-center"
                style={{ backgroundColor: a.colore + '20', border: `1.5px solid ${a.colore}40` }}>
                <span className="text-[10px] font-bold leading-tight" style={{ color: a.colore }}>
                  {dayjs(a.data).format('D')}
                </span>
                <span className="text-[9px] uppercase" style={{ color: a.colore }}>
                  {dayjs(a.data).format('MMM')}
                </span>
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
      {note_condivise.length > 0 ? (
        <div className="card space-y-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Note dal cantiere</p>
          {note_condivise.map(n => (
            <div key={n.id} className="border-l-2 border-steelex-orange pl-3 py-1 space-y-0.5">
              <div className="flex items-center gap-2">
                <p className="text-xs text-gray-400">
                  {dayjs(n.data).format('D MMMM YYYY')}
                  {n.meteo && <span className="ml-1">{n.meteo}</span>}
                </p>
                {n.fonte === 'voce' && <Mic size={10} className="text-red-400" />}
              </div>
              <p className="text-sm text-gray-700 leading-relaxed">{n.testo}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="card text-center py-8 text-gray-400">
          <p className="text-sm">Nessun aggiornamento condiviso ancora.</p>
          <p className="text-xs mt-1 text-gray-300">Il responsabile di cantiere pubblicherà gli aggiornamenti qui.</p>
        </div>
      )}

    </div>
  )
}

/* ─── Diagramma di Gantt grafico — sola lettura, solo fasi condivise ─── */
function GanttClienteVisuale({ fasi }) {
  const oggi = dayjs().startOf('day')
  const fasiConData = fasi.filter(f => f.data_inizio)
  if (fasiConData.length === 0) return null

  const date = fasiConData.flatMap(f => [f.data_inizio, f.data_fine_prevista].filter(Boolean).map(d => dayjs(d)))
  const minFasi = date.reduce((a, b) => a.isBefore(b) ? a : b).subtract(3, 'day').startOf('day')
  const minData = minFasi.isBefore(oggi.subtract(7, 'day')) ? minFasi : oggi.subtract(7, 'day')
  const maxData = date.reduce((a, b) => a.isAfter(b) ? a : b).add(7, 'day').startOf('day')
  const totalDays = maxData.diff(minData, 'day') + 1

  const toPct = d => Math.max(0, Math.min(100, (dayjs(d).diff(minData, 'day') / totalDays) * 100))
  const todayPct = toPct(oggi)

  const mesiLabels = []
  let cur = minData.startOf('month')
  while (cur.isBefore(maxData) || cur.isSame(maxData, 'month')) {
    const startPct = Math.max(0, (cur.diff(minData, 'day') / totalDays) * 100)
    const endPct = Math.min(100, (cur.add(1, 'month').diff(minData, 'day') / totalDays) * 100)
    if (endPct > 0 && startPct < 100) mesiLabels.push({ label: cur.format('MMM YYYY'), pct: startPct, widthPct: endPct - startPct })
    cur = cur.add(1, 'month')
  }

  const LABEL_W = 108
  const minGanttPx = Math.max(totalDays * 8, 260)
  const ROW_H = 32

  return (
    <div className="card space-y-2">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Diagramma di Gantt</p>
      <div className="overflow-x-auto -mx-1 px-1">
        <div style={{ minWidth: LABEL_W + minGanttPx }}>
          {/* Header mesi */}
          <div className="flex" style={{ height: 22 }}>
            <div style={{ width: LABEL_W }} className="flex-shrink-0" />
            <div className="relative flex-1 bg-steelex-dark rounded-t-lg overflow-hidden">
              {mesiLabels.map((m, i) => (
                <div key={i} className="absolute top-0 h-full flex items-center border-l border-white/10"
                  style={{ left: `${m.pct}%`, width: `${m.widthPct}%` }}>
                  <span className="text-[9px] font-bold text-white uppercase truncate px-1">{m.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Righe fasi */}
          <div className="divide-y divide-gray-50">
            {fasiConData.map(f => {
              const xS = toPct(f.data_inizio)
              const fine = f.data_fine_prevista || f.data_inizio
              const xE = toPct(dayjs(fine).add(1, 'day'))
              const w = Math.max(xE - xS, 1)
              const col = f.colore || '#94a3b8'
              return (
                <div key={f.id} className="flex items-center" style={{ height: ROW_H }}>
                  <div style={{ width: LABEL_W }} className="flex-shrink-0 pr-2 truncate text-[11px] font-medium text-gray-700">
                    {f.nome}
                  </div>
                  <div className="relative flex-1 h-full bg-gray-50/60 border-l border-gray-100">
                    {todayPct >= 0 && todayPct <= 100 && (
                      <div className="absolute top-0 bottom-0 w-px bg-red-400" style={{ left: `${todayPct}%` }} />
                    )}
                    <div className="absolute rounded-full overflow-hidden" style={{ left: `${xS}%`, width: `${w}%`, top: 7, bottom: 7, backgroundColor: `${col}40` }}>
                      <div className="h-full rounded-full" style={{ width: `${f.percentuale}%`, backgroundColor: col }} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
      <p className="text-[10px] text-gray-300 flex items-center gap-1">
        <span className="inline-block w-2.5 h-px bg-red-400" /> Oggi
      </p>
    </div>
  )
}
