/**
 * Gantt mensile operatori/artigiani
 * Righe = artigiani attivi  |  Colonne = giorni mese × turno M/P
 * Click cella → assegna cantiere (dropdown in-cell)
 */
import { useState, useMemo, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { ChevronLeft, ChevronRight, X, Users, Download } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../lib/api'
import { useAuth } from '../lib/auth'
import dayjs from 'dayjs'
import 'dayjs/locale/it'
dayjs.locale('it')

// Palette colori cantieri (assegnata ciclicamente per id)
const PALETTE = [
  '#FF6B00','#3b82f6','#22c55e','#a855f7','#f59e0b',
  '#06b6d4','#ec4899','#64748b','#84cc16','#f97316',
  '#6366f1','#14b8a6','#e11d48','#0ea5e9','#8b5cf6',
]
function colorePerCantiere(id) {
  if (!id) return null
  return PALETTE[(id - 1) % PALETTE.length]
}

function meseLabel(anno, mese) {
  return dayjs(`${anno}-${String(mese).padStart(2,'0')}-01`).format('MMMM YYYY')
}

// ── Popover assegnazione cella ────────────────────────────────────────────────
function CellaPopover({ artigiano, data, turno, assegnazione, cantieri, onSalva, onChiudi }) {
  const [cantiereId, setCantiereId] = useState(assegnazione?.cantiere_id ?? '')
  const [lavorazione, setLavorazione] = useState(assegnazione?.lavorazione ?? '')
  const ref = useRef(null)

  // Chiudi cliccando fuori
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onChiudi() }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onChiudi])

  const salva = () => {
    onSalva({
      artigiano_id: artigiano.id,
      data,
      turno,
      cantiere_id: cantiereId ? parseInt(cantiereId) : null,
      lavorazione: lavorazione || null,
    })
    onChiudi()
  }

  const svuota = () => {
    onSalva({ artigiano_id: artigiano.id, data, turno, cantiere_id: null, lavorazione: null })
    onChiudi()
  }

  return (
    <div ref={ref}
      className="absolute z-50 bg-white border border-gray-200 rounded-xl shadow-xl p-3 w-56"
      style={{ top: '100%', left: 0, minWidth: 220 }}
      onClick={e => e.stopPropagation()}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-bold text-gray-800">
          {artigiano.nome} {artigiano.cognome} — {turno === 'M' ? 'Mattina' : 'Pomeriggio'}
          <span className="font-normal text-gray-400 ml-1">{dayjs(data).format('D/M')}</span>
        </p>
        <button onClick={onChiudi} className="text-gray-300 hover:text-gray-500"><X size={14}/></button>
      </div>
      <select
        autoFocus
        value={cantiereId}
        onChange={e => setCantiereId(e.target.value)}
        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs mb-2 focus:outline-none focus:ring-2 focus:ring-steelex-orange">
        <option value="">— nessun cantiere —</option>
        {cantieri.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
      </select>
      <input
        type="text"
        placeholder="Lavorazione..."
        value={lavorazione}
        onChange={e => setLavorazione(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && salva()}
        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs mb-2 focus:outline-none focus:ring-2 focus:ring-steelex-orange"
      />
      <div className="flex gap-1.5">
        <button onClick={salva}
          className="flex-1 py-1.5 bg-steelex-orange text-white text-xs font-semibold rounded-lg hover:bg-orange-600 transition-colors">
          Salva
        </button>
        {assegnazione && (
          <button onClick={svuota}
            className="px-3 py-1.5 border border-red-200 text-red-500 text-xs font-semibold rounded-lg hover:bg-red-50 transition-colors">
            Rimuovi
          </button>
        )}
      </div>
    </div>
  )
}

// ── Singola cella ─────────────────────────────────────────────────────────────
function Cella({ artigiano, data, turno, assMap, cantieri, onSalva, canWrite, isWeekend, isOggi }) {
  const key = `${artigiano.id}_${data}_${turno}`
  const ass = assMap[key]
  const [aperto, setAperto] = useState(false)
  const colore = colorePerCantiere(ass?.cantiere_id)

  return (
    <td
      className={`relative border border-gray-100 p-0 text-center align-middle
        ${isWeekend ? 'bg-gray-50' : ''}
        ${isOggi ? 'ring-inset ring-1 ring-steelex-orange' : ''}
      `}
      style={{ minWidth: 28, height: 32 }}>
      <div
        className={`w-full h-full flex items-center justify-center cursor-pointer transition-opacity hover:opacity-80 ${!ass ? 'hover:bg-orange-50' : ''}`}
        style={{ background: colore || undefined }}
        onClick={() => canWrite && setAperto(true)}
        title={ass ? `${ass.cantiere_nome || ''}${ass.lavorazione ? ' — ' + ass.lavorazione : ''}` : undefined}>
        {ass?.cantiere_nome && (
          <span className="text-white font-bold leading-none pointer-events-none select-none"
            style={{ fontSize: 9 }}>
            {ass.cantiere_nome.slice(0, 3).toUpperCase()}
          </span>
        )}
      </div>
      {aperto && (
        <CellaPopover
          artigiano={artigiano}
          data={data}
          turno={turno}
          assegnazione={ass}
          cantieri={cantieri}
          onSalva={onSalva}
          onChiudi={() => setAperto(false)}
        />
      )}
    </td>
  )
}

// ── Legenda cantieri ──────────────────────────────────────────────────────────
function Legenda({ cantieri, usatiIds }) {
  const usati = cantieri.filter(c => usatiIds.has(c.id))
  if (usati.length === 0) return null
  return (
    <div className="flex flex-wrap gap-2 mt-3">
      {usati.map(c => (
        <div key={c.id} className="flex items-center gap-1.5 text-xs text-gray-700">
          <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: colorePerCantiere(c.id) }} />
          <span>{c.nome}</span>
        </div>
      ))}
    </div>
  )
}

