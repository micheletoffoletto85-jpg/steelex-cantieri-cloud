/**
 * Gantt mensile/settimanale operatori
 * Desktop: griglia M/P separata + drag con pointermove
 * Mobile: griglia M/P sovrapposta (mattina sopra, pomeriggio sotto)
 *   - modalità normale: scroll orizzontale + click per popover
 *   - modalità assegna (FAB): touch drag per assegnare più celle
 */
import React, { useState, useMemo, useRef, useEffect } from 'react'
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

// Programmazione libera: attività fuori cantiere con colori fissi
const TIPI_LIBERI = {
  ferie:    { label: 'Ferie',    sigla: 'FER', colore: '#eab308' },
  corso:    { label: 'Corso',    sigla: 'COR', colore: '#7c3aed' },
  permesso: { label: 'Permesso', sigla: 'PRM', colore: '#db2777' },
  altro:    { label: 'Altro',    sigla: 'ALT', colore: '#475569' },
}
const isLibera = ass => ass?.tipo && ass.tipo !== 'cantiere'
const coloreAss = ass => !ass ? null : (isLibera(ass) ? (TIPI_LIBERI[ass.tipo]?.colore || '#475569') : getColore(ass.cantiere_id))
const siglaAss = ass => isLibera(ass)
  ? (TIPI_LIBERI[ass.tipo]?.sigla || 'ALT')
  : (ass?.cantiere_nome ? ass.cantiere_nome.slice(0,3).toUpperCase() : null)
const labelAss = ass => isLibera(ass) ? (TIPI_LIBERI[ass.tipo]?.label || 'Altro') : (ass?.cantiere_nome || '')

function ck(tipo, id, data, turno) { return `${tipo}__${id}__${data}__${turno}` }
function parseKey(k) { const [tipo, id, data, turno] = k.split('__'); return { tipo, id: parseInt(id), data, turno } }

