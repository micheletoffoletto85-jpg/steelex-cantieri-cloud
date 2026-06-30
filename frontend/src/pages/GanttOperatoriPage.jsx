/**
 * Gantt mensile/settimanale operatori
 * Righe = artigiani rubrica + utenti operativi interni
 * Colonne = giorni × turno M/P
 * Paint drag: tieni premuto e trascina per assegnare/cancellare più celle
 * Mobile: vista settimanale con celle grandi
 */
import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { ChevronLeft, ChevronRight, X, Users, CalendarDays, Calendar } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../lib/api'
import { useAuth } from '../lib/auth'
import dayjs from 'dayjs'
import isoWeek from 'dayjs/plugin/isoWeek'
import 'dayjs/locale/it'
dayjs.extend(isoWeek)
dayjs.locale('it')

const PALETTE = [
  '#FF6B00','#3b82f6','#22c55e','#a855f7','#f59e0b',
  '#06b6d4','#ec4899','#64748b','#84cc16','#f97316',
  '#6366f1','#14b8a6','#e11d48','#0ea5e9','#8b5cf6',
]
function colorePerCantiere(id) {
  if (!id) return null
  return PALETTE[(id - 1) % PALETTE.length]
}

function cellaKey(op, data, turno) {
  return `${op.tipo}_${op.id}_${data}_${turno}`
}

