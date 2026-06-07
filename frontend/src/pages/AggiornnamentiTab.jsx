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
    { staleTime: 30000, retry: 1 }
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

  const { avanzamento_globale, fasi, note_condivise, appuntamenti } = data

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
      {fasi.length > 0 && (
        <div className="card space-y-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Cronoprogramma</p>
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