// ── Popover ───────────────────────────────────────────────────────────────────
function Popover({ op, data, turno, ass, cantieri, onSalva, onChiudi, rangeCelle, cantiereIdIniziale, lavorazioneIniziale, tipoIniziale }) {
  const [tipoAtt, setTipoAtt] = useState(tipoIniziale ?? ass?.tipo ?? 'cantiere')
  const [cantiereId, setCantiereId] = useState(cantiereIdIniziale ?? ass?.cantiere_id ?? '')
  const [lavorazione, setLavorazione] = useState(lavorazioneIniziale ?? ass?.lavorazione ?? '')
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
      tipo: tipoAtt,
      cantiere_id: tipoAtt === 'cantiere' && cantiereId ? parseInt(cantiereId) : null,
      lavorazione: lavorazione || null,
    }))
    onChiudi()
  }
  const svuota = () => {
    celle.forEach(c => onSalva({
      ...(c.op.tipo === 'artigiano' ? { artigiano_id: c.op.id } : { utente_id: c.op.id }),
      data: c.data, turno: c.turno, tipo: 'cantiere', cantiere_id: null, lavorazione: null,
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
      {/* Tipo attività: cantiere o programmazione libera */}
      <div className="flex gap-1 mb-2 flex-wrap">
        {[['cantiere','Cantiere'], ...Object.entries(TIPI_LIBERI).map(([k,v]) => [k, v.label])].map(([k,l]) => (
          <button key={k} onClick={() => setTipoAtt(k)}
            className={`px-2 py-1 rounded-full text-[10px] font-semibold border transition-colors ${tipoAtt===k ? 'text-white' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}
            style={tipoAtt===k ? { background: k==='cantiere' ? '#FF6B00' : TIPI_LIBERI[k].colore, borderColor: 'transparent' } : undefined}>
            {l}
          </button>
        ))}
      </div>
      {tipoAtt === 'cantiere' && (
        <select autoFocus value={cantiereId} onChange={e => setCantiereId(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-2 py-2 text-xs mb-2 focus:outline-none focus:ring-2 focus:ring-steelex-orange">
          <option value="">— nessun cantiere —</option>
          {cantieri.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
      )}
      <input type="text" placeholder={tipoAtt === 'cantiere' ? 'Lavorazione...' : 'Descrizione (facoltativa)...'} value={lavorazione}
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
            className="px-3 py-2 border border-red-200 text-red-500 text-xs font-semibold rounded-lg hover:bg-red-50 transition-colors whitespace-nowrap">
            {isRange ? `Svuota (${rangeCelle.length})` : 'Rimuovi'}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Legenda ───────────────────────────────────────────────────────────────────
function Legenda({ cantieri, usatiIds, tipiUsati = new Set() }) {
  const usati = cantieri.filter(c => usatiIds.has(c.id))
  const liberi = Object.entries(TIPI_LIBERI).filter(([k]) => tipiUsati.has(k))
  if (!usati.length && !liberi.length) return null
  return (
    <div className="flex flex-wrap gap-2 mt-2 px-1">
      {usati.map(c => (
        <div key={c.id} className="flex items-center gap-1.5 text-xs text-gray-600">
          <div className="w-3 h-3 rounded-sm" style={{ background: getColore(c.id) }}/>{c.nome}
        </div>
      ))}
      {liberi.map(([k, t]) => (
        <div key={k} className="flex items-center gap-1.5 text-xs text-gray-600">
          <div className="w-3 h-3 rounded-sm" style={{ background: t.colore }}/>{t.label}
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
    dragRef.current = { op, startData: data, startTurno: turno, cantiereId: ass?.cantiere_id ?? null, lavorazione: ass?.lavorazione ?? null, tipoAss: ass?.tipo ?? 'cantiere' }
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

    setPopover({ op: d.op, data: d.startData, turno: d.startTurno, rangeCelle: celle, cantiereIdIniziale: d.cantiereId, lavorazioneIniziale: d.lavorazione, tipoIniziale: d.tipoAss })
  }

  return { dragRef, startDrag, moveDrag, endDrag }
}

// ── Griglia DESKTOP ───────────────────────────────────────────────────────────
function GrigliaDesktop({ operatori, giorni, assMap, cantieri, onSalva, canWrite, oggi, opImpegnati = new Set() }) {
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

  const CellaMP = ({ op, d, zebraRow }) => {
    const dataStr = d.format('YYYY-MM-DD')
    const isWeekend = d.day() === 0 || d.day() === 6
    const isOggi = d.isSame(oggi, 'day')
    // Separiamo ogni giorno con un border-right leggero, nessun border interno tra M e P
    return ['M','P'].map((turno, ti) => {
      const key = ck(op.tipo, op.id, dataStr, turno)
      const ass = assMap[key]
      const col = coloreAss(ass)
      const isSel = selKeys.has(key)
      const isOpen = popover?.op.id===op.id && popover?.op.tipo===op.tipo && popover?.data===dataStr && popover?.turno===turno
      const isEmpty = !ass && !isSel

      // Sfondo cella vuota: appena percettibile, diverso solo per weekend e zebra
      const emptyBg = isWeekend ? '#f5f6f8' : (zebraRow ? '#fafafa' : '#fff')

      return (
        <td key={key} data-cella="1" data-tipo={op.tipo} data-id={op.id} data-data={dataStr} data-turno={turno}
          className="relative p-0 select-none"
          style={{
            width: 22, minWidth: 22, height: 32,
            background: isEmpty ? emptyBg : (isSel ? (col || '#fdba74') : col),
            // Bordo solo a destra dell'ultimo turno del giorno (P), separatore tra giorni
            borderRight: ti === 1 ? (isOggi ? '2px solid #FF6B00' : '1px solid #e5e7eb') : '1px solid rgba(0,0,0,0.04)',
            borderBottom: '1px solid #f0f0f0',
            borderLeft: ti === 0 && isOggi ? '2px solid #FF6B00' : 'none',
            borderTop: isOggi ? '2px solid #FF6B00' : 'none',
          }}
          onPointerDown={canWrite ? e => { e.preventDefault(); startDrag(op, dataStr, turno) } : undefined}>
          {!isEmpty ? (
            <div className="w-full h-full flex items-center justify-center cursor-pointer"
              title={`${labelAss(ass)}${ass?.lavorazione?' — '+ass.lavorazione:''}`}>
              {siglaAss(ass) && (
                <span className="text-white font-black pointer-events-none leading-none"
                  style={{ fontSize: 8, textShadow: '0 1px 2px rgba(0,0,0,0.25)' }}>
                  {siglaAss(ass)}
                </span>
              )}
            </div>
          ) : canWrite ? (
            <div className="w-full h-full cursor-pointer hover:bg-orange-50/60 transition-colors"/>
          ) : null}
          {isOpen && <Popover op={op} data={dataStr} turno={turno} ass={ass} cantieri={cantieri} rangeCelle={popover.rangeCelle} cantiereIdIniziale={popover.cantiereIdIniziale} lavorazioneIniziale={popover.lavorazioneIniziale} tipoIniziale={popover.tipoIniziale} onSalva={onSalva} onChiudi={() => setPopover(null)}/>}
        </td>
      )
    })
  }

  const Riga = ({ op, zebra }) => {
    const impegnato = opImpegnati.has(`${op.tipo}_${op.id}`)
    return (
      <tr>
        <td className="sticky left-0 z-10 border-r border-gray-200 px-2 py-1"
          style={{ background: zebra ? '#fafafa' : '#fff', minWidth: 140, maxWidth: 140, borderBottom: '1px solid #f0f0f0' }}>
          <div className="flex items-center gap-1.5">
            {impegnato && <div className="w-1.5 h-1.5 rounded-full bg-steelex-orange flex-shrink-0"/>}
            <p className="text-xs font-semibold text-gray-800 truncate">{op.nome}</p>
          </div>
          <p className="text-[10px] text-gray-400 truncate capitalize">{op.azienda || op.categoria}</p>
        </td>
        {giorni.map(d => <CellaMP key={d.format('YYYY-MM-DD')} op={op} d={d} zebraRow={zebra}/>)}
      </tr>
    )
  }

  const Gruppo = ({ label }) => (
    <tr><td colSpan={1 + giorni.length * 2}
      className="px-3 py-1 text-[9px] font-bold uppercase tracking-widest text-gray-400 border-b border-gray-100"
      style={{ position: 'sticky', left: 0, background: '#f8fafc' }}>{label}</td></tr>
  )

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden" style={{ userSelect: 'none' }}>
      <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 220px)' }}>
        <table style={{ borderCollapse: 'collapse', minWidth: 140 + giorni.length * 44 }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 15 }}>
            <tr style={{ background: '#1e293b' }}>
              <th className="sticky left-0 z-20 px-2 py-2 text-left border-r border-gray-700"
                style={{ background: '#1e293b', minWidth: 140 }}>
                <span className="text-[10px] font-bold text-gray-300 uppercase tracking-widest">Operatore</span>
              </th>
              {giorni.map(d => {
                const isOggi = d.isSame(oggi,'day')
                const isWeekend = d.day()===0||d.day()===6
                return <th key={d.format('YYYY-MM-DD')} colSpan={2}
                  style={{ minWidth: 44, borderLeft: '1px solid rgba(255,255,255,0.08)', opacity: isWeekend ? 0.4 : 1 }}>
                  <div className={`text-xs font-bold py-1 ${isOggi?'text-steelex-orange':'text-white'}`}>{d.format('D')}</div>
                  <div className="text-[9px] uppercase text-gray-400 pb-1">{d.format('dd')}</div>
                </th>
              })}
            </tr>
            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e5e7eb' }}>
              <th className="sticky left-0 z-20 border-r border-gray-200" style={{ background: '#f8fafc', minWidth: 140 }}/>
              {giorni.map(d => ['M','P'].map((t, ti) => (
                <th key={`${d.format('YYYY-MM-DD')}_${t}`}
                  style={{
                    width: 22, fontSize: 9, fontWeight: 600, color: '#9ca3af',
                    padding: '3px 0', textAlign: 'center',
                    borderLeft: ti === 0 ? '1px solid #e5e7eb' : '1px solid rgba(0,0,0,0.04)',
                    background: (d.day()===0||d.day()===6) ? '#f5f6f8' : '#f8fafc',
                  }}>
                  {t}
                </th>
              )))}
            </tr>
          </thead>
          <tbody>
            {operatori.map((op, i) => {
              const prevTipo = i > 0 ? operatori[i-1].tipo : null
              const header = op.tipo !== prevTipo
                ? <Gruppo key={`hdr_${op.tipo}`} label={op.tipo === 'artigiano' ? 'Artigiani / Esterni' : 'Operativi Interni'}/>
                : null
              return <React.Fragment key={`${op.tipo}_${op.id}`}>{header}<Riga op={op} zebra={i%2!==0}/></React.Fragment>
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Griglia MOBILE ────────────────────────────────────────────────────────────
function GrigliaMobile({ operatori, giorni, assMap, cantieri, onSalva, canWrite, oggi, modalitaAssegna, opImpegnati = new Set() }) {
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

  // Larghezza cella: adatta allo schermo, minimo 40px per essere toccabile
  const NAME_W = 90
  const CELL_W = Math.max(40, Math.floor((window.innerWidth - NAME_W - 2) / Math.min(giorni.length, 10)))
  const CELL_H = 48

  // Una riga per operatore, una td per giorno divisa in sinistra=M / destra=P
  const RigaOp = ({ op, zebra }) => (
    <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
      <td className="sticky left-0 z-10 border-r-2 border-gray-200 px-2"
        style={{ background: zebra ? '#f9fafb' : '#fff', width: NAME_W, minWidth: NAME_W, maxWidth: NAME_W, height: CELL_H, verticalAlign: 'middle' }}>
        <div className="flex items-center gap-1">
          {opImpegnati.has(`${op.tipo}_${op.id}`) && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#FF6B00', flexShrink: 0 }}/>}
          <p className="font-semibold text-gray-800 leading-tight truncate" style={{ fontSize: 11 }}>
            {op.nome.split(' ').slice(0,2).join(' ')}
          </p>
        </div>
        <p className="text-gray-400 truncate capitalize" style={{ fontSize: 9 }}>{op.azienda || op.categoria}</p>
      </td>
      {giorni.map(d => {
        const dataStr = d.format('YYYY-MM-DD')
        const isWeekend = d.day() === 0 || d.day() === 6
        const isOggi = d.isSame(oggi, 'day')
        const assM = assMap[ck(op.tipo, op.id, dataStr, 'M')]
        const assP = assMap[ck(op.tipo, op.id, dataStr, 'P')]
        const colM = coloreAss(assM)
        const colP = coloreAss(assP)
        const selM = selKeys.has(ck(op.tipo, op.id, dataStr, 'M'))
        const selP = selKeys.has(ck(op.tipo, op.id, dataStr, 'P'))
        const openM = popover?.op.id===op.id && popover?.op.tipo===op.tipo && popover?.data===dataStr && popover?.turno==='M'
        const openP = popover?.op.id===op.id && popover?.op.tipo===op.tipo && popover?.data===dataStr && popover?.turno==='P'

        return (
          <td key={dataStr}
            className="relative p-0"
            style={{
              width: CELL_W, minWidth: CELL_W, height: CELL_H,
              background: isWeekend ? '#f8fafc' : '#fff',
              border: '1px solid #f3f4f6',
              outline: isOggi ? '2px solid #FF6B00' : undefined,
              outlineOffset: isOggi ? '-2px' : undefined,
            }}>
            <div style={{ display: 'flex', height: '100%' }}>
              {/* Metà sinistra — Mattina */}
              <div
                data-cella="1" data-tipo={op.tipo} data-id={op.id} data-data={dataStr} data-turno="M"
                style={{
                  flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  background: selM ? (colM || '#fdba74') : (colM || 'transparent'),
                  borderRight: '1px solid rgba(0,0,0,0.06)',
                  position: 'relative',
                }}
                onTouchStart={canWrite && modalitaAssegna ? e => { e.stopPropagation(); e.preventDefault(); startDrag(op, dataStr, 'M') } : undefined}
                onClick={canWrite && !modalitaAssegna ? e => { e.stopPropagation(); setPopover({ op, data: dataStr, turno: 'M' }) } : undefined}>
                {siglaAss(assM)
                  ? <span className="font-black text-white leading-none pointer-events-none" style={{ fontSize: 9, textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>{siglaAss(assM)}</span>
                  : <span style={{ fontSize: 8, color: '#d1d5db', fontWeight: 600 }}>M</span>}
                {openM && <Popover op={op} data={dataStr} turno="M" ass={assM} cantieri={cantieri} rangeCelle={popover.rangeCelle} cantiereIdIniziale={popover.cantiereIdIniziale} lavorazioneIniziale={popover.lavorazioneIniziale} tipoIniziale={popover.tipoIniziale} onSalva={onSalva} onChiudi={() => setPopover(null)}/>}
              </div>
              {/* Metà destra — Pomeriggio */}
              <div
                data-cella="1" data-tipo={op.tipo} data-id={op.id} data-data={dataStr} data-turno="P"
                style={{
                  flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  background: selP ? (colP || '#fdba74') : (colP || 'transparent'),
                  position: 'relative',
                }}
                onTouchStart={canWrite && modalitaAssegna ? e => { e.stopPropagation(); e.preventDefault(); startDrag(op, dataStr, 'P') } : undefined}
                onClick={canWrite && !modalitaAssegna ? e => { e.stopPropagation(); setPopover({ op, data: dataStr, turno: 'P' }) } : undefined}>
                {siglaAss(assP)
                  ? <span className="font-black text-white leading-none pointer-events-none" style={{ fontSize: 9, textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>{siglaAss(assP)}</span>
                  : <span style={{ fontSize: 8, color: '#d1d5db', fontWeight: 600 }}>P</span>}
                {openP && <Popover op={op} data={dataStr} turno="P" ass={assP} cantieri={cantieri} rangeCelle={popover.rangeCelle} cantiereIdIniziale={popover.cantiereIdIniziale} lavorazioneIniziale={popover.lavorazioneIniziale} tipoIniziale={popover.tipoIniziale} onSalva={onSalva} onChiudi={() => setPopover(null)}/>}
              </div>
            </div>
          </td>
        )
      })}
    </tr>
  )

  const Gruppo = ({ label, colSpan }) => (
    <tr><td colSpan={colSpan}
      className="px-2 py-1 text-[9px] font-bold uppercase tracking-widest text-gray-400 bg-gray-100 border-b border-gray-200"
      style={{ position: 'sticky', left: 0 }}>{label}</td></tr>
  )

  const totalCols = 1 + giorni.length

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 220px)', WebkitOverflowScrolling: 'touch' }}>
        <table className="border-collapse" style={{ tableLayout: 'fixed', width: NAME_W + giorni.length * CELL_W }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 15 }}>
            <tr style={{ background: '#1e293b' }}>
              <th className="sticky left-0 z-20 px-2 py-2 text-left border-r-2 border-gray-600"
                style={{ background: '#1e293b', width: NAME_W, minWidth: NAME_W }}>
                <span style={{ fontSize: 9 }} className="font-bold text-gray-300 uppercase tracking-widest">Nome</span>
              </th>
              {giorni.map(d => {
                const isOggi = d.isSame(oggi,'day')
                const isWeekend = d.day()===0||d.day()===6
                return <th key={d.format('YYYY-MM-DD')}
                  className={`text-center border-l border-gray-700 py-1 ${isWeekend?'opacity-50':''}`}
                  style={{ width: CELL_W, minWidth: CELL_W }}>
                  <div className={`font-bold ${isOggi?'text-steelex-orange':'text-white'}`} style={{ fontSize: 12 }}>{d.format('D')}</div>
                  <div className="uppercase text-gray-400" style={{ fontSize: 8 }}>{d.format('dd')}</div>
                </th>
              })}
            </tr>
            {/* Sottotestata M | P */}
            <tr style={{ background: '#f8fafc' }}>
              <th className="sticky left-0 z-20 border-r-2 border-gray-200 border-b border-gray-200"
                style={{ background: '#f8fafc', width: NAME_W }}/>
              {giorni.map(d => (
                <th key={d.format('YYYY-MM-DD')} className="border-l border-gray-200 border-b border-gray-200 p-0"
                  style={{ width: CELL_W }}>
                  <div style={{ display: 'flex', fontSize: 8, color: '#94a3b8', fontWeight: 700 }}>
                    <span style={{ flex: 1, textAlign: 'center', borderRight: '1px solid #f1f5f9', padding: '2px 0' }}>M</span>
                    <span style={{ flex: 1, textAlign: 'center', padding: '2px 0' }}>P</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {operatori.map((op, i) => {
              const prevTipo = i > 0 ? operatori[i-1].tipo : null
              const header = op.tipo !== prevTipo
                ? <Gruppo key={`hdr_${op.tipo}`} label={op.tipo === 'artigiano' ? 'Artigiani / Esterni' : 'Operativi Interni'} colSpan={totalCols}/>
                : null
              return <React.Fragment key={`${op.tipo}_${op.id}`}>{header}<RigaOp op={op} zebra={i%2!==0}/></React.Fragment>
            })}
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
  const [filtroCategoria, setFiltroCategoria] = useState(null) // null = tutti

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
  const tipiUsati = useMemo(() => new Set(assegnazioni.filter(a => a.tipo && a.tipo !== 'cantiere').map(a => a.tipo)), [assegnazioni])

  // Categorie disponibili (da artigiani)
  const categorie = useMemo(() => {
    const cats = new Set(operatori.filter(o => o.categoria).map(o => o.categoria))
    return [...cats].sort()
  }, [operatori])

  // Chi ha almeno un'assegnazione nel periodo → in cima
  const opImpegnati = useMemo(() => {
    const keys = new Set(assegnazioni.map(a =>
      a.artigiano_id ? `artigiano_${a.artigiano_id}` : `utente_${a.utente_id}`
    ))
    return keys
  }, [assegnazioni])

  // Filtra per categoria poi ordina: impegnati in cima
  const operatoriFiltrati = useMemo(() => {
    let lista = filtroCategoria
      ? operatori.filter(o => o.categoria === filtroCategoria || (o.tipo === 'utente' && filtroCategoria === '__interni__'))
      : operatori
    return [...lista].sort((a, b) => {
      const aImp = opImpegnati.has(`${a.tipo}_${a.id}`)
      const bImp = opImpegnati.has(`${b.tipo}_${b.id}`)
      if (aImp && !bImp) return -1
      if (!aImp && bImp) return 1
      return 0
    })
  }, [operatori, filtroCategoria, opImpegnati])

  const upsertMutation = useMutation(
    body => api.put('/assegnazioni', body),
    { onSuccess: () => qc.invalidateQueries(queryKey), onError: e => toast.error(e.response?.data?.detail || 'Errore') }
  )
  const salva = body => upsertMutation.mutate(body)

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
            <p className="text-xs text-gray-400">
              {operatoriFiltrati.filter(o=>o.tipo==='artigiano').length} artigiani ·{' '}
              {operatoriFiltrati.filter(o=>o.tipo==='utente').length} interni ·{' '}
              <span className="text-steelex-orange font-semibold">{opImpegnati.size} impegnati</span>
            </p>
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

      {/* Filtri categoria */}
      {categorie.length > 0 && (
        <div className="flex gap-1.5 flex-wrap items-center">
          <button
            onClick={() => setFiltroCategoria(null)}
            className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${!filtroCategoria ? 'bg-steelex-orange text-white border-steelex-orange' : 'bg-white text-gray-500 border-gray-200 hover:border-steelex-orange hover:text-steelex-orange'}`}>
            Tutti
          </button>
          {categorie.map(cat => (
            <button key={cat}
              onClick={() => setFiltroCategoria(f => f === cat ? null : cat)}
              className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors capitalize ${filtroCategoria === cat ? 'bg-steelex-orange text-white border-steelex-orange' : 'bg-white text-gray-500 border-gray-200 hover:border-steelex-orange hover:text-steelex-orange'}`}>
              {cat}
            </button>
          ))}
          <button
            onClick={() => setFiltroCategoria('__interni__')}
            className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${filtroCategoria === '__interni__' ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-gray-500 border-gray-200 hover:border-slate-500 hover:text-slate-600'}`}>
            Solo interni
          </button>
        </div>
      )}

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
          💡 <strong>Click</strong> per assegnare · <strong>Trascina</strong> per selezionare un range (anche celle già occupate) · da cella colorata <strong>replica</strong> il cantiere
        </p>
      )}

      {operatoriFiltrati.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">
          <Users size={36} className="mx-auto mb-2 opacity-30"/>
          <p className="font-medium">Nessun operatore trovato</p>
        </div>
      ) : (
        <>
          {usaMobile
            ? <GrigliaMobile operatori={operatoriFiltrati} giorni={giorni} assMap={assMap} cantieri={cantieri}
                onSalva={salva} canWrite={canWrite} oggi={oggi} modalitaAssegna={modalitaAssegna}
                opImpegnati={opImpegnati}/>
            : <GrigliaDesktop operatori={operatoriFiltrati} giorni={giorni} assMap={assMap} cantieri={cantieri}
                onSalva={salva} canWrite={canWrite} oggi={oggi} opImpegnati={opImpegnati}/>
          }
          <Legenda cantieri={cantieri} usatiIds={usatiIds} tipiUsati={tipiUsati}/>
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