// ── Pagina principale ─────────────────────────────────────────────────────────
export default function GanttOperatoriPage() {
  const { utente } = useAuth()
  const qc = useQueryClient()
  const canWrite = ['admin', 'capo_cantiere', 'capo_cantiere_sub', 'amministrazione'].includes(utente?.ruolo)

  const oggi = dayjs()
  const [anno, setAnno] = useState(oggi.year())
  const [mese, setMese] = useState(oggi.month() + 1)  // 1-12

  const prevMese = () => {
    const d = dayjs(`${anno}-${mese}-01`).subtract(1, 'month')
    setAnno(d.year()); setMese(d.month() + 1)
  }
  const nextMese = () => {
    const d = dayjs(`${anno}-${mese}-01`).add(1, 'month')
    setAnno(d.year()); setMese(d.month() + 1)
  }

  // Giorni del mese
  const giorni = useMemo(() => {
    const primo = dayjs(`${anno}-${String(mese).padStart(2,'0')}-01`)
    const tot = primo.daysInMonth()
    return Array.from({ length: tot }, (_, i) => primo.add(i, 'day'))
  }, [anno, mese])

  const { data: artigiani = [], isLoading: loadArt } = useQuery(
    'artigiani-gantt',
    () => api.get('/artigiani').then(r => r.data.filter(a => a.attivo)),
    { staleTime: 60000 }
  )

  const { data: cantieri = [] } = useQuery(
    'cantieri-attivi-gantt',
    () => api.get('/cantieri').then(r => r.data.filter(c =>
      ['attivo', 'in_corso', 'preventivo'].includes(c.stato)
    )),
    { staleTime: 60000 }
  )

  const { data: assegnazioni = [] } = useQuery(
    ['assegnazioni', anno, mese],
    () => api.get('/assegnazioni', { params: { anno, mese } }).then(r => r.data),
    { staleTime: 0 }
  )

  // Mappa chiave = "artigiano_id_data_turno" → assegnazione
  const assMap = useMemo(() => {
    const map = {}
    assegnazioni.forEach(a => {
      map[`${a.artigiano_id}_${a.data}_${a.turno}`] = a
    })
    return map
  }, [assegnazioni])

  const usatiIds = useMemo(() => new Set(assegnazioni.map(a => a.cantiere_id).filter(Boolean)), [assegnazioni])

  const upsertMutation = useMutation(
    body => api.put('/assegnazioni', body),
    {
      onSuccess: () => qc.invalidateQueries(['assegnazioni', anno, mese]),
      onError: e => toast.error(e.response?.data?.detail || 'Errore salvataggio'),
    }
  )

  if (loadArt) return <div className="text-center py-12 text-gray-400">Caricamento...</div>

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Users size={22} className="text-steelex-orange" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">Gantt Operatori</h1>
            <p className="text-xs text-gray-500">{artigiani.length} artigiani attivi</p>
          </div>
        </div>
      </div>

      {/* Navigazione mese */}
      <div className="flex items-center gap-3 bg-white rounded-xl border border-gray-100 shadow-sm p-3">
        <button onClick={prevMese} className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors">
          <ChevronLeft size={18} />
        </button>
        <div className="flex-1 text-center">
          <p className="font-semibold text-gray-900 capitalize">{meseLabel(anno, mese)}</p>
          {anno === oggi.year() && mese === oggi.month() + 1 && (
            <span className="text-xs text-steelex-orange font-semibold">Mese corrente</span>
          )}
        </div>
        <button onClick={nextMese} className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors">
          <ChevronRight size={18} />
        </button>
      </div>

      {artigiani.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">
          <Users size={36} className="mx-auto mb-2 opacity-30" />
          <p className="font-medium">Nessun artigiano attivo</p>
          <p className="text-sm mt-1">Aggiungi artigiani dalla sezione Rubrica</p>
        </div>
      ) : (
        <>
          {/* Avviso mobile */}
          <div className="sm:hidden bg-blue-50 border border-blue-200 rounded-xl p-2.5 text-xs text-blue-700">
            💡 Ruota lo schermo per vedere meglio la griglia
          </div>

          {/* Griglia */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
              <table className="border-collapse" style={{ minWidth: Math.max(700, 120 + giorni.length * 58) }}>
                <thead>
                  {/* Riga 1: giorni */}
                  <tr style={{ background: '#1e293b' }}>
                    <th className="sticky left-0 z-10 px-3 py-2 text-left text-xs font-bold text-gray-300 uppercase tracking-widest border-r-2 border-gray-600"
                      style={{ background: '#1e293b', minWidth: 140 }}>
                      Operatore
                    </th>
                    {giorni.map(d => {
                      const isWeekend = d.day() === 0 || d.day() === 6
                      const isOggi = d.isSame(oggi, 'day')
                      return (
                        <th key={d.format('YYYY-MM-DD')} colSpan={2}
                          className={`text-center border-l border-gray-600 py-1.5 ${isWeekend ? 'opacity-50' : ''}`}
                          style={{ minWidth: 56 }}>
                          <div className={`text-xs font-bold leading-tight ${isOggi ? 'text-steelex-orange' : 'text-white'}`}>
                            {d.format('D')}
                          </div>
                          <div className="text-[9px] text-gray-400 uppercase">{d.format('dd')}</div>
                        </th>
                      )
                    })}
                  </tr>
                  {/* Riga 2: M/P */}
                  <tr style={{ background: '#f1f5f9' }}>
                    <th className="sticky left-0 z-10 border-r-2 border-gray-300 border-b border-gray-200"
                      style={{ background: '#f1f5f9', minWidth: 140 }} />
                    {giorni.map(d => {
                      const isWeekend = d.day() === 0 || d.day() === 6
                      return (['M','P']).map(t => (
                        <th key={`${d.format('YYYY-MM-DD')}_${t}`}
                          className={`text-center border-l border-gray-200 border-b border-gray-200 py-0.5 ${isWeekend ? 'bg-gray-100' : ''}`}
                          style={{ minWidth: 28 }}>
                          <span className="text-[9px] font-semibold text-gray-400">{t}</span>
                        </th>
                      ))
                    })}
                  </tr>
                </thead>
                <tbody>
                  {artigiani.map((art, ai) => (
                    <tr key={art.id} className={ai % 2 === 0 ? '' : 'bg-gray-50/50'}>
                      {/* Nome operatore */}
                      <td className="sticky left-0 z-10 px-3 py-1.5 border-r-2 border-gray-200 border-b border-gray-100"
                        style={{ background: ai % 2 === 0 ? '#fff' : '#f9fafb', minWidth: 140 }}>
                        <div>
                          <p className="text-xs font-semibold text-gray-800 leading-tight">{art.nome} {art.cognome}</p>
                          {art.azienda && <p className="text-[10px] text-gray-400 truncate">{art.azienda}</p>}
                        </div>
                      </td>
                      {/* Celle M/P per ogni giorno */}
                      {giorni.map(d => {
                        const dataStr = d.format('YYYY-MM-DD')
                        const isWeekend = d.day() === 0 || d.day() === 6
                        const isOggi = d.isSame(oggi, 'day')
                        return (['M','P']).map(t => (
                          <Cella
                            key={`${dataStr}_${t}`}
                            artigiano={art}
                            data={dataStr}
                            turno={t}
                            assMap={assMap}
                            cantieri={cantieri}
                            onSalva={body => upsertMutation.mutate(body)}
                            canWrite={canWrite}
                            isWeekend={isWeekend}
                            isOggi={isOggi}
                          />
                        ))
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Legenda */}
          <Legenda cantieri={cantieri} usatiIds={usatiIds} />

          {!canWrite && (
            <p className="text-xs text-gray-400 text-center mt-2">Solo admin e capo cantiere possono modificare le assegnazioni</p>
          )}
        </>
      )}
    </div>
  )
}