// ── Popover selezione cantiere ────────────────────────────────────────────────
function CellaPopover({ op, data, turno, assegnazione, cantieri, onSalva, onChiudi }) {
  const [cantiereId, setCantiereId] = useState(assegnazione?.cantiere_id ?? '')
  const [lavorazione, setLavorazione] = useState(assegnazione?.lavorazione ?? '')
  const ref = useRef(null)

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onChiudi() }
    document.addEventListener('mousedown', handler)
    document.addEventListener('touchstart', handler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('touchstart', handler)
    }
  }, [onChiudi])

  const salva = () => {
    onSalva({
      ...(op.tipo === 'artigiano' ? { artigiano_id: op.id } : { utente_id: op.id }),
      data, turno,
      cantiere_id: cantiereId ? parseInt(cantiereId) : null,
      lavorazione: lavorazione || null,
    })
    onChiudi()
  }

  const svuota = () => {
    onSalva({
      ...(op.tipo === 'artigiano' ? { artigiano_id: op.id } : { utente_id: op.id }),
      data, turno, cantiere_id: null, lavorazione: null,
    })
    onChiudi()
  }

  return (
    <div ref={ref}
      className="absolute z-50 bg-white border border-gray-200 rounded-xl shadow-xl p-3"
      style={{ top: '100%', left: 0, minWidth: 220, width: 240 }}
      onClick={e => e.stopPropagation()}
      onTouchStart={e => e.stopPropagation()}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-bold text-gray-800 truncate pr-2">
          {op.nome} — {turno === 'M' ? 'Mattina' : 'Pomeriggio'}{' '}
          <span className="font-normal text-gray-400">{dayjs(data).format('D/M')}</span>
        </p>
        <button onClick={onChiudi} className="text-gray-300 hover:text-gray-500 flex-shrink-0"><X size={14}/></button>
      </div>
      <select autoFocus value={cantiereId} onChange={e => setCantiereId(e.target.value)}
        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs mb-2 focus:outline-none focus:ring-2 focus:ring-steelex-orange">
        <option value="">— nessun cantiere —</option>
        {cantieri.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
      </select>
      <input type="text" placeholder="Lavorazione..." value={lavorazione}
        onChange={e => setLavorazione(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && salva()}
        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs mb-2 focus:outline-none focus:ring-2 focus:ring-steelex-orange" />
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

// ── Legenda ───────────────────────────────────────────────────────────────────
function Legenda({ cantieri, usatiIds }) {
  const usati = cantieri.filter(c => usatiIds.has(c.id))
  if (usati.length === 0) return null
  return (
    <div className="flex flex-wrap gap-2 mt-2 px-1">
      {usati.map(c => (
        <div key={c.id} className="flex items-center gap-1.5 text-xs text-gray-600">
          <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: colorePerCantiere(c.id) }} />
          {c.nome}
        </div>
      ))}
    </div>
  )
}

// ── Griglia principale ────────────────────────────────────────────────────────
function GrigliaGantt({ operatori, giorni, assMap, cantieri, onSalva, canWrite, oggi, mobile }) {
  const [popover, setPopover] = useState(null)   // { op, data, turno }
  const paintRef  = useRef(null)                  // stato paint drag
  const pendingRef = useRef([])                   // batch celle da salvare
  const saveTimerRef = useRef(null)

  // Flush batch: salva tutte le celle accumulate durante il drag
  const flushPaint = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    const pending = [...pendingRef.current]
    pendingRef.current = []
    pending.forEach(body => onSalva(body))
  }, [onSalva])

  // Gestori globali mouseup / touchend per terminare il paint
  useEffect(() => {
    const onUp = () => {
      if (!paintRef.current) return
      paintRef.current = null
      flushPaint()
    }
    document.addEventListener('mouseup', onUp)
    document.addEventListener('touchend', onUp)
    return () => {
      document.removeEventListener('mouseup', onUp)
      document.removeEventListener('touchend', onUp)
    }
  }, [flushPaint])

  const startPaint = (e, op, data, turno, ass) => {
    if (!canWrite) return
    // distingui click da drag: registriamo la cella di partenza
    paintRef.current = {
      op, data, turno,
      // se la cella è vuota → paint assign, se ha cantiere → paint cancella (isDelete)
      isDelete: !!ass,
      cantiereId: ass ? null : null,   // verrà impostato dal popover solo se è click
      started: false,
      startData: data,
    }
  }

  const enterPaint = (op, data, turno, ass) => {
    const p = paintRef.current
    if (!p) return
    // Prima volta che muovi fuori dalla cella originale → è un drag
    if (!p.started && (data !== p.startData || turno !== p.turno || op.id !== p.op.id || op.tipo !== p.op.tipo)) {
      p.started = true
      // Se non abbiamo ancora il cantiere (cella vuota), non facciamo niente senza cantiere
      if (!p.isDelete && !p.cantiereId) return
    }
    if (!p.started) return
    if (op.id !== p.op.id || op.tipo !== p.op.tipo) return   // solo sulla stessa riga

    const body = {
      ...(op.tipo === 'artigiano' ? { artigiano_id: op.id } : { utente_id: op.id }),
      data, turno,
      cantiere_id: p.isDelete ? null : p.cantiereId,
      lavorazione: p.isDelete ? null : (p.lavorazione || null),
    }
    // Evita duplicati
    const key = `${data}_${turno}`
    if (!pendingRef.current.find(b => b.data === data && b.turno === turno &&
        (b.artigiano_id === body.artigiano_id || b.utente_id === body.utente_id))) {
      pendingRef.current.push(body)
    }
    // Salva in batch throttled
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(flushPaint, 400)
  }

  const endClick = (op, data, turno, ass) => {
    const p = paintRef.current
    if (!p) return
    const wasDrag = p.started
    paintRef.current = null
    if (wasDrag) { flushPaint(); return }
    // Era click singolo → apri popover
    setPopover({ op, data, turno })
  }

  const CELL_H = mobile ? 44 : 32
  const NAME_W = mobile ? 100 : 140

  // Righe header e body
  const artigiani = operatori.filter(o => o.tipo === 'artigiano')
  const utentiOp  = operatori.filter(o => o.tipo === 'utente')
  const totalCols = 1 + giorni.length * 2

  const HeaderGruppo = ({ label }) => (
    <tr>
      <td colSpan={totalCols}
        className="px-3 py-1 text-[9px] font-bold uppercase tracking-widest text-gray-400 bg-gray-100 border-b border-gray-200"
        style={{ position: 'sticky', left: 0 }}>
        {label}
      </td>
    </tr>
  )

  const RigaOp = ({ op, zebra }) => (
    <tr className={zebra ? 'bg-gray-50/50' : ''}>
      <td className="sticky left-0 z-10 border-r-2 border-gray-200 border-b border-gray-100 px-2 py-1"
        style={{ background: zebra ? '#f9fafb' : '#fff', minWidth: NAME_W, maxWidth: NAME_W }}>
        <p className="text-xs font-semibold text-gray-800 leading-tight truncate">{op.nome}</p>
        {op.azienda && <p className="text-[10px] text-gray-400 truncate">{op.azienda}</p>}
        {!op.azienda && <p className="text-[10px] text-gray-400 capitalize truncate">{op.categoria}</p>}
      </td>
      {giorni.map(d => {
        const dataStr = d.format('YYYY-MM-DD')
        const isWeekend = d.day() === 0 || d.day() === 6
        const isOggi = d.isSame(oggi, 'day')
        return (['M','P']).map(turno => {
          const key = cellaKey(op, dataStr, turno)
          const ass = assMap[key]
          const colore = colorePerCantiere(ass?.cantiere_id)
          const isPopover = popover?.op.id === op.id && popover?.op.tipo === op.tipo &&
                            popover?.data === dataStr && popover?.turno === turno

          return (
            <td key={`${dataStr}_${turno}`}
              className={`relative border border-gray-100 p-0 select-none
                ${isWeekend ? 'bg-gray-50' : ''}
                ${isOggi ? 'outline outline-1 outline-steelex-orange outline-offset-[-1px]' : ''}`}
              style={{ minWidth: mobile ? 26 : 24, height: CELL_H }}
              onMouseDown={canWrite ? e => { e.preventDefault(); startPaint(e, op, dataStr, turno, ass) } : undefined}
              onMouseEnter={canWrite ? () => enterPaint(op, dataStr, turno, ass) : undefined}
              onMouseUp={canWrite ? () => endClick(op, dataStr, turno, ass) : undefined}
              onTouchStart={canWrite ? e => { e.preventDefault(); startPaint(e, op, dataStr, turno, ass) } : undefined}>
              <div className={`w-full h-full flex items-center justify-center
                ${canWrite ? 'cursor-pointer' : ''}
                ${!ass && canWrite ? 'hover:bg-orange-50' : ''}`}
                style={{ background: colore || undefined }}
                title={ass ? `${ass.cantiere_nome || ''}${ass.lavorazione ? ' — '+ass.lavorazione:''}` : undefined}>
                {ass?.cantiere_nome && (
                  <span className="text-white font-bold pointer-events-none select-none leading-none"
                    style={{ fontSize: mobile ? 8 : 9 }}>
                    {ass.cantiere_nome.slice(0, mobile ? 2 : 3).toUpperCase()}
                  </span>
                )}
              </div>
              {isPopover && (
                <CellaPopover
                  op={op} data={dataStr} turno={turno}
                  assegnazione={ass} cantieri={cantieri}
                  onSalva={body => {
                    // Se l'utente sceglie un cantiere dal popover → imposta come cantiere per future celle paint
                    if (body.cantiere_id && paintRef.current) {
                      paintRef.current.cantiereId = body.cantiere_id
                    }
                    onSalva(body)
                  }}
                  onChiudi={() => setPopover(null)}
                />
              )}
            </td>
          )
        })
      })}
    </tr>
  )

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden"
      style={{ userSelect: 'none' }}>
      <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
        <table className="border-collapse"
          style={{ minWidth: Math.max(NAME_W + 100, NAME_W + giorni.length * (mobile ? 52 : 48)) }}>
          <thead>
            {/* Riga mesi/settimana */}
            <tr style={{ background: '#1e293b' }}>
              <th className="sticky left-0 z-20 px-2 py-2 text-left border-r-2 border-gray-600"
                style={{ background: '#1e293b', minWidth: NAME_W }}>
                <span className="text-[10px] font-bold text-gray-300 uppercase tracking-widest">Operatore</span>
              </th>
              {giorni.map(d => {
                const isWeekend = d.day() === 0 || d.day() === 6
                const isOggi = d.isSame(oggi, 'day')
                return (
                  <th key={d.format('YYYY-MM-DD')} colSpan={2}
                    className={`text-center border-l border-gray-700 py-1 ${isWeekend ? 'opacity-40' : ''}`}
                    style={{ minWidth: mobile ? 52 : 48 }}>
                    <div className={`text-xs font-bold ${isOggi ? 'text-steelex-orange' : 'text-white'}`}>
                      {mobile ? d.format('D') : d.format('D')}
                    </div>
                    <div className="text-[9px] uppercase text-gray-400">{d.format('dd')}</div>
                  </th>
                )
              })}
            </tr>
            {/* Riga M/P */}
            <tr style={{ background: '#f1f5f9' }}>
              <th className="sticky left-0 z-20 border-r-2 border-gray-300 border-b border-gray-200"
                style={{ background: '#f1f5f9', minWidth: NAME_W }} />
              {giorni.map(d => {
                const isWeekend = d.day() === 0 || d.day() === 6
                return (['M','P']).map(t => (
                  <th key={`${d.format('YYYY-MM-DD')}_${t}`}
                    className={`text-center border-l border-gray-200 border-b border-gray-200 py-0.5 ${isWeekend ? 'bg-gray-100' : ''}`}
                    style={{ minWidth: mobile ? 26 : 24 }}>
                    <span className="text-[9px] font-semibold text-gray-400">{t}</span>
                  </th>
                ))
              })}
            </tr>
          </thead>
          <tbody>
            {artigiani.length > 0 && (
              <>
                <HeaderGruppo label="Artigiani / Esterni" />
                {artigiani.map((op, i) => <RigaOp key={`a_${op.id}`} op={op} zebra={i % 2 !== 0} />)}
              </>
            )}
            {utentiOp.length > 0 && (
              <>
                <HeaderGruppo label="Operativi Interni" />
                {utentiOp.map((op, i) => <RigaOp key={`u_${op.id}`} op={op} zebra={i % 2 !== 0} />)}
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Pagina ────────────────────────────────────────────────────────────────────
export default function GanttOperatoriPage() {
  const { utente } = useAuth()
  const qc = useQueryClient()
  const canWrite = ['admin', 'capo_cantiere', 'capo_cantiere_sub', 'amministrazione'].includes(utente?.ruolo)

  const oggi = dayjs()
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640
  const [vista, setVista] = useState(isMobile ? 'settimana' : 'mese')

  // Mese
  const [anno, setAnno] = useState(oggi.year())
  const [mese, setMese] = useState(oggi.month() + 1)

  // Settimana
  const [settAnno, setSettAnno] = useState(oggi.year())
  const [sett, setSett] = useState(oggi.isoWeek())

  const prevMese = () => {
    const d = dayjs(`${anno}-${mese}-01`).subtract(1, 'month')
    setAnno(d.year()); setMese(d.month() + 1)
  }
  const nextMese = () => {
    const d = dayjs(`${anno}-${mese}-01`).add(1, 'month')
    setAnno(d.year()); setMese(d.month() + 1)
  }
  const prevSett = () => {
    const d = dayjs().year(settAnno).isoWeek(sett).subtract(1, 'week')
    setSettAnno(d.year()); setSett(d.isoWeek())
  }
  const nextSett = () => {
    const d = dayjs().year(settAnno).isoWeek(sett).add(1, 'week')
    setSettAnno(d.year()); setSett(d.isoWeek())
  }

  const giorni = useMemo(() => {
    if (vista === 'mese') {
      const primo = dayjs(`${anno}-${String(mese).padStart(2,'0')}-01`)
      return Array.from({ length: primo.daysInMonth() }, (_, i) => primo.add(i, 'day'))
    } else {
      const lunedi = dayjs().year(settAnno).isoWeek(sett).isoWeekday(1)
      return Array.from({ length: 6 }, (_, i) => lunedi.add(i, 'day'))  // lun-sab
    }
  }, [vista, anno, mese, settAnno, sett])

  // Parametri query assegnazioni
  const queryKey = vista === 'mese'
    ? ['assegnazioni', anno, mese]
    : ['assegnazioni', giorni[0]?.format('YYYY-MM-DD'), giorni[giorni.length-1]?.format('YYYY-MM-DD')]
  const queryParams = vista === 'mese'
    ? { anno, mese }
    : { data_inizio: giorni[0]?.format('YYYY-MM-DD'), data_fine: giorni[giorni.length-1]?.format('YYYY-MM-DD') }

  const { data: operatori = [], isLoading } = useQuery(
    'operatori-gantt',
    () => api.get('/assegnazioni/operatori').then(r => r.data),
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
    queryKey,
    () => api.get('/assegnazioni', { params: queryParams }).then(r => r.data),
    { staleTime: 0, enabled: giorni.length > 0 }
  )

  const assMap = useMemo(() => {
    const map = {}
    assegnazioni.forEach(a => {
      if (a.artigiano_id) map[`artigiano_${a.artigiano_id}_${a.data}_${a.turno}`] = a
      if (a.utente_id)    map[`utente_${a.utente_id}_${a.data}_${a.turno}`] = a
    })
    return map
  }, [assegnazioni])

  const usatiIds = useMemo(() => new Set(assegnazioni.map(a => a.cantiere_id).filter(Boolean)), [assegnazioni])

  const upsertMutation = useMutation(
    body => api.put('/assegnazioni', body),
    {
      onSuccess: () => qc.invalidateQueries(queryKey),
      onError: e => toast.error(e.response?.data?.detail || 'Errore'),
    }
  )

  const navLabel = vista === 'mese'
    ? dayjs(`${anno}-${String(mese).padStart(2,'0')}-01`).format('MMMM YYYY')
    : (() => {
        const lun = dayjs().year(settAnno).isoWeek(sett).isoWeekday(1)
        return `${lun.format('D MMM')} – ${lun.add(5,'day').format('D MMM YYYY')} (sett. ${sett})`
      })()

  const isOggi = vista === 'mese'
    ? (anno === oggi.year() && mese === oggi.month() + 1)
    : (settAnno === oggi.year() && sett === oggi.isoWeek())

  if (isLoading) return <div className="text-center py-12 text-gray-400">Caricamento...</div>

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Users size={20} className="text-steelex-orange" />
          <div>
            <h1 className="text-lg font-bold text-gray-900">Gantt Operatori</h1>
            <p className="text-xs text-gray-400">{operatori.filter(o=>o.tipo==='artigiano').length} artigiani · {operatori.filter(o=>o.tipo==='utente').length} interni</p>
          </div>
        </div>
        {/* Toggle vista */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          <button onClick={() => setVista('settimana')}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${vista==='settimana' ? 'bg-white shadow text-steelex-orange' : 'text-gray-500'}`}>
            <Calendar size={13} /> Settimana
          </button>
          <button onClick={() => setVista('mese')}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${vista==='mese' ? 'bg-white shadow text-steelex-orange' : 'text-gray-500'}`}>
            <CalendarDays size={13} /> Mese
          </button>
        </div>
      </div>

      {/* Navigazione */}
      <div className="flex items-center gap-2 bg-white rounded-xl border border-gray-100 shadow-sm p-2.5">
        <button onClick={vista === 'mese' ? prevMese : prevSett}
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors">
          <ChevronLeft size={18} />
        </button>
        <div className="flex-1 text-center">
          <p className="font-semibold text-gray-900 text-sm capitalize">{navLabel}</p>
          {isOggi && <span className="text-xs text-steelex-orange font-semibold">{vista === 'mese' ? 'Mese corrente' : 'Settimana corrente'}</span>}
        </div>
        <button onClick={vista === 'mese' ? nextMese : nextSett}
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors">
          <ChevronRight size={18} />
        </button>
      </div>

      {canWrite && (
        <p className="text-xs text-gray-400 px-1">
          💡 <strong>Trascina</strong> su più celle per assegnare in serie — <strong>click singolo</strong> per scegliere cantiere e lavorazione
        </p>
      )}

      {operatori.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">
          <Users size={36} className="mx-auto mb-2 opacity-30" />
          <p className="font-medium">Nessun operatore trovato</p>
          <p className="text-sm mt-1">Aggiungi artigiani dalla Rubrica o crea utenti operativi</p>
        </div>
      ) : (
        <>
          <GrigliaGantt
            operatori={operatori}
            giorni={giorni}
            assMap={assMap}
            cantieri={cantieri}
            onSalva={body => upsertMutation.mutate(body)}
            canWrite={canWrite}
            oggi={oggi}
            mobile={vista === 'settimana' || isMobile}
          />
          <Legenda cantieri={cantieri} usatiIds={usatiIds} />
          {!canWrite && (
            <p className="text-xs text-gray-400 text-center">Solo admin e capo cantiere possono modificare le assegnazioni</p>
          )}
        </>
      )}
    </div>
  )
}
