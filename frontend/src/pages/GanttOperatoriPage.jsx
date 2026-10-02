/**
 * Gantt mensile/settimanale operatori
 *
 * Una sola griglia per desktop e smartphone: una riga per operatore, due slot
 * (Mattina / Pomeriggio) per giorno. I turni uguali consecutivi sono disegnati
 * come un'unica barra col nome del cantiere.
 *
 * Selezione a rettangolo: trascinando si seleziona un blocco di turni anche su
 * più operatori. La selezione resta evidenziata (tratteggio + bordo) finché il
 * pannello di assegnazione è aperto, anche sopra celle già colorate.
 *   - mouse: click o trascina
 *   - touch: tap apre il pannello; con "Modalità assegna" il trascinamento seleziona
 * Il pannello è montato in un portal sul body e posizionato dentro la finestra
 * (su smartphone è un foglio dal basso), quindi non esce mai dalla pagina.
 */
import React, { useState, useMemo, useRef, useEffect, useLayoutEffect, useCallback, memo } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { ChevronLeft, ChevronRight, X, Users, CalendarDays, Calendar, PenLine, Send, FileDown, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../lib/api'
import { useAuth } from '../lib/auth'
import dayjs from 'dayjs'
import isoWeek from 'dayjs/plugin/isoWeek'
import 'dayjs/locale/it'
dayjs.extend(isoWeek)
dayjs.locale('it')

// ── Brand (unica parte che cambia tra STEELEX e FR) ───────────────────────────
const ACCENTO = '#FF6B00'
const SCURO = '#1A1A2E'
const ACCENTO_TENUE = 'rgba(255,107,0,0.07)'

// Stessa palette del PDF (backend/app/routers/assegnazioni.py → PALETTE_CANTIERI)
const PALETTE = [
  ACCENTO,'#3b82f6','#22c55e','#a855f7','#f59e0b',
  '#06b6d4','#ec4899','#64748b','#84cc16','#f97316',
  '#6366f1','#14b8a6','#e11d48','#0ea5e9','#8b5cf6',
]
const getColore = id => id ? PALETTE[(id - 1) % PALETTE.length] : '#94a3b8'

// Programmazione libera: attività fuori cantiere con colori fissi
const TIPI_LIBERI = {
  ferie:    { label: 'Ferie',    sigla: 'FER', colore: '#eab308' },
  corso:    { label: 'Corso',    sigla: 'COR', colore: '#7c3aed' },
  permesso: { label: 'Permesso', sigla: 'PRM', colore: '#db2777' },
  altro:    { label: 'Altro',    sigla: 'ALT', colore: '#475569' },
}
const isLibera = ass => ass?.tipo && ass.tipo !== 'cantiere'
const coloreAss = ass => !ass ? null : (isLibera(ass) ? (TIPI_LIBERI[ass.tipo]?.colore || '#475569') : getColore(ass.cantiere_id))
const labelAss = ass => !ass ? '' : isLibera(ass) ? (TIPI_LIBERI[ass.tipo]?.label || 'Altro') : (ass.cantiere_nome || 'Senza cantiere')
const siglaAss = (ass, sigle) => !ass ? '' : isLibera(ass)
  ? (TIPI_LIBERI[ass.tipo]?.sigla || 'ALT')
  : (ass.cantiere_id ? (sigle[ass.cantiere_id] || '?') : '—')
// Due turni fanno parte della stessa barra se l'attività è identica
const stessoBlocco = (a, b) => !!a && !!b && (a.tipo || 'cantiere') === (b.tipo || 'cantiere')
  && (a.cantiere_id || null) === (b.cantiere_id || null) && (a.lavorazione || '') === (b.lavorazione || '')

// Testo scuro su colori chiari (giallo, lime...) — stessa soglia del PDF
function testoScuro(hex) {
  const h = (hex || '#000000').replace('#', '')
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16)
  return 0.299 * r + 0.587 * g + 0.114 * b > 165
}

