/**
 * Gantt mensile/settimanale operatori
 * Desktop: griglia M/P separata + drag con pointermove
 * Mobile: griglia M/P sovrapposta (mattina sopra, pomeriggio sotto)
 *   - modalità normale: scroll orizzontale + click per popover
 *   - modalità assegna (FAB): touch drag per assegnare più celle
 */
import { useState, useMemo, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { ChevronLeft, ChevronRight, X, Users, CalendarDays, Calendar, PenLine } from 'lucide-react'
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
const getColore = id => id ? PALETTE[(id - 1) % PALETTE.length] : null

function ck(tipo, id, data, turno) { return `${tipo}__${id}__${data}__${turno}` }
function parseKey(k) { const [tipo, id, data, turno] = k.split('__'); return { tipo, id: parseInt(id), data, turno } }

// ── Popover ───────────────────────────────────────────────────────────────────
function Popover({ op, data, turno, ass, cantieri, onSalva, onChiudi, rangeCelle }) {
  const [cantiereId, setCantiereId] = useState(ass?.cantiere_id ?? '')
  const [lavorazione, setLavorazione] = useState(ass?.lavorazione ?? '')
  const ref = useRef(null)
  const isRange = rangeCelle?.length > 1
  const celle = isRange ? rangeCelle : [{ op, data, turno }]

  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) onChiudi() }
    const t = setTimeout(() => document.addEventListener('pointerdown', h), 50)
    return () => { clearTimeout(t); document.removeEventListener('pointerdown', h) }
  }, [onChiudi])

  const salva = () => {
    celle.forEach(c => onSalva({
      ...(c.op.tipo === 'artigiano' ? { artigiano_id: c.op.id } : { utente_id: c.op.id }),
      data: c.data, turno: c.turno,
      cantiere_id: cantiereId ? parseInt(cantiereId) : null,
      lavorazione: lavorazione || null,
    }))
    onChiudi()
  }
  const svuota = () => {
    celle.forEach(c => onSalva({
      ...(c.op.tipo === 'artigiano' ? { artigiano_id: c.op.id } : { utente_id: c.op.id }),
      data: c.data, turno: c.turno, cantiere_id: null, lavorazione: null,
    }))
    onChiudi()
  }

  return (
    <div ref={ref} onPointerDown={e => e.stopPropagation()}
      className="absolute z-50 bg-white border border-gray-200 rounded-xl shadow-2xl p-3"
      style={{ top: '100%', left: 0, minWidth: 230, width: 250 }}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-bold text-gray-800 truncate pr-2">
          {isRange
            ? `${op.nome} — ${rangeCelle.length} turni`
            : `${op.nome} — ${turno === 'M' ? 'Mattina' : 'Pomeriggio'} ${dayjs(data).format('D/M')}`}
        </p>
        <button onClick={onChiudi} className="text-gray-300 hover:text-gray-500"><X size={14}/></button>
      </div>
      <select autoFocus value={cantiereId} onChange={e => setCantiereId(e.target.value)}
        className="w-full border border-gray-200 rounded-lg px-2 py-2 text-xs mb-2 focus:outline-none focus:ring-2 focus:ring-steelex-orange">
        <option value="">— nessun cantiere —</option>
        {cantieri.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
      </select>
      <input type="text" placeholder="Lavorazione..." value={lavorazione}
        onChange={e => setLavorazione(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && salva()}
        className="w-full border border-gray-200 rounded-lg px-2 py-2 text-xs mb-2 focus:outline-none focus:ring-2 focus:ring-steelex-orange" />
      <div className="flex gap-1.5">
        <button onClick={salva}
          className="flex-1 py-2 bg-steelex-orange text-white text-xs font-bold rounded-lg hover:bg-orange-600 transition-colors">
          Salva{isRange ? ` (${rangeCelle.length})` : ''}
        </button>
        {(ass || isRange) && (
          <button onClick={svuota}
            className="px-3 py-2 border border-red-200 text-red-500 text-xs font-semibold rounded-lg hover:bg-red-50 transition-colors">
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
  if (!usati.length) return null
  return (
    <div className="flex flex-wrap gap-2 mt-2 px-1">
      {usati.map(c => (
        <div key={c.id} className="flex items-center gap-1.5 text-xs text-gray-600">
          <div className="w-3 h-3 rounded-sm" style={{ background: getColore(c.id) }}/>{c.nome}
        </div>
      ))}
    </div>
  )
}

// ── Hook drag condiviso (desktop pointer + mobile touch in modalità assegna) ──
function useDrag({ canWrite, assMapRef, opRef, onSalvaRef, setSelKeys, setPopover }) {
  const dragRef = useRef(null)
  const selRef  = useRef(new Set())

  const startDrag = (op, data, turno) => {
    if (!canWrite) return
    const ass = assMapRef.current[ck(op.tipo, op.id, data, turno)]
    dragRef.current = { op, startData: data, startTurno: turno, cantiereId: ass?.cantiere_id ?? null, lavorazione: ass?.lavorazione ?? null }
    selRef.current = new Set([ck(op.tipo, op.id, data, turno)])
    setSelKeys(new Set(selRef.current))
    setPopover(null)
  }

  const moveDrag = (x, y) => {
    if (!dragRef.current) return
    const td = document.elementFromPoint(x, y)?.closest('[data-cella]')
    if (!td) return
    const { tipo, id, data, turno } = td.dataset
    const d = dragRef.current
    if (tipo !== d.op.tipo || parseInt(id) !== d.op.id) return
    const key = ck(tipo, id, data, turno)
    if (!selRef.current.has(key)) {
      selRef.current = new Set([...selRef.current, key])
      setSelKeys(new Set(selRef.current))
    }
  }

  const endDrag = () => {
    const d = dragRef.current
    if (!d) return
    dragRef.current = null
    const sel = [...selRef.current]
    selRef.current = new Set()
    setSelKeys(new Set())

    if (sel.length <= 1) {
      setPopover({ op: d.op, data: d.startData, turno: d.startTurno })
      return
    }
    const celle = sel.map(k => {
      const p = parseKey(k)
      const op2 = opRef.current.find(o => o.tipo === p.tipo && o.id === p.id)
      return op2 ? { op: op2, data: p.data, turno: p.turno } : null
    }).filter(Boolean)

    if (d.cantiereId) {
      celle.forEach(c => onSalvaRef.current({
        ...(c.op.tipo === 'artigiano' ? { artigiano_id: c.op.id } : { utente_id: c.op.id }),
        data: c.data, turno: c.turno, cantiere_id: d.cantiereId, lavorazione: d.lavorazione || null,
      }))
    } else {
      setPopover({ op: d.op, data: d.startData, turno: d.startTurno, rangeCelle: celle })
    }
  }

  return { dragRef, startDrag, moveDrag, endDrag }
}

// ── Griglia DESKTOP ───────────────────────────────────────────────────────────
function GrigliaDesktop({ operatori, giorni, assMap, cantieri, onSalva, canWrite, oggi }) {
  const [popover, setPopover] = useState(null)
  const [selKeys, setSelKeys] = useState(new Set())
  const assMapRef  = useRef(assMap)
  const opRef      = useRef(operatori)
  const onSalvaRef = useRef(onSalva)
  useEffect(() => { assMapRef.current = assMap }, [assMap])
  useEffect(() => { opRef.current = operatori }, [operatori])
  useEffect(() => { onSalvaRef.current = onSalva }, [onSalva])

  const { startDrag, moveDrag, endDrag } = useDrag({ canWrite, assMapRef, opRef, onSalvaRef, setSelKeys, setPopover })

  useEffect(() => {
    if (!canWrite) return
    const onMove = e => { if (!e.buttons) return; moveDrag(e.clientX, e.clientY) }
    const onUp = () => endDrag()
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    return () => { document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp) }
  }, [canWrite]) // eslint-disable-line

  const artigiani = operatori.filter(o => o.tipo === 'artigiano')
  const utentiOp  = operatori.filter(o => o.tipo === 'utente')

  const CellaMP = ({ op, d }) => {
    const dataStr = d.format('YYYY-MM-DD')
    const isWeekend = d.day() === 0 || d.day() === 6
    const isOggi = d.isSame(oggi, 'day')
    return ['M','P'].map(turno => {
      const key = ck(op.tipo, op.id, dataStr, turno)
      const ass = assMap[key]
      const col = getColore(ass?.cantiere_id)
      const isSel = selKeys.has(key)
      const isOpen = popover?.op.id===op.id && popover?.op.tipo===op.tipo && popover?.data===dataStr && popover?.turno===turno
      return (
        <td key={key} data-cella="1" data-tipo={op.tipo} data-id={op.id} data-data={dataStr} data-turno={turno}
          className={`relative border border-gray-100 p-0 select-none ${isWeekend && !ass ? 'bg-gray-50' : ''} ${isOggi ? 'ring-1 ring-inset ring-steelex-orange' : ''}`}
          style={{ width: 24, minWidth: 24, height: 30 }}
          onPointerDown={canWrite ? e => { e.preventDefault(); startDrag(op, dataStr, turno) } : undefined}>
          <div className={`w-full h-full flex items-center justify-center ${canWrite ? 'cursor-pointer' : ''} ${!ass && !isSel && canWrite ? 'hover:bg-orange-50' : ''}`}
            style={{ background: isSel ? (col || '#fdba74') : (col || undefined) }}
            title={ass ? `${ass.cantiere_nome||''}${ass.lavorazione?' — '+ass.lavorazione:''}` : undefined}>
            {ass?.cantiere_nome && <span className="text-white font-bold pointer-events-none" style={{ fontSize: 8 }}>{ass.cantiere_nome.slice(0,3).toUpperCase()}</span>}
          </div>
          {isOpen && <Popover op={op} data={dataStr} turno={turno} ass={ass} cantieri={cantieri} rangeCelle={popover.rangeCelle} onSalva={onSalva} onChiudi={() => setPopover(null)}/>}
        </td>
      )
    })
  }

  const Riga = ({ op, zebra }) => (
    <tr className={zebra ? 'bg-gray-50/40' : ''}>
      <td className="sticky left-0 z-10 border-r-2 border-gray-200 border-b border-gray-100 px-2 py-1"
        style={{ background: zebra ? '#f9fafb' : '#fff', minWidth: 140, maxWidth: 140 }}>
        <p className="text-xs font-semibold text-gray-800 truncate">{op.nome}</p>
        <p className="text-[10px] text-gray-400 truncate capitalize">{op.azienda || op.categoria}</p>
      </td>
      {giorni.map(d => <CellaMP key={d.format('YYYY-MM-DD')} op={op} d={d}/>)}
    </tr>
  )

  const Gruppo = ({ label }) => (
    <tr><td colSpan={1 + giorni.length * 2}
      className="px-3 py-1 text-[9px] font-bold uppercase tracking-widest text-gray-400 bg-gray-100 border-b border-gray-200"
      style={{ position: 'sticky', left: 0 }}>{label}</td></tr>
  )

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden" style={{ userSelect: 'none' }}>
      <div className="overflow-x-auto">
        <table className="border-collapse" style={{ minWidth: 140 + giorni.length * 48 }}>
          <thead>
            <tr style={{ background: '#1e293b' }}>
              <th className="sticky left-0 z-20 px-2 py-2 text-left border-r-2 border-gray-600"
                style={{ background: '#1e293b', minWidth: 140 }}>
                <span className="text-[10px] font-bold text-gray-300 uppercase tracking-widest">Operatore</span>
              </th>
              {giorni.map(d => {
                const isOggi = d.isSame(oggi,'day')
                return <th key={d.format('YYYY-MM-DD')} colSpan={2}
                  className={`text-center border-l border-gray-700 py-1 ${d.day()===0||d.day()===6?'opacity-40':''}`}
                  style={{ minWidth: 48 }}>
                  <div className={`text-xs font-bold ${isOggi?'text-steelex-orange':'text-white'}`}>{d.format('D')}</div>
                  <div className="text-[9px] uppercase text-gray-400">{d.format('dd')}</div>
                </th>
              })}
            </tr>
            <tr style={{ background: '#f1f5f9' }}>
              <th className="sticky left-0 z-20 border-r-2 border-gray-300 border-b border-gray-200" style={{ background: '#f1f5f9', minWidth: 140 }}/>
              {giorni.map(d => ['M','P'].map(t => (
                <th key={`${d.format('YYYY-MM-DD')}_${t}`}
                  className={`text-center border-l border-gray-200 border-b border-gray-200 py-0.5 ${d.day()===0||d.day()===6?'bg-gray-100':''}`}
                  style={{ width: 24 }}>
                  <span className="text-[9px] font-semibold text-gray-400">{t}</span>
                </th>
              )))}
            </tr>
          </thead>
          <tbody>
            {artigiani.length > 0 && <><Gruppo label="Artigiani / Esterni"/>{artigiani.map((op,i)=><Riga key={`a_${op.id}`} op={op} zebra={i%2!==0}/>)}</>}
            {utentiOp.length > 0 && <><Gruppo label="Operativi Interni"/>{utentiOp.map((op,i)=><Riga key={`u_${op.id}`} op={op} zebra={i%2!==0}/>)}</>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Griglia MOBILE ────────────────────────────────────────────────────────────
function GrigliaMobile({ operatori, giorni, assMap, cantieri, onSalva, canWrite, oggi, modalitaAssegna }) {
  const [popover, setPopover] = useState(null)
  const [selKeys, setSelKeys] = useState(new Set())
  const assMapRef  = useRef(assMap)
  const opRef      = useRef(operatori)
  const onSalvaRef = useRef(onSalva)
  useEffect(() => { assMapRef.current = assMap }, [assMap])
  useEffect(() => { opRef.current = operatori }, [operatori])
  useEffect(() => { onSalvaRef.current = onSalva }, [onSalva])

  const { startDrag, moveDrag, endDrag } = useDrag({ canWrite, assMapRef, opRef, onSalvaRef, setSelKeys, setPopover })

  // Listener touch solo quando modalità assegna è attiva
  useEffect(() => {
    if (!canWrite || !modalitaAssegna) return
    const onMove = e => {
      e.preventDefault()
      const t = e.touches[0]
      moveDrag(t.clientX, t.clientY)
    }
    const onEnd = () => endDrag()
    document.addEventListener('touchmove', onMove, { passive: false })
    document.addEventListener('touchend', onEnd)
    return () => {
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onEnd)
    }
  }, [canWrite, modalitaAssegna]) // eslint-disable-line

  const artigiani = operatori.filter(o => o.tipo === 'artigiano')
  const utentiOp  = operatori.filter(o => o.tipo === 'utente')

  const CELL_W = Math.max(34, Math.floor((window.innerWidth - 90) / Math.min(giorni.length, 10)))
  const NAME_W = 88

  const CellaGiorno = ({ op, d }) => {
    const dataStr = d.format('YYYY-MM-DD')
    const isWeekend = d.day() === 0 || d.day() === 6
    const isOggi = d.isSame(oggi, 'day')

    return ['M','P'].map(turno => {
      const key = ck(op.tipo, op.id, dataStr, turno)
      const ass = assMap[key]
      const col = getColore(ass?.cantiere_id)
      const isSel = selKeys.has(key)
      const isOpen = popover?.op.id===op.id && popover?.op.tipo===op.tipo && popover?.data===dataStr && popover?.turno===turno

      const bg = isSel ? (col || '#fdba74') : (col || undefined)

      return (
        <td key={key} data-cella="1" data-tipo={op.tipo} data-id={op.id} data-data={dataStr} data-turno={turno}
          className={`relative border-r border-gray-100 p-0 ${isWeekend && !ass ? '' : ''}`}
          style={{
            width: CELL_W,
            height: 28,
            background: bg || (isWeekend ? '#f9fafb' : undefined),
            borderBottom: '1px solid #f3f4f6',
            outline: isOggi ? '1px solid #FF6B00' : undefined,
            outlineOffset: isOggi ? '-1px' : undefined,
          }}
          onTouchStart={canWrite && modalitaAssegna ? e => { e.preventDefault(); startDrag(op, dataStr, turno) } : undefined}
          onClick={canWrite && !modalitaAssegna ? () => setPopover({ op, data: dataStr, turno }) : undefined}>
          <div className="w-full h-full flex items-center justify-center">
            {ass?.cantiere_nome
              ? <span className="text-white font-bold pointer-events-none select-none" style={{ fontSize: 8 }}>{ass.cantiere_nome.slice(0,3).toUpperCase()}</span>
              : <span style={{ fontSize: 7, color: isSel ? '#fff' : '#d1d5db' }}>{turno}</span>
            }
          </div>
          {isOpen && <Popover op={op} data={dataStr} turno={turno} ass={ass} cantieri={cantieri} onSalva={onSalva} onChiudi={() => setPopover(null)}/>}
        </td>
      )
    })
  }

  // Raggruppiamo per righe: ogni riga = un operatore, ogni coppia di td = un giorno (M sopra, P sotto)
  // Ma con la struttura a tabella dobbiamo fare 2 righe per operatore (una M, una P)
  const RigheOp = ({ op, zebra }) => {
    const bg = zebra ? '#f9fafb' : '#fff'
    const celleTurno = (turno) => giorni.map(d => {
      const dataStr = d.format('YYYY-MM-DD')
      const isWeekend = d.day() === 0 || d.day() === 6
      const isOggi = d.isSame(oggi, 'day')
      const key = ck(op.tipo, op.id, dataStr, turno)
      const ass = assMap[key]
      const col = getColore(ass?.cantiere_id)
      const isSel = selKeys.has(key)
      const isOpen = popover?.op.id===op.id && popover?.op.tipo===op.tipo && popover?.data===dataStr && popover?.turno===turno
      const bg2 = isSel ? (col || '#fdba74') : (col || (isWeekend ? '#f9fafb' : undefined))

      return (
        <td key={key} data-cella="1" data-tipo={op.tipo} data-id={op.id} data-data={dataStr} data-turno={turno}
          className="relative p-0 select-none"
          style={{
            width: CELL_W, minWidth: CELL_W, height: 24,
            background: bg2,
            border: '1px solid #f3f4f6',
            outline: isOggi ? '1px solid #FF6B00' : undefined,
            outlineOffset: isOggi ? '-1px' : undefined,
          }}
          onTouchStart={canWrite && modalitaAssegna ? e => { e.preventDefault(); startDrag(op, dataStr, turno) } : undefined}
          onClick={canWrite && !modalitaAssegna ? () => setPopover({ op, data: dataStr, turno }) : undefined}>
          <div className="w-full h-full flex items-center justify-center">
            {ass?.cantiere_nome
              ? <span className="font-bold pointer-events-none select-none text-white" style={{ fontSize: 7 }}>{ass.cantiere_nome.slice(0,3).toUpperCase()}</span>
              : null}
          </div>
          {isOpen && <Popover op={op} data={dataStr} turno={turno} ass={ass} cantieri={cantieri} onSalva={onSalva} onChiudi={() => setPopover(null)}/>}
        </td>
      )
    })

    return (
      <>
        {/* Riga nome + Mattina */}
        <tr>
          <td rowSpan={2} className="sticky left-0 z-10 border-r-2 border-gray-200 px-1.5"
            style={{ background: bg, minWidth: NAME_W, maxWidth: NAME_W, width: NAME_W, verticalAlign: 'middle', borderBottom: '2px solid #e5e7eb' }}>
            <p className="font-semibold text-gray-800 leading-tight truncate" style={{ fontSize: 11 }}>
              {op.nome.split(' ').slice(0,2).join(' ')}
            </p>
            <p className="text-gray-400 truncate capitalize" style={{ fontSize: 9 }}>{op.azienda || op.categoria}</p>
          </td>
          {celleTurno('M')}
        </tr>
        {/* Riga Pomeriggio */}
        <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
          {celleTurno('P')}
        </tr>
      </>
    )
  }

  const Gruppo = ({ label, colSpan }) => (
    <tr><td colSpan={colSpan}
      className="px-2 py-1 text-[9px] font-bold uppercase tracking-widest text-gray-400 bg-gray-100 border-b border-gray-200"
      style={{ position: 'sticky', left: 0 }}>{label}</td></tr>
  )

  const totalCols = 1 + giorni.length

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
        <table className="border-collapse" style={{ tableLayout: 'fixed', minWidth: NAME_W + giorni.length * CELL_W }}>
          <thead>
            <tr style={{ background: '#1e293b' }}>
              <th className="sticky left-0 z-20 px-1.5 py-2 text-left border-r-2 border-gray-600"
                style={{ background: '#1e293b', width: NAME_W, minWidth: NAME_W }}>
                <span style={{ fontSize: 9 }} className="font-bold text-gray-300 uppercase tracking-widest">Nome</span>
              </th>
              {giorni.map(d => {
                const isOggi = d.isSame(oggi,'day')
                const isWeekend = d.day()===0||d.day()===6
                return <th key={d.format('YYYY-MM-DD')}
                  className={`text-center border-l border-gray-700 py-1 ${isWeekend?'opacity-50':''}`}
                  style={{ width: CELL_W, minWidth: CELL_W }}>
                  <div className={`font-bold ${isOggi?'text-steelex-orange':'text-white'}`} style={{ fontSize: 11 }}>{d.format('D')}</div>
                  <div className="uppercase text-gray-400" style={{ fontSize: 8 }}>{d.format('dd')}</div>
                </th>
              })}
            </tr>
            {/* Riga M/P */}
            <tr style={{ background: '#f8fafc' }}>
              <th className="sticky left-0 z-20 border-r-2 border-gray-200 border-b border-gray-200"
                style={{ background: '#f8fafc', width: NAME_W }}/>
              {giorni.map(d => (
                <th key={d.format('YYYY-MM-DD')} className="border-l border-gray-200 border-b border-gray-200 p-0"
                  style={{ width: CELL_W }}>
                  <div className="flex flex-col text-center" style={{ fontSize: 7, color: '#cbd5e1', lineHeight: '14px' }}>
                    <span style={{ borderBottom: '1px solid #f1f5f9' }}>M</span>
                    <span>P</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {artigiani.length > 0 && <>
              <Gruppo label="Artigiani / Esterni" colSpan={totalCols}/>
              {artigiani.map((op,i) => <RigheOp key={`a_${op.id}`} op={op} zebra={i%2!==0}/>)}
            </>}
            {utentiOp.length > 0 && <>
              <Gruppo label="Operativi Interni" colSpan={totalCols}/>
              {utentiOp.map((op,i) => <RigheOp key={`u_${op.id}`} op={op} zebra={i%2!==0}/>)}
            </>}
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
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
  const [vista, setVista] = useState(isMobile ? 'settimana' : 'mese')
  const [modalitaAssegna, setModalitaAssegna] = useState(false)

  const [anno, setAnno] = useState(oggi.year())
  const [mese, setMese] = useState(oggi.month() + 1)
  const [settAnno, setSettAnno] = useState(oggi.year())
  const [sett, setSett] = useState(oggi.isoWeek())

  const prevMese = () => { const d = dayjs(`${anno}-${mese}-01`).subtract(1,'month'); setAnno(d.year()); setMese(d.month()+1) }
  const nextMese = () => { const d = dayjs(`${anno}-${mese}-01`).add(1,'month'); setAnno(d.year()); setMese(d.month()+1) }
  const prevSett = () => { const d = dayjs().year(settAnno).isoWeek(sett).subtract(1,'week'); setSettAnno(d.year()); setSett(d.isoWeek()) }
  const nextSett = () => { const d = dayjs().year(settAnno).isoWeek(sett).add(1,'week'); setSettAnno(d.year()); setSett(d.isoWeek()) }

  const giorni = useMemo(() => {
    if (vista === 'mese') {
      const primo = dayjs(`${anno}-${String(mese).padStart(2,'0')}-01`)
      return Array.from({ length: primo.daysInMonth() }, (_, i) => primo.add(i, 'day'))
    }
    const lun = dayjs().year(settAnno).isoWeek(sett).isoWeekday(1)
    return Array.from({ length: 6 }, (_, i) => lun.add(i, 'day'))
  }, [vista, anno, mese, settAnno, sett])

  const queryKey = useMemo(() =>
    vista === 'mese'
      ? ['assegnazioni', anno, mese]
      : ['assegnazioni', giorni[0]?.format('YYYY-MM-DD'), giorni[giorni.length-1]?.format('YYYY-MM-DD')]
  , [vista, anno, mese, giorni])

  const queryParams = useMemo(() =>
    vista === 'mese'
      ? { anno, mese }
      : { data_inizio: giorni[0]?.format('YYYY-MM-DD'), data_fine: giorni[giorni.length-1]?.format('YYYY-MM-DD') }
  , [vista, anno, mese, giorni])

  const { data: operatori = [], isLoading } = useQuery('operatori-gantt', () => api.get('/assegnazioni/operatori').then(r => r.data), { staleTime: 60000 })
  const { data: cantieri = [] } = useQuery('cantieri-attivi-gantt', () => api.get('/cantieri').then(r => r.data.filter(c => ['attivo','in_corso','preventivo'].includes(c.stato))), { staleTime: 60000 })
  const { data: assegnazioni = [] } = useQuery(queryKey, () => api.get('/assegnazioni', { params: queryParams }).then(r => r.data), { staleTime: 0, enabled: giorni.length > 0 })

  const assMap = useMemo(() => {
    const map = {}
    assegnazioni.forEach(a => {
      if (a.artigiano_id) map[ck('artigiano', a.artigiano_id, a.data, a.turno)] = a
      if (a.utente_id)    map[ck('utente', a.utente_id, a.data, a.turno)] = a
    })
    return map
  }, [assegnazioni])

  const usatiIds = useMemo(() => new Set(assegnazioni.map(a => a.cantiere_id).filter(Boolean)), [assegnazioni])
  const salva = body => upsertMutation.mutate(body)

  const upsertMutation = useMutation(
    body => api.put('/assegnazioni', body),
    { onSuccess: () => qc.invalidateQueries(queryKey), onError: e => toast.error(e.response?.data?.detail || 'Errore') }
  )

  const navLabel = vista === 'mese'
    ? dayjs(`${anno}-${String(mese).padStart(2,'0')}-01`).format('MMMM YYYY')
    : (() => { const l = dayjs().year(settAnno).isoWeek(sett).isoWeekday(1); return `${l.format('D MMM')} – ${l.add(5,'day').format('D MMM YYYY')}` })()

  const isOggi = vista === 'mese'
    ? (anno === oggi.year() && mese === oggi.month()+1)
    : (settAnno === oggi.year() && sett === oggi.isoWeek())

  if (isLoading) return <div className="text-center py-12 text-gray-400">Caricamento...</div>

  const usaMobile = isMobile

  return (
    <div className="space-y-3 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Users size={20} className="text-steelex-orange"/>
          <div>
            <h1 className="text-lg font-bold text-gray-900">Gantt Operatori</h1>
            <p className="text-xs text-gray-400">{operatori.filter(o=>o.tipo==='artigiano').length} artigiani · {operatori.filter(o=>o.tipo==='utente').length} interni</p>
          </div>
        </div>
        {!usaMobile && (
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            <button onClick={() => setVista('settimana')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${vista==='settimana'?'bg-white shadow text-steelex-orange':'text-gray-500'}`}>
              <Calendar size={13}/> Settimana
            </button>
            <button onClick={() => setVista('mese')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${vista==='mese'?'bg-white shadow text-steelex-orange':'text-gray-500'}`}>
              <CalendarDays size={13}/> Mese
            </button>
          </div>
        )}
      </div>

      {/* Navigazione */}
      <div className="flex items-center gap-2 bg-white rounded-xl border border-gray-100 shadow-sm p-2.5">
        <button onClick={vista==='mese' ? prevMese : prevSett} className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"><ChevronLeft size={18}/></button>
        <div className="flex-1 text-center">
          <p className="font-semibold text-gray-900 text-sm capitalize">{navLabel}</p>
          {isOggi && <span className="text-xs text-steelex-orange font-semibold">{vista==='mese'?'Mese corrente':'Settimana corrente'}</span>}
        </div>
        <button onClick={vista==='mese' ? nextMese : nextSett} className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"><ChevronRight size={18}/></button>
      </div>

      {!usaMobile && canWrite && (
        <p className="text-xs text-gray-400 px-1">
          💡 <strong>Click</strong> per assegnare · <strong>Trascina</strong> per più turni · Trascina da cella colorata per <strong>replicare</strong>
        </p>
      )}

      {operatori.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">
          <Users size={36} className="mx-auto mb-2 opacity-30"/>
          <p className="font-medium">Nessun operatore trovato</p>
        </div>
      ) : (
        <>
          {usaMobile
            ? <GrigliaMobile operatori={operatori} giorni={giorni} assMap={assMap} cantieri={cantieri}
                onSalva={salva} canWrite={canWrite} oggi={oggi} modalitaAssegna={modalitaAssegna}/>
            : <GrigliaDesktop operatori={operatori} giorni={giorni} assMap={assMap} cantieri={cantieri}
                onSalva={salva} canWrite={canWrite} oggi={oggi}/>
          }
          <Legenda cantieri={cantieri} usatiIds={usatiIds}/>
        </>
      )}

      {/* FAB modalità assegna — solo mobile + canWrite */}
      {usaMobile && canWrite && (
        <button
          onClick={() => setModalitaAssegna(v => !v)}
          className={`fixed bottom-6 right-4 z-40 flex items-center gap-2 px-4 py-3 rounded-full shadow-lg font-semibold text-sm transition-all
            ${modalitaAssegna
              ? 'bg-steelex-orange text-white shadow-orange-200'
              : 'bg-white text-gray-700 border border-gray-200 shadow-gray-100'}`}>
          <PenLine size={16}/>
          {modalitaAssegna ? 'Assegna attivo — tocca/trascina' : 'Modalità assegna'}
        </button>
      )}
    </div>
  )
}