// Sigle univoche per cantiere: prime 3 lettere, doppioni risolti come nel PDF
function siglePerCantieri(lista) {
  const out = {}, usate = new Set()
  ;[...lista].sort((a, b) => a.id - b.id).forEach(c => {
    const parole = (c.nome || '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(/\s+/).filter(Boolean)
    const base = (parole[0]?.slice(0, 3) || 'CAN').toUpperCase()
    let sigla = base
    if (usate.has(sigla) && parole.length > 1) sigla = (parole[0].slice(0, 2) + parole[1].slice(0, 1)).toUpperCase()
    let n = 2
    while (usate.has(sigla)) { sigla = `${base.slice(0, 2)}${n}`; n++ }
    usate.add(sigla); out[c.id] = sigla
  })
  return out
}

function ck(tipo, id, data, turno) { return `${tipo}__${id}__${data}__${turno}` }
const opKey = op => `${op.tipo}_${op.id}`
const normSel = s => s && ({ r0: Math.min(s.ar, s.cr), r1: Math.max(s.ar, s.cr), s0: Math.min(s.as, s.cs), s1: Math.max(s.as, s.cs) })

const isTouch = () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches

// ── Pannello assegnazione (portal, sempre dentro la finestra) ─────────────────
function PannelloAssegna({ celle, iniziale, anchor, cantieri, sigle, salvando, onSalva, onChiudi, mobile }) {
  const [tipoAtt, setTipoAtt] = useState(iniziale?.tipo || 'cantiere')
  const [cantiereId, setCantiereId] = useState(iniziale?.cantiere_id ?? '')
  const [lavorazione, setLavorazione] = useState(iniziale?.lavorazione ?? '')
  const ref = useRef(null)
  const [pos, setPos] = useState({ top: -9999, left: -9999 })

  // Posizionamento: sotto la cella, sopra se non c'è spazio, sempre dentro la viewport
  const posiziona = useCallback(() => {
    if (mobile || !ref.current) return
    const el = document.querySelector(`[data-r="${anchor.r}"][data-s="${anchor.s}"]`)
    const W = window.innerWidth, H = window.innerHeight, M = 8
    const pw = ref.current.offsetWidth, ph = ref.current.offsetHeight
    const rc = el ? el.getBoundingClientRect() : { top: H / 2, bottom: H / 2, left: W / 2 - pw / 2, right: W / 2 }
    let top = rc.bottom + 6
    if (top + ph > H - M) top = rc.top - ph - 6 >= M ? rc.top - ph - 6 : Math.max(M, H - ph - M)
    let left = Math.min(Math.max(M, rc.left - 8), W - pw - M)
    setPos({ top, left })
  }, [anchor, mobile])

  useLayoutEffect(() => { posiziona() }, [posiziona])
  useEffect(() => {
    if (mobile) return
    window.addEventListener('scroll', posiziona, true)
    window.addEventListener('resize', posiziona)
    return () => { window.removeEventListener('scroll', posiziona, true); window.removeEventListener('resize', posiziona) }
  }, [posiziona, mobile])

  // Chiusura: click fuori (ma non su una cella: lì parte una nuova selezione) ed Esc
  useEffect(() => {
    const h = e => {
      if (ref.current?.contains(e.target)) return
      if (e.target.closest?.('[data-s]')) return
      onChiudi()
    }
    const k = e => { if (e.key === 'Escape') onChiudi() }
    const t = setTimeout(() => document.addEventListener('pointerdown', h), 0)
    document.addEventListener('keydown', k)
    return () => { clearTimeout(t); document.removeEventListener('pointerdown', h); document.removeEventListener('keydown', k) }
  }, [onChiudi])

  // Riepilogo di cosa c'è adesso nella selezione
  const riepilogo = useMemo(() => {
    const m = new Map()
    celle.forEach(c => {
      const k = c.ass ? `${c.ass.tipo || 'cantiere'}_${c.ass.cantiere_id || ''}` : 'vuota'
      const v = m.get(k) || { n: 0, label: c.ass ? labelAss(c.ass) : 'libere', colore: coloreAss(c.ass) }
      v.n++; m.set(k, v)
    })
    return [...m.values()].sort((a, b) => b.n - a.n)
  }, [celle])

  const ops = new Set(celle.map(c => opKey(c.op)))
  const giorniSel = [...new Set(celle.map(c => c.data))].sort()
  const singola = celle.length === 1
  const titolo = singola
    ? celle[0].op.nome
    : ops.size === 1 ? celle[0].op.nome : `${ops.size} operatori`
  const sottotitolo = singola
    ? `${dayjs(celle[0].data).format('ddd D MMM')} · ${celle[0].turno === 'M' ? 'Mattina' : 'Pomeriggio'}`
    : `${celle.length} turni · ${giorniSel.length === 1 ? dayjs(giorniSel[0]).format('ddd D MMM')
        : `${dayjs(giorniSel[0]).format('D MMM')} → ${dayjs(giorniSel[giorniSel.length - 1]).format('D MMM')}`}`
  const almenoUnaPiena = celle.some(c => c.ass)
  const puoSalvare = tipoAtt !== 'cantiere' || !!cantiereId || !!lavorazione.trim()

  // Un cantiere già assegnato ma non più "attivo" resta selezionabile (altrimenti la select appare vuota)
  const opzioniCantieri = useMemo(() => {
    const lista = [...cantieri]
    celle.forEach(c => {
      if (c.ass?.cantiere_id && !lista.some(x => x.id === c.ass.cantiere_id))
        lista.push({ id: c.ass.cantiere_id, nome: c.ass.cantiere_nome || `Cantiere ${c.ass.cantiere_id}` })
    })
    return lista
  }, [cantieri, celle])

  const salva = () => {
    if (!puoSalvare || salvando) return
    onSalva({
      tipo: tipoAtt,
      cantiere_id: tipoAtt === 'cantiere' && cantiereId ? parseInt(cantiereId) : null,
      lavorazione: lavorazione.trim() || null,
    })
  }
  const svuota = () => !salvando && onSalva({ tipo: 'cantiere', cantiere_id: null, lavorazione: null })

  const corpo = (
    <div ref={ref} onPointerDown={e => e.stopPropagation()}
      className={mobile
        ? 'fixed inset-x-0 bottom-0 z-[60] bg-white rounded-t-2xl shadow-2xl p-4 pb-6 max-h-[85vh] overflow-y-auto'
        : 'fixed z-[60] bg-white border border-gray-200 rounded-xl shadow-2xl p-3 w-[300px] max-h-[calc(100vh-16px)] overflow-y-auto'}
      style={mobile ? undefined : { top: pos.top, left: pos.left }}>
      {mobile && <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-3"/>}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-gray-900 truncate">{titolo}</p>
          <p className="text-xs text-gray-500 capitalize">{sottotitolo}</p>
        </div>
        <button onClick={onChiudi} className="p-1 -m-1 text-gray-400 hover:text-gray-600" aria-label="Chiudi"><X size={16}/></button>
      </div>

      {/* Cosa contiene adesso la selezione */}
      <div className="flex flex-wrap gap-1 mb-3">
        {riepilogo.map(v => (
          <span key={v.label} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-gray-50 border border-gray-100 text-[11px] text-gray-600">
            <span className="w-2.5 h-2.5 rounded-sm border border-gray-200" style={{ background: v.colore || '#fff' }}/>
            {!singola && <strong className="font-semibold">{v.n}×</strong>} {v.label}
          </span>
        ))}
      </div>

      {/* Tipo attività: cantiere o programmazione libera */}
      <div className="flex gap-1 mb-2 flex-wrap">
        {[['cantiere', 'Cantiere'], ...Object.entries(TIPI_LIBERI).map(([k, v]) => [k, v.label])].map(([k, l]) => (
          <button key={k} onClick={() => setTipoAtt(k)}
            className={`px-2.5 py-1.5 rounded-full text-xs font-semibold border transition-colors ${tipoAtt === k ? 'text-white' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}
            style={tipoAtt === k ? { background: k === 'cantiere' ? ACCENTO : TIPI_LIBERI[k].colore, borderColor: 'transparent' } : undefined}>
            {l}
          </button>
        ))}
      </div>
      {tipoAtt === 'cantiere' && (
        <select autoFocus={!mobile} value={cantiereId} onChange={e => setCantiereId(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-steelex-orange">
          <option value="">— scegli il cantiere —</option>
          {opzioniCantieri.map(c => <option key={c.id} value={c.id}>{sigle[c.id] ? `${sigle[c.id]} · ` : ''}{c.nome}</option>)}
        </select>
      )}
      <input type="text" placeholder={tipoAtt === 'cantiere' ? 'Lavorazione (facoltativa)…' : 'Descrizione (facoltativa)…'} value={lavorazione}
        onChange={e => setLavorazione(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && salva()}
        className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-steelex-orange" />
      <div className="flex gap-1.5">
        <button onClick={salva} disabled={!puoSalvare || salvando}
          className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 bg-steelex-orange text-white text-sm font-bold rounded-lg hover:opacity-90 disabled:opacity-40 transition-opacity">
          {salvando && <Loader2 size={14} className="animate-spin"/>}
          Assegna{singola ? '' : ` ${celle.length} turni`}
        </button>
        {almenoUnaPiena && (
          <button onClick={svuota} disabled={salvando}
            className="px-3 py-2.5 border border-red-200 text-red-500 text-sm font-semibold rounded-lg hover:bg-red-50 disabled:opacity-40 transition-colors whitespace-nowrap">
            {singola ? 'Rimuovi' : 'Svuota'}
          </button>
        )}
      </div>
      {!puoSalvare && <p className="text-[11px] text-gray-400 mt-1.5">Scegli un cantiere o scrivi la lavorazione.</p>}
    </div>
  )

  return createPortal(
    mobile ? <><div className="fixed inset-0 z-[59] bg-black/30" onClick={onChiudi}/>{corpo}</> : corpo,
    document.body,
  )
}

// ── Riga operatore (memo: durante il trascinamento si ridisegnano solo le righe toccate) ──
const RigaOperatore = memo(function RigaOperatore({ op, r, celle, slots, slotW, nameW, rowH, selCols, selRow, sigle, impegnato, giorniPianificati, zebra, canWrite, interazione }) {
  // Barre: sequenze di turni consecutivi con la stessa attività
  const runs = useMemo(() => {
    const out = new Array(celle.length).fill(null)
    let i = 0
    while (i < celle.length) {
      if (!celle[i]) { i++; continue }
      let j = i
      while (j + 1 < celle.length && stessoBlocco(celle[j + 1], celle[i])) j++
      out[i] = { fine: j }
      i = j + 1
    }
    return out
  }, [celle])

  return (
    <tr className="group">
      <td className={`sticky left-0 z-20 px-2 border-r border-gray-200 ${zebra ? 'bg-gray-50' : 'bg-white'} group-hover:bg-orange-50`}
        style={{ width: nameW, minWidth: nameW, maxWidth: nameW, height: rowH, borderBottom: '1px solid #f1f2f4' }}>
        <div className="flex items-center gap-1.5 min-w-0">
          {impegnato && <span className="w-1.5 h-1.5 rounded-full bg-steelex-orange flex-shrink-0"/>}
          <p className="text-xs font-semibold text-gray-800 truncate flex-1" title={op.nome}>{op.nome}</p>
          {giorniPianificati > 0 && nameW > 120 && (
            <span className="text-[10px] font-semibold text-gray-400 flex-shrink-0" title="Giornate pianificate nel periodo">
              {String(giorniPianificati).replace('.', ',')}g
            </span>
          )}
        </div>
        <p className="text-[10px] text-gray-400 truncate capitalize">{op.azienda || op.categoria}</p>
      </td>
      {slots.map((sl, s) => {
        const ass = celle[s]
        const prima = s > 0 && stessoBlocco(celle[s - 1], ass)
        const dopo = s < celle.length - 1 && stessoBlocco(celle[s + 1], ass)
        const sel = selRow && s >= selCols[0] && s <= selCols[1]
        const col = coloreAss(ass)
        const run = runs[s]
        const inizioGiorno = sl.turno === 'M'
        const sfondo = sl.oggi ? ACCENTO_TENUE : sl.weekend ? '#f6f6f4' : 'transparent'
        const larghezzaRun = run ? (run.fine - s + 1) * slotW - 4 : 0
        const lungo = ass && larghezzaRun >= 76
        const testo = !run ? '' : lungo
          ? `${labelAss(ass)}${ass.lavorazione && larghezzaRun >= 150 ? ` · ${ass.lavorazione}` : ''}`
          : siglaAss(ass, sigle)
        return (
          <td key={s} data-r={r} data-s={s}
            className="relative p-0 select-none"
            style={{
              width: slotW, minWidth: slotW, maxWidth: slotW, height: rowH,
              background: sfondo,
              borderLeft: inizioGiorno ? (sl.lunedi ? '1.5px solid #d4d4d8' : '1px solid #eceef1') : 'none',
              borderBottom: '1px solid #f1f2f4',
              cursor: canWrite ? 'pointer' : 'default',
              touchAction: interazione.touchAction,
            }}
            onPointerDown={canWrite ? e => interazione.onPointerDown(e, r, s) : undefined}
            onClick={canWrite ? e => interazione.onClick(e, r, s) : undefined}
            title={ass ? `${labelAss(ass)}${ass.lavorazione ? ' — ' + ass.lavorazione : ''}\n${sl.d.format('ddd D MMM')} · ${sl.turno === 'M' ? 'Mattina' : 'Pomeriggio'}` : undefined}>
            {ass && (
              <div className="absolute pointer-events-none"
                style={{
                  top: 4, bottom: 4, left: prima ? -2 : 2, right: dopo ? 0 : 2,  // -2: copre il separatore del giorno
                  background: col,
                  borderTopLeftRadius: prima ? 0 : 5, borderBottomLeftRadius: prima ? 0 : 5,
                  borderTopRightRadius: dopo ? 0 : 5, borderBottomRightRadius: dopo ? 0 : 5,
                }}/>
            )}
            {run && testo && larghezzaRun >= 14 && (
              <span className="absolute pointer-events-none font-bold truncate leading-none"
                style={{
                  zIndex: 2, top: '50%', transform: 'translateY(-50%)', left: 6, width: larghezzaRun - 8,
                  fontSize: lungo ? 11 : 9, letterSpacing: lungo ? 0 : 0.2,
                  color: testoScuro(col) ? '#1B1B24' : '#fff',
                }}>
                {testo}
              </span>
            )}
            {sel && (
              <div className="absolute inset-0 pointer-events-none"
                style={{
                  zIndex: 3,
                  background: ass
                    ? 'repeating-linear-gradient(135deg, rgba(255,255,255,0.65) 0 3px, rgba(255,255,255,0) 3px 7px)'
                    : 'repeating-linear-gradient(135deg, rgba(255,107,0,0.35) 0 3px, rgba(255,107,0,0.12) 3px 7px)',
                  boxShadow: [
                    r === selRow.r0 && `inset 0 2px 0 ${SCURO}`,
                    r === selRow.r1 && `inset 0 -2px 0 ${SCURO}`,
                    s === selCols[0] && `inset 2px 0 0 ${SCURO}`,
                    s === selCols[1] && `inset -2px 0 0 ${SCURO}`,
                  ].filter(Boolean).join(',') || undefined,
                }}/>
            )}
          </td>
        )
      })}
    </tr>
  )
})

// ── Legenda ───────────────────────────────────────────────────────────────────
function Legenda({ assegnazioni, sigle }) {
  const voci = useMemo(() => {
    const m = new Map()
    assegnazioni.forEach(a => {
      const k = isLibera(a) ? a.tipo : `c${a.cantiere_id || 0}`
      const v = m.get(k) || { colore: coloreAss(a), sigla: siglaAss(a, sigle), label: labelAss(a), n: 0 }
      v.n++; m.set(k, v)
    })
    return [...m.values()].sort((a, b) => b.n - a.n)
  }, [assegnazioni, sigle])
  if (!voci.length) return null
  return (
    <div className="flex flex-wrap gap-1.5 px-1">
      {voci.map(v => (
        <span key={v.label + v.sigla} className="inline-flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-lg bg-white border border-gray-100 shadow-sm text-xs text-gray-700">
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold"
            style={{ background: v.colore, color: testoScuro(v.colore) ? '#1B1B24' : '#fff' }}>{v.sigla}</span>
          {v.label}
          <span className="text-gray-400">{String(v.n / 2).replace('.', ',')} gg</span>
        </span>
      ))}
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
  const touch = useMemo(isTouch, [])
  const [vista, setVista] = useState(isMobile ? 'settimana' : 'mese')
  const [modalitaAssegna, setModalitaAssegna] = useState(false)
  const [filtroCategoria, setFiltroCategoria] = useState(null) // null = tutti
  const [menuPdf, setMenuPdf] = useState(false)
  const [esportando, setEsportando] = useState(false)

  const [anno, setAnno] = useState(oggi.year())
  const [mese, setMese] = useState(oggi.month() + 1)
  const [settAnno, setSettAnno] = useState(oggi.year())
  const [sett, setSett] = useState(oggi.isoWeek())

  const prevMese = () => { const d = dayjs(`${anno}-${mese}-01`).subtract(1, 'month'); setAnno(d.year()); setMese(d.month() + 1) }
  const nextMese = () => { const d = dayjs(`${anno}-${mese}-01`).add(1, 'month'); setAnno(d.year()); setMese(d.month() + 1) }
  const prevSett = () => { const d = dayjs().year(settAnno).isoWeek(sett).subtract(1, 'week'); setSettAnno(d.year()); setSett(d.isoWeek()) }
  const nextSett = () => { const d = dayjs().year(settAnno).isoWeek(sett).add(1, 'week'); setSettAnno(d.year()); setSett(d.isoWeek()) }
  const vaiOggi = () => { setAnno(oggi.year()); setMese(oggi.month() + 1); setSettAnno(oggi.isoWeekYear?.() ?? oggi.year()); setSett(oggi.isoWeek()) }

  const giorni = useMemo(() => {
    if (vista === 'mese') {
      const primo = dayjs(`${anno}-${String(mese).padStart(2, '0')}-01`)
      return Array.from({ length: primo.daysInMonth() }, (_, i) => primo.add(i, 'day'))
    }
    const lun = dayjs().year(settAnno).isoWeek(sett).isoWeekday(1)
    return Array.from({ length: 6 }, (_, i) => lun.add(i, 'day'))
  }, [vista, anno, mese, settAnno, sett])

  const slots = useMemo(() => giorni.flatMap(d => ['M', 'P'].map(turno => ({
    d, turno, data: d.format('YYYY-MM-DD'),
    weekend: d.day() === 0 || d.day() === 6, lunedi: d.day() === 1, oggi: d.isSame(oggi, 'day'),
  }))), [giorni]) // eslint-disable-line

  const periodo = useMemo(() => ({
    data_inizio: giorni[0]?.format('YYYY-MM-DD'),
    data_fine: giorni[giorni.length - 1]?.format('YYYY-MM-DD'),
  }), [giorni])
  const queryKey = useMemo(() => ['assegnazioni', periodo.data_inizio, periodo.data_fine], [periodo])

  const { data: operatori = [], isLoading } = useQuery('operatori-gantt', () => api.get('/assegnazioni/operatori').then(r => r.data), { staleTime: 60000 })
  const { data: cantieri = [] } = useQuery('cantieri-attivi-gantt', () => api.get('/cantieri').then(r => r.data.filter(c => ['attivo', 'in_corso', 'preventivo'].includes(c.stato))), { staleTime: 60000 })
  const assQuery = useQuery(queryKey, () => api.get('/assegnazioni', { params: periodo }).then(r => r.data), { staleTime: 0, enabled: giorni.length > 0 })
  const assegnazioni = assQuery.data || []

  const assMap = useMemo(() => {
    const map = {}
    assegnazioni.forEach(a => {
      if (a.artigiano_id) map[ck('artigiano', a.artigiano_id, a.data, a.turno)] = a
      if (a.utente_id) map[ck('utente', a.utente_id, a.data, a.turno)] = a
    })
    return map
  }, [assegnazioni])

  // Sigle calcolate su tutti i cantieri visti (attivi + quelli presenti nel periodo)
  const sigle = useMemo(() => {
    const m = new Map(cantieri.map(c => [c.id, c]))
    assegnazioni.forEach(a => { if (a.cantiere_id && !m.has(a.cantiere_id)) m.set(a.cantiere_id, { id: a.cantiere_id, nome: a.cantiere_nome }) })
    return siglePerCantieri([...m.values()])
  }, [cantieri, assegnazioni])

  const categorie = useMemo(() => [...new Set(operatori.filter(o => o.categoria).map(o => o.categoria))].sort(), [operatori])

  const opImpegnati = useMemo(() => new Set(assegnazioni.map(a =>
    a.artigiano_id ? `artigiano_${a.artigiano_id}` : `utente_${a.utente_id}`)), [assegnazioni])

  // Ordine righe: chi è impegnato nel periodo va in cima, ma l'ordine si fissa al
  // caricamento del periodo — assegnando una cella la riga NON salta più in alto
  const chiaveOrdine = `${periodo.data_inizio}|${filtroCategoria}`
  const [ordine, setOrdine] = useState({ chiave: null, pos: {} })
  useEffect(() => {
    if (ordine.chiave === chiaveOrdine || !operatori.length || !assQuery.isSuccess || assQuery.isFetching) return
    const pos = {}
    operatori.forEach((o, i) => { pos[opKey(o)] = (opImpegnati.has(opKey(o)) ? 0 : 100000) + i })
    setOrdine({ chiave: chiaveOrdine, pos })
  }, [chiaveOrdine, assQuery.isSuccess, assQuery.isFetching, operatori, opImpegnati, ordine.chiave])

  const operatoriFiltrati = useMemo(() => {
    const lista = filtroCategoria
      ? operatori.filter(o => o.categoria === filtroCategoria || (o.tipo === 'utente' && filtroCategoria === '__interni__'))
      : operatori
    const p = o => ordine.pos[opKey(o)] ?? 200000
    return [...lista].sort((a, b) => p(a) - p(b))
  }, [operatori, filtroCategoria, ordine])

  // Celle per riga (array stabili: le righe memo non si ridisegnano senza motivo)
  const celleRighe = useMemo(() => operatoriFiltrati.map(op =>
    slots.map(sl => assMap[ck(op.tipo, op.id, sl.data, sl.turno)] || null)), [operatoriFiltrati, slots, assMap])

  // ── Salvataggio in blocco con aggiornamento immediato della griglia ──
  const salvaMutation = useMutation(
    celle => api.put('/assegnazioni/bulk', { celle }),
    {
      onMutate: async celle => {
        await qc.cancelQueries(queryKey)
        const prima = qc.getQueryData(queryKey)
        const nomi = Object.fromEntries(cantieri.map(c => [c.id, c.nome]))
        qc.setQueryData(queryKey, (old = []) => {
          const chiave = a => `${a.artigiano_id || ''}_${a.utente_id || ''}_${a.data}_${a.turno}`
          const toccate = new Set(celle.map(chiave))
          const resto = old.filter(a => !toccate.has(chiave(a)))
          const nuove = celle
            .filter(c => !(c.tipo === 'cantiere' && !c.cantiere_id && !c.lavorazione))
            .map(c => ({ ...c, id: `tmp_${chiave(c)}`, cantiere_nome: nomi[c.cantiere_id] || old.find(a => a.cantiere_id === c.cantiere_id)?.cantiere_nome || null }))
          return [...resto, ...nuove]
        })
        return { prima }
      },
      onError: (e, _v, ctx) => {
        if (ctx?.prima) qc.setQueryData(queryKey, ctx.prima)
        toast.error(e.response?.data?.detail || 'Errore nel salvataggio: nessuna modifica applicata')
      },
      onSettled: () => qc.invalidateQueries('assegnazioni'),
    }
  )

  // ── Selezione a rettangolo ──
  const [sel, setSel] = useState(null)          // { ar, as, cr, cs } ancora + punto corrente
  const [pannello, setPannello] = useState(null) // { id, celle, iniziale, anchor }
  const dragRef = useRef(null)
  const selRef = useRef(null)
  const ultimoPointer = useRef('mouse')
  const datiRef = useRef({})
  datiRef.current = { operatoriFiltrati, slots, celleRighe }

  const chiudiPannello = useCallback(() => { setPannello(null); setSel(null); selRef.current = null }, [])

  const apriPannello = useCallback((s) => {
    const { operatoriFiltrati: ops, slots: sls, celleRighe: righe } = datiRef.current
    const n = normSel(s)
    const celle = []
    for (let r = n.r0; r <= n.r1; r++) {
      for (let c = n.s0; c <= n.s1; c++) {
        if (!ops[r] || !sls[c]) continue
        celle.push({ op: ops[r], data: sls[c].data, turno: sls[c].turno, ass: righe[r][c] })
      }
    }
    if (!celle.length) { chiudiPannello(); return }
    if (celle.length > 2000) { toast.error('Selezione troppo grande'); chiudiPannello(); return }
    // Valori proposti: quelli della cella da cui è partita la selezione (trascinando da una cella colorata la si replica)
    const iniziale = righe[s.ar]?.[s.as] || null
    setPannello({ id: Date.now(), celle, iniziale, anchor: { r: s.cr, s: s.cs } })
  }, [chiudiPannello])

  const aggiornaSel = s => { selRef.current = s; setSel(s) }

  const iniziaDrag = useCallback((r, s) => {
    dragRef.current = true
    setPannello(null)
    aggiornaSel({ ar: r, as: s, cr: r, cs: s })
  }, [])

  const fineDrag = useCallback(() => {
    if (!dragRef.current) return
    dragRef.current = null
    if (selRef.current) apriPannello(selRef.current)
  }, [apriPannello])

  useEffect(() => {
    if (!canWrite) return
    const onMove = e => {
      if (!dragRef.current) return
      if (e.pointerType === 'mouse' && e.buttons === 0) { fineDrag(); return }  // rilasciato fuori finestra
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-s]')
      if (!el) return
      const r = +el.dataset.r, s = +el.dataset.s
      const cur = selRef.current
      if (cur && (cur.cr !== r || cur.cs !== s)) aggiornaSel({ ...cur, cr: r, cs: s })
    }
    const onCancel = () => { if (dragRef.current) { dragRef.current = null; chiudiPannello() } }
    const onKey = e => { if (e.key === 'Escape' && dragRef.current) onCancel() }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', fineDrag)
    document.addEventListener('pointercancel', onCancel)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', fineDrag)
      document.removeEventListener('pointercancel', onCancel)
      document.removeEventListener('keydown', onKey)
    }
  }, [canWrite, fineDrag, chiudiPannello])

  // Mouse: premi e trascina. Touch: tap = una cella, trascina solo in "Modalità assegna"
  const interazione = useMemo(() => ({
    touchAction: modalitaAssegna ? 'none' : 'auto',
    onPointerDown: (e, r, s) => {
      ultimoPointer.current = e.pointerType
      if (e.pointerType === 'mouse' && e.button !== 0) return
      if (e.pointerType !== 'mouse' && !modalitaAssegna) return
      e.preventDefault()
      e.target.releasePointerCapture?.(e.pointerId)   // il dito deve poter "passare" sulle altre celle
      iniziaDrag(r, s)
    },
    onClick: (e, r, s) => {
      if (ultimoPointer.current === 'mouse' || modalitaAssegna) return
      const s1 = { ar: r, as: s, cr: r, cs: s }
      aggiornaSel(s1)
      apriPannello(s1)
    },
  }), [modalitaAssegna, iniziaDrag, apriPannello])

  const salvaPannello = valori => {
    if (!pannello) return
    const celle = pannello.celle.map(c => ({
      ...(c.op.tipo === 'artigiano' ? { artigiano_id: c.op.id } : { utente_id: c.op.id }),
      data: c.data, turno: c.turno, ...valori,
    }))
    salvaMutation.mutate(celle, {
      onSuccess: r => {
        const { salvate = 0, rimosse = 0 } = r.data || {}
        if (celle.length > 1) toast.success(rimosse && !salvate ? `${rimosse} turni svuotati` : `${salvate} turni assegnati`)
      },
    })
    chiudiPannello()
  }

  // ── Layout: larghezza slot adattata allo spazio disponibile ──
  const boxRef = useRef(null)
  const [boxW, setBoxW] = useState(0)
  useLayoutEffect(() => {
    if (!boxRef.current) return
    const ro = new ResizeObserver(([e]) => setBoxW(e.contentRect.width))
    ro.observe(boxRef.current)
    return () => ro.disconnect()
  }, [isLoading])
  const nameW = isMobile ? 96 : 168
  const minSlot = vista === 'mese' ? (isMobile ? 16 : 20) : (isMobile ? 20 : 40)
  const slotW = Math.max(minSlot, Math.floor(((boxW || 1000) - nameW - 2) / Math.max(1, slots.length)))
  const rowH = isMobile ? 40 : 36

  const giorniPianificati = useMemo(() => {
    const m = {}
    assegnazioni.forEach(a => { const k = a.artigiano_id ? `artigiano_${a.artigiano_id}` : `utente_${a.utente_id}`; m[k] = (m[k] || 0) + 0.5 })
    return m
  }, [assegnazioni])

  // Notifica push del programma settimanale a tutti gli operatori (dal Gantt)
  const pubblicaMutation = useMutation(
    () => api.post('/assegnazioni/pubblica-settimana', { anno: settAnno, settimana: sett }),
    {
      onSuccess: r => {
        const d = r.data
        toast.success(`Programma inviato a ${d.notificati} operator${d.notificati === 1 ? 'e' : 'i'}` +
          (d.senza_account ? ` (${d.senza_account} senza account)` : ''))
      },
      onError: e => toast.error(e.response?.data?.detail || 'Errore invio programma'),
    }
  )
  const pubblicaSettimana = () => {
    if (window.confirm(`Inviare il programma della settimana ${sett} a tutti gli operatori con account?`)) pubblicaMutation.mutate()
  }

  const esportaPdf = async soloImpegnati => {
    setMenuPdf(false)
    setEsportando(true)
    try {
      const resp = await api.get('/assegnazioni/pdf', {
        params: { ...periodo, solo_impegnati: soloImpegnati, ...(filtroCategoria ? { categoria: filtroCategoria } : {}) },
        responseType: 'blob', timeout: 90000,
      })
      const url = URL.createObjectURL(resp.data)
      const a = document.createElement('a')
      a.href = url
      a.download = resp.headers['content-disposition']?.match(/filename="(.+)"/)?.[1] || 'gantt_operatori.pdf'
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch { toast.error('Errore nella generazione del PDF') }
    finally { setEsportando(false) }
  }

  const navLabel = vista === 'mese'
    ? dayjs(`${anno}-${String(mese).padStart(2, '0')}-01`).format('MMMM YYYY')
    : `Settimana ${sett} · ${giorni[0].format('D MMM')} – ${giorni[giorni.length - 1].format('D MMM YYYY')}`
  const periodoCorrente = giorni.some(d => d.isSame(oggi, 'day'))

  if (isLoading) return <div className="text-center py-12 text-gray-400">Caricamento...</div>

  const selN = normSel(sel)
  const nSel = selN ? (selN.r1 - selN.r0 + 1) * (selN.s1 - selN.s0 + 1) : 0
  const mostraFab = canWrite && touch

  return (
    <div className="space-y-3 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Users size={20} className="text-steelex-orange"/>
          <div>
            <h1 className="text-lg font-bold text-gray-900">Gantt Operatori</h1>
            <p className="text-xs text-gray-400">
              {operatoriFiltrati.filter(o => o.tipo === 'artigiano').length} artigiani ·{' '}
              {operatoriFiltrati.filter(o => o.tipo === 'utente').length} interni ·{' '}
              <span className="text-steelex-orange font-semibold">{opImpegnati.size} impegnati</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {[['settimana', 'Settimana', Calendar], ['mese', 'Mese', CalendarDays]].map(([k, l, Icon]) => (
              <button key={k} onClick={() => { setVista(k); chiudiPannello() }}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${vista === k ? 'bg-white shadow text-steelex-orange' : 'text-gray-500'}`}>
                <Icon size={13}/> {l}
              </button>
            ))}
          </div>
          <div className="relative">
            <button onClick={() => setMenuPdf(v => !v)} disabled={esportando}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-700 hover:border-steelex-orange hover:text-steelex-orange disabled:opacity-50 transition-colors">
              {esportando ? <Loader2 size={14} className="animate-spin"/> : <FileDown size={14}/>} PDF
            </button>
            {menuPdf && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setMenuPdf(false)}/>
                <div className="absolute right-0 top-full mt-1 z-40 w-56 bg-white border border-gray-200 rounded-xl shadow-xl p-1">
                  <button onClick={() => esportaPdf(true)} className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50">
                    <p className="text-xs font-semibold text-gray-800">Solo operatori impegnati</p>
                    <p className="text-[11px] text-gray-400">Chi ha almeno un turno nel periodo</p>
                  </button>
                  <button onClick={() => esportaPdf(false)} className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50">
                    <p className="text-xs font-semibold text-gray-800">Tutti gli operatori</p>
                    <p className="text-[11px] text-gray-400">Anche le righe vuote</p>
                  </button>
                  <p className="px-3 pt-1 pb-1.5 text-[10px] text-gray-400 border-t border-gray-100 mt-1">
                    Periodo e filtro categoria come a video
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Filtri categoria */}
      {categorie.length > 0 && (
        <div className="flex gap-1.5 flex-wrap items-center">
          <button onClick={() => setFiltroCategoria(null)}
            className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${!filtroCategoria ? 'bg-steelex-orange text-white border-steelex-orange' : 'bg-white text-gray-500 border-gray-200 hover:border-steelex-orange hover:text-steelex-orange'}`}>
            Tutti
          </button>
          {categorie.map(cat => (
            <button key={cat} onClick={() => setFiltroCategoria(f => f === cat ? null : cat)}
              className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors capitalize ${filtroCategoria === cat ? 'bg-steelex-orange text-white border-steelex-orange' : 'bg-white text-gray-500 border-gray-200 hover:border-steelex-orange hover:text-steelex-orange'}`}>
              {cat}
            </button>
          ))}
          <button onClick={() => setFiltroCategoria(f => f === '__interni__' ? null : '__interni__')}
            className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${filtroCategoria === '__interni__' ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-gray-500 border-gray-200 hover:border-slate-500 hover:text-slate-600'}`}>
            Solo interni
          </button>
        </div>
      )}

      {/* Navigazione */}
      <div className="flex items-center gap-2 bg-white rounded-xl border border-gray-100 shadow-sm p-2">
        <button onClick={() => { vista === 'mese' ? prevMese() : prevSett(); chiudiPannello() }} className="p-2 rounded-lg hover:bg-gray-100 text-gray-600" aria-label="Precedente"><ChevronLeft size={18}/></button>
        <div className="flex-1 text-center">
          <p className="font-semibold text-gray-900 text-sm capitalize">{navLabel}</p>
          {periodoCorrente
            ? <span className="text-xs text-steelex-orange font-semibold">{vista === 'mese' ? 'Mese corrente' : 'Settimana corrente'}</span>
            : <button onClick={() => { vaiOggi(); chiudiPannello() }} className="text-xs text-gray-400 hover:text-steelex-orange font-semibold">Torna a oggi</button>}
        </div>
        <button onClick={() => { vista === 'mese' ? nextMese() : nextSett(); chiudiPannello() }} className="p-2 rounded-lg hover:bg-gray-100 text-gray-600" aria-label="Successivo"><ChevronRight size={18}/></button>
      </div>

      {/* Invia programma settimana — notifica push agli operatori con account */}
      {vista === 'settimana' && canWrite && (
        <button onClick={pubblicaSettimana} disabled={pubblicaMutation.isLoading}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-steelex-orange text-white text-sm font-semibold shadow-sm hover:opacity-90 disabled:opacity-50 transition-opacity">
          <Send size={15}/>
          {pubblicaMutation.isLoading ? 'Invio in corso…' : `Invia programma settimana ${sett} agli operatori`}
        </button>
      )}

      {/* Barra stato selezione / suggerimento (altezza fissa: niente salti) */}
      {canWrite && (
        <div className="h-5 px-1 text-xs flex items-center gap-2">
          {nSel > 1 ? (
            <span className="font-semibold" style={{ color: SCURO }}>
              {nSel} turni selezionati · {selN.r1 - selN.r0 + 1} operator{selN.r1 === selN.r0 ? 'e' : 'i'}
              <span className="text-gray-400 font-normal"> · Esc per annullare</span>
            </span>
          ) : (
            <span className="text-gray-400 truncate">
              {touch && !modalitaAssegna
                ? 'Tocca un turno per assegnarlo · attiva "Modalità assegna" per selezionarne tanti trascinando'
                : 'Click su un turno per assegnarlo · trascina per selezionare un blocco (anche su più operatori e su celle già piene)'}
            </span>
          )}
          {salvaMutation.isLoading && <Loader2 size={12} className="animate-spin text-gray-400 ml-auto"/>}
        </div>
      )}

      {operatoriFiltrati.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">
          <Users size={36} className="mx-auto mb-2 opacity-30"/>
          <p className="font-medium">Nessun operatore trovato</p>
        </div>
      ) : (
        <>
          <div ref={boxRef} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden" style={{ userSelect: 'none' }}>
            <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 230px)', WebkitOverflowScrolling: 'touch' }}>
              <table style={{ borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed', width: nameW + slots.length * slotW }}>
                <thead>
                  <tr>
                    <th rowSpan={2} className="sticky left-0 top-0 z-40 px-2 text-left border-r border-white/10"
                      style={{ background: SCURO, width: nameW, minWidth: nameW }}>
                      <span className="text-[10px] font-bold text-gray-300 uppercase tracking-widest">Operatore</span>
                    </th>
                    {giorni.map(d => {
                      const isOggi = d.isSame(oggi, 'day')
                      const weekend = d.day() === 0 || d.day() === 6
                      return (
                        <th key={d.format('YYYY-MM-DD')} colSpan={2} className="sticky top-0 z-30 p-0"
                          style={{ background: SCURO, height: 34, borderLeft: d.day() === 1 ? '1.5px solid rgba(255,255,255,0.25)' : '1px solid rgba(255,255,255,0.08)' }}>
                          <div className={`flex ${slotW * 2 >= 70 ? 'flex-row gap-1 justify-center' : 'flex-col'} items-center leading-none`}
                            style={{ opacity: weekend && !isOggi ? 0.45 : 1 }}>
                            <span className="uppercase text-gray-400" style={{ fontSize: 9 }}>{d.format('dd')}</span>
                            <span className="text-xs font-bold mt-0.5 px-1 rounded"
                              style={isOggi ? { background: ACCENTO, color: '#fff' } : { color: '#fff' }}>{d.format('D')}</span>
                          </div>
                        </th>
                      )
                    })}
                  </tr>
                  <tr>
                    {slots.map((sl, s) => (
                      <th key={s} className="sticky z-30 p-0 text-center"
                        style={{
                          top: 34, height: 15, fontSize: 9, fontWeight: 600, color: '#9ca3af',
                          background: sl.oggi ? '#fff1e6' : sl.weekend ? '#f1f1ef' : '#f8f8f6',
                          borderLeft: sl.turno === 'M' ? (sl.lunedi ? '1.5px solid #d4d4d8' : '1px solid #e5e7eb') : 'none',
                          borderBottom: '1px solid #e5e7eb',
                        }}>
                        {slotW >= 14 ? sl.turno : ''}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {operatoriFiltrati.map((op, r) => {
                    const prevTipo = r > 0 ? operatoriFiltrati[r - 1].tipo : null
                    const inSel = selN && r >= selN.r0 && r <= selN.r1
                    return (
                      <React.Fragment key={opKey(op)}>
                        {op.tipo !== prevTipo && (
                          <tr>
                            <td colSpan={1 + slots.length} className="p-0" style={{ background: '#f8f8f6', borderBottom: '1px solid #eceef1' }}>
                              <div className="sticky left-0 inline-block px-3 py-1 text-[9px] font-bold uppercase tracking-widest text-gray-400">
                                {op.tipo === 'artigiano' ? 'Artigiani / Esterni' : 'Operativi interni'}
                              </div>
                            </td>
                          </tr>
                        )}
                        <RigaOperatore op={op} r={r} celle={celleRighe[r]} slots={slots}
                          slotW={slotW} nameW={nameW} rowH={rowH}
                          selRow={inSel ? selN : null} selCols={inSel ? [selN.s0, selN.s1] : null}
                          sigle={sigle} impegnato={opImpegnati.has(opKey(op))}
                          giorniPianificati={giorniPianificati[opKey(op)] || 0}
                          zebra={r % 2 !== 0} canWrite={canWrite} interazione={interazione}/>
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <Legenda assegnazioni={assegnazioni} sigle={sigle}/>
        </>
      )}

      {pannello && (
        <PannelloAssegna key={pannello.id} celle={pannello.celle} iniziale={pannello.iniziale} anchor={pannello.anchor}
          cantieri={cantieri} sigle={sigle} salvando={salvaMutation.isLoading} mobile={isMobile}
          onSalva={salvaPannello} onChiudi={chiudiPannello}/>
      )}

      {/* FAB modalità assegna — dispositivi touch */}
      {mostraFab && (
        <button onClick={() => { setModalitaAssegna(v => !v); chiudiPannello() }}
          className={`fixed bottom-6 right-4 z-40 flex items-center gap-2 px-4 py-3 rounded-full shadow-lg font-semibold text-sm transition-all
            ${modalitaAssegna ? 'bg-steelex-orange text-white' : 'bg-white text-gray-700 border border-gray-200'}`}>
          <PenLine size={16}/>
          {modalitaAssegna ? 'Assegna attivo — trascina' : 'Modalità assegna'}
        </button>
      )}
    </div>
  )
}
