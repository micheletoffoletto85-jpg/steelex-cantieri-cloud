/**
 * Gantt operatori — vista Calendario (stile Google Calendar)
 *
 * Mese a 7 colonne: in ogni giorno i cantieri con quante persone ci sono.
 * Click su un giorno (o trascinamento su più giorni) apre il pannello "Squadra":
 * si sceglie il cantiere, i turni e si spuntano gli operatori. Salva scrive le
 * stesse assegnazioni del Gantt a righe (stessa tabella, stesso endpoint bulk),
 * quindi programmazione operai, notifica settimanale e PDF restano collegati.
 */
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, Search, Loader2, Users } from 'lucide-react'
import toast from 'react-hot-toast'
import dayjs from 'dayjs'
import {
  ACCENTO, SCURO, ACCENTO_TENUE, TIPI_LIBERI,
  isLibera, coloreAss, labelAss, siglaAss, testoScuro, ck, opKey,
} from '../lib/ganttOperatori'

const TURNI = { G: ['M', 'P'], M: ['M'], P: ['P'] }
const GIORNI_SETT = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']

// Gruppo = "dove": un cantiere oppure un'attività libera (ferie, corso...)
const chiaveGruppo = a => isLibera(a) ? `t_${a.tipo}` : `c_${a.cantiere_id || 0}`
const nelGruppo = (a, g) => !!a && !!g && (isLibera(a)
  ? a.tipo === g.tipo
  : g.tipo === 'cantiere' && (a.cantiere_id || null) === (g.cantiere_id || null))
const keyOpAss = a => a.artigiano_id ? `artigiano_${a.artigiano_id}` : `utente_${a.utente_id}`
const fmtGg = n => String(n).replace('.', ',')

// ── Pannello squadra (portal: drawer a destra su PC, foglio dal basso su telefono) ──
function PannelloSquadra({ giorniSel, gruppoIniziale, assMap, perGiorno, operatori, opsByKey, cantieri, sigle, canWrite, onSalva, onChiudi, mobile }) {
  const [tipo, setTipo] = useState(gruppoIniziale?.tipo || 'cantiere')
  const [cantiereId, setCantiereId] = useState(gruppoIniziale?.cantiere_id ? String(gruppoIniziale.cantiere_id) : '')
  const [turni, setTurni] = useState('G')
  const [lavorazione, setLavorazione] = useState('')
  const [escludiWeekend, setEscludiWeekend] = useState(true)
  const [cerca, setCerca] = useState('')
  const [scelte, setScelte] = useState({})   // opKey -> true/false (modifiche dell'utente)
  const [salvando, setSalvando] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const k = e => { if (e.key === 'Escape') onChiudi() }
    document.addEventListener('keydown', k)
    return () => document.removeEventListener('keydown', k)
  }, [onChiudi])

  const haWeekend = giorniSel.some(d => d.day() === 0 || d.day() === 6)
  const giorniTarget = useMemo(() => giorniSel.filter(d => !(escludiWeekend && giorniSel.length > 1 && (d.day() === 0 || d.day() === 6))),
    [giorniSel, escludiWeekend])
  const target = useMemo(() => giorniTarget.flatMap(d => TURNI[turni].map(t => ({ data: d.format('YYYY-MM-DD'), turno: t }))),
    [giorniTarget, turni])

  const gruppo = tipo === 'cantiere'
    ? (cantiereId ? { tipo: 'cantiere', cantiere_id: parseInt(cantiereId) } : null)
    : { tipo }

  // Stato di ogni operatore sugli slot scelti: quanti già nel gruppo, quanti su altro
  const stato = useMemo(() => {
    const out = {}
    operatori.forEach(op => {
      let dentro = 0
      const altro = new Map()
      target.forEach(({ data, turno }) => {
        const a = assMap[ck(op.tipo, op.id, data, turno)]
        if (!a) return
        if (gruppo && nelGruppo(a, gruppo)) dentro++
        else { const k = chiaveGruppo(a); altro.set(k, { a, n: (altro.get(k)?.n || 0) + 1 }) }
      })
      out[opKey(op)] = { dentro, altro: [...altro.values()], pieno: target.length > 0 && dentro === target.length }
    })
    return out
  }, [operatori, target, assMap, gruppo?.tipo, gruppo?.cantiere_id]) // eslint-disable-line

  // Le modifiche manuali si azzerano cambiando cantiere/turni/giorni
  useEffect(() => { setScelte({}) }, [tipo, cantiereId, turni, escludiWeekend])

  const spuntato = op => scelte[opKey(op)] ?? stato[opKey(op)]?.pieno ?? false
  const aggiunti = gruppo ? operatori.filter(op => spuntato(op) && !stato[opKey(op)].pieno) : []
  const tolti = gruppo ? operatori.filter(op => !spuntato(op) && stato[opKey(op)].pieno) : []
  const spostati = aggiunti.filter(op => stato[opKey(op)].altro.length > 0)

  // Ordine stabile: prima la squadra attuale, poi i liberi, poi gli impegnati altrove
  const lista = useMemo(() => {
    const q = cerca.trim().toLowerCase()
    const rank = op => { const s = stato[opKey(op)]; return s.pieno ? 0 : s.dentro ? 1 : s.altro.length ? 3 : 2 }
    return operatori
      .filter(op => !q || op.nome.toLowerCase().includes(q) || (op.azienda || op.categoria || '').toLowerCase().includes(q))
      .map((op, i) => ({ op, r: rank(op), i }))
      .sort((a, b) => a.r - b.r || a.i - b.i)
      .map(x => x.op)
  }, [operatori, cerca, stato])

  // Situazione dei giorni selezionati, raggruppata per cantiere
  const situazione = useMemo(() => {
    const m = new Map()
    giorniSel.forEach(d => {
      (perGiorno[d.format('YYYY-MM-DD')] || []).forEach(g => {
        const v = m.get(g.key) || { key: g.key, ass: g.ass, ops: new Map() }
        g.ops.forEach((turniOp, k) => {
          const o = v.ops.get(k) || { mezze: 0, turni: new Set() }
          o.mezze += turniOp.size
          turniOp.forEach(t => o.turni.add(t))
          v.ops.set(k, o)
        })
        m.set(g.key, v)
      })
    })
    return [...m.values()].sort((a, b) => b.ops.size - a.ops.size)
  }, [giorniSel, perGiorno])

  const selezionaGruppo = a => {
    if (isLibera(a)) { setTipo(a.tipo); setCantiereId('') }
    else { setTipo('cantiere'); setCantiereId(a.cantiere_id ? String(a.cantiere_id) : '') }
  }

  const payloadOp = op => op.tipo === 'artigiano' ? { artigiano_id: op.id } : { utente_id: op.id }

  const salva = async () => {
    if (!gruppo || salvando || (!aggiunti.length && !tolti.length)) return
    const valori = { tipo, cantiere_id: tipo === 'cantiere' ? gruppo.cantiere_id : null, lavorazione: lavorazione.trim() || null }
    const celle = []
    aggiunti.forEach(op => target.forEach(({ data, turno }) => {
      if (!nelGruppo(assMap[ck(op.tipo, op.id, data, turno)], gruppo)) celle.push({ ...payloadOp(op), data, turno, ...valori })
    }))
    tolti.forEach(op => target.forEach(({ data, turno }) => {
      if (nelGruppo(assMap[ck(op.tipo, op.id, data, turno)], gruppo))
        celle.push({ ...payloadOp(op), data, turno, tipo: 'cantiere', cantiere_id: null, lavorazione: null })
    }))
    setSalvando(true)
    try {
      await onSalva(celle)
      toast.success(`Squadra aggiornata${aggiunti.length ? ` · +${aggiunti.length}` : ''}${tolti.length ? ` · −${tolti.length}` : ''}`)
      setScelte({})
    } catch { /* errore già notificato dalla mutation */ }
    finally { setSalvando(false) }
  }

  // Toglie un operatore da un cantiere per tutti i giorni selezionati
  const togli = async (k, g) => {
    const op = opsByKey[k]
    if (!op) return
    const celle = []
    giorniSel.forEach(d => ['M', 'P'].forEach(t => {
      const data = d.format('YYYY-MM-DD')
      const a = assMap[ck(op.tipo, op.id, data, t)]
      if (a && chiaveGruppo(a) === g.key) celle.push({ ...payloadOp(op), data, turno: t, tipo: 'cantiere', cantiere_id: null, lavorazione: null })
    }))
    if (!celle.length) return
    try { await onSalva(celle); toast.success(`${op.nome} tolto da ${labelAss(g.ass)}`) } catch { /* già notificato */ }
  }

  const titolo = giorniSel.length === 1
    ? giorniSel[0].format('dddd D MMMM')
    : `${giorniSel[0].format('D MMM')} → ${giorniSel[giorniSel.length - 1].format('D MMM')} · ${giorniTarget.length} giorni`

  const corpo = (
    <div ref={ref}
      className={mobile
        ? 'fixed inset-x-0 bottom-0 z-[60] bg-white rounded-t-2xl shadow-2xl flex flex-col max-h-[90vh]'
        : 'fixed top-0 right-0 bottom-0 z-[60] w-[440px] max-w-full bg-white shadow-2xl border-l border-gray-200 flex flex-col'}>
      <div className="px-4 pt-3 pb-2 border-b border-gray-100">
        {mobile && <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-2"/>}
        <div className="flex items-center justify-between gap-2">
          <p className="text-base font-bold text-gray-900 truncate first-letter:uppercase">{titolo}</p>
          <button onClick={onChiudi} className="p-1.5 -m-1 rounded-lg text-gray-400 hover:bg-gray-100" aria-label="Chiudi"><X size={18}/></button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {/* Situazione: chi c'è, cantiere per cantiere */}
        <section>
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Chi c'è</p>
          {situazione.length === 0 && <p className="text-sm text-gray-400">Nessuno pianificato.</p>}
          <div className="space-y-2">
            {situazione.map(g => {
              const col = coloreAss(g.ass)
              const attivo = gruppo && nelGruppo(g.ass, gruppo)
              return (
                <div key={g.key} className={`rounded-lg border p-2 ${attivo ? 'border-gray-400 bg-gray-50' : 'border-gray-100'}`}>
                  <button onClick={() => canWrite && selezionaGruppo(g.ass)} className="w-full flex items-center gap-2 text-left">
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ background: col, color: testoScuro(col) ? '#1B1B24' : '#fff' }}>
                      {siglaAss(g.ass, sigle)}
                    </span>
                    <span className="text-sm font-semibold text-gray-800 truncate flex-1">{labelAss(g.ass)}</span>
                    <span className="text-xs text-gray-400 flex items-center gap-1"><Users size={12}/>{g.ops.size}</span>
                  </button>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {[...g.ops.entries()].map(([k, o]) => (
                      <span key={k} className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full bg-white border border-gray-200 text-xs text-gray-700">
                        {opsByKey[k]?.nome || 'Operatore'}
                        <span className="text-[10px] text-gray-400">
                          {giorniSel.length === 1 ? (o.turni.size === 2 ? '' : o.turni.has('M') ? 'matt.' : 'pom.') : `${fmtGg(o.mezze / 2)}g`}
                        </span>
                        {canWrite && (
                          <button onClick={() => togli(k, g)} className="p-0.5 rounded-full text-gray-300 hover:text-red-500 hover:bg-red-50" aria-label="Togli">
                            <X size={11}/>
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {canWrite && (
          <section>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Componi la squadra</p>
            <div className="flex gap-1 mb-2 flex-wrap">
              {[['cantiere', 'Cantiere'], ...Object.entries(TIPI_LIBERI).map(([k, v]) => [k, v.label])].map(([k, l]) => (
                <button key={k} onClick={() => setTipo(k)}
                  className={`px-2.5 py-1.5 rounded-full text-xs font-semibold border transition-colors ${tipo === k ? 'text-white' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}
                  style={tipo === k ? { background: k === 'cantiere' ? ACCENTO : TIPI_LIBERI[k].colore, borderColor: 'transparent' } : undefined}>
                  {l}
                </button>
              ))}
            </div>
            {tipo === 'cantiere' && (
              <select value={cantiereId} onChange={e => setCantiereId(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-steelex-orange">
                <option value="">— scegli il cantiere —</option>
                {cantieri.map(c => <option key={c.id} value={c.id}>{sigle[c.id] ? `${sigle[c.id]} · ` : ''}{c.nome}</option>)}
              </select>
            )}
            <div className="flex gap-2 mb-2">
              <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5 flex-shrink-0">
                {[['G', 'Giornata'], ['M', 'Mattina'], ['P', 'Pomeriggio']].map(([k, l]) => (
                  <button key={k} onClick={() => setTurni(k)}
                    className={`px-2 py-1.5 rounded-md text-xs font-semibold ${turni === k ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>{l}</button>
                ))}
              </div>
              <input type="text" value={lavorazione} onChange={e => setLavorazione(e.target.value)}
                placeholder="Lavorazione…" className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-steelex-orange"/>
            </div>
            {haWeekend && giorniSel.length > 1 && (
              <label className="flex items-center gap-2 text-xs text-gray-600 mb-2 cursor-pointer">
                <input type="checkbox" checked={escludiWeekend} onChange={e => setEscludiWeekend(e.target.checked)}/>
                Escludi sabato e domenica
              </label>
            )}

            {!gruppo ? (
              <p className="text-sm text-gray-400 py-3 text-center">Scegli il cantiere per comporre la squadra.</p>
            ) : (
              <>
                <div className="relative mb-1.5">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"/>
                  <input type="text" value={cerca} onChange={e => setCerca(e.target.value)} placeholder="Cerca operatore…"
                    className="w-full border border-gray-200 rounded-lg pl-8 pr-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-steelex-orange"/>
                </div>
                <div className="border border-gray-100 rounded-lg divide-y divide-gray-50">
                  {lista.map(op => {
                    const s = stato[opKey(op)]
                    const on = spuntato(op)
                    const altro = s.altro[0]?.a
                    return (
                      <label key={opKey(op)} className={`flex items-center gap-2.5 px-2.5 py-2 cursor-pointer ${on ? 'bg-gray-50' : 'hover:bg-gray-50'}`}>
                        <input type="checkbox" className="w-4 h-4 flex-shrink-0" style={{ accentColor: ACCENTO }} checked={on}
                          onChange={e => setScelte(v => ({ ...v, [opKey(op)]: e.target.checked }))}/>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-800 truncate">{op.nome}</p>
                          <p className="text-[11px] text-gray-400 truncate capitalize">{op.azienda || op.categoria}</p>
                        </div>
                        {s.pieno ? (
                          <span className="text-[10px] font-semibold text-gray-500">in squadra</span>
                        ) : s.dentro > 0 ? (
                          <span className="text-[10px] font-semibold text-gray-500">in parte</span>
                        ) : altro ? (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0"
                            title={s.altro.map(x => labelAss(x.a)).join(', ')}
                            style={{ background: coloreAss(altro), color: testoScuro(coloreAss(altro)) ? '#1B1B24' : '#fff' }}>
                            {siglaAss(altro, sigle)}{s.altro.length > 1 ? '+' : ''}
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold text-emerald-600">libero</span>
                        )}
                      </label>
                    )
                  })}
                  {!lista.length && <p className="text-sm text-gray-400 p-3 text-center">Nessun operatore.</p>}
                </div>
              </>
            )}
          </section>
        )}
      </div>

      {canWrite && gruppo && (
        <div className="px-4 py-3 border-t border-gray-100 bg-white">
          {spostati.length > 0 && (
            <p className="text-[11px] text-amber-700 mb-1.5">
              {spostati.length === 1 ? `${spostati[0].nome} è` : `${spostati.length} operatori sono`} già su un altro impegno: verrà sostituito.
            </p>
          )}
          <button onClick={salva} disabled={salvando || (!aggiunti.length && !tolti.length)}
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 bg-steelex-orange text-white text-sm font-bold rounded-lg hover:opacity-90 disabled:opacity-40 transition-opacity">
            {salvando && <Loader2 size={14} className="animate-spin"/>}
            {!aggiunti.length && !tolti.length ? 'Nessuna modifica'
              : `Salva squadra${aggiunti.length ? ` · +${aggiunti.length}` : ''}${tolti.length ? ` · −${tolti.length}` : ''}`}
          </button>
        </div>
      )}
    </div>
  )

  return createPortal(
    <>
      {mobile && <div className="fixed inset-0 z-[59] bg-black/30" onClick={onChiudi}/>}
      {corpo}
    </>,
    document.body,
  )
}

// ── Calendario mese ───────────────────────────────────────────────────────────
export default function GanttCalendario({ giorni, mese, assegnazioni, assMap, operatori, tuttiOperatori, cantieri, sigle, canWrite, onSalva, mobile, oggi }) {
  const opsByKey = useMemo(() => Object.fromEntries(tuttiOperatori.map(o => [opKey(o), o])), [tuttiOperatori])

  // data -> gruppi [{ key, ass, ops: Map(opKey -> Set(turni)) }] ordinati per numero di persone
  const perGiorno = useMemo(() => {
    const m = {}
    assegnazioni.forEach(a => {
      const g = (m[a.data] ||= new Map())
      const k = chiaveGruppo(a)
      const v = g.get(k) || { key: k, ass: a, ops: new Map() }
      const ko = keyOpAss(a)
      v.ops.set(ko, (v.ops.get(ko) || new Set()).add(a.turno))
      g.set(k, v)
    })
    const out = {}
    Object.entries(m).forEach(([d, g]) => { out[d] = [...g.values()].sort((a, b) => b.ops.size - a.ops.size) })
    return out
  }, [assegnazioni])

  // Selezione giorni: click = un giorno, trascina = più giorni consecutivi
  const [sel, setSel] = useState(null)        // { a, c } indici in `giorni`
  const [pannello, setPannello] = useState(null)
  const dragRef = useRef(null)
  const selRef = useRef(null)
  const gruppoRef = useRef(null)
  const ultimoPointer = useRef('mouse')

  const apri = useCallback(s => {
    const i0 = Math.min(s.a, s.c), i1 = Math.max(s.a, s.c)
    const g = gruppoRef.current
    setPannello({ id: Date.now(), giorni: giorni.slice(i0, i1 + 1), gruppo: i0 === i1 ? g : null })
  }, [giorni])

  useEffect(() => {
    const onMove = e => {
      if (!dragRef.current) return
      if (e.pointerType === 'mouse' && e.buttons === 0) return
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-gi]')
      if (!el) return
      const i = +el.dataset.gi
      if (selRef.current && selRef.current.c !== i) { selRef.current = { ...selRef.current, c: i }; setSel(selRef.current) }
    }
    const onUp = () => {
      if (!dragRef.current) return
      dragRef.current = null
      if (selRef.current) apri(selRef.current)
    }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    return () => { document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp) }
  }, [apri])

  const chiudi = useCallback(() => { setPannello(null); setSel(null); selRef.current = null }, [])

  const onPointerDown = (e, i) => {
    ultimoPointer.current = e.pointerType
    if (e.pointerType !== 'mouse' || e.button !== 0) return
    e.preventDefault()
    const chip = e.target.closest?.('[data-gruppo]')
    gruppoRef.current = chip ? JSON.parse(chip.dataset.gruppo) : null
    dragRef.current = true
    selRef.current = { a: i, c: i }
    setSel(selRef.current)
    setPannello(null)
  }
  const onClick = (e, i) => {
    if (ultimoPointer.current === 'mouse') return
    const chip = e.target.closest?.('[data-gruppo]')
    gruppoRef.current = chip ? JSON.parse(chip.dataset.gruppo) : null
    selRef.current = { a: i, c: i }
    setSel(selRef.current)
    apri(selRef.current)
  }

  const i0 = sel ? Math.min(sel.a, sel.c) : -1
  const i1 = sel ? Math.max(sel.a, sel.c) : -1
  const maxChip = mobile ? 4 : 5
  const settimane = []
  for (let i = 0; i < giorni.length; i += 7) settimane.push(giorni.slice(i, i + 7).map((d, k) => ({ d, i: i + k })))

  return (
    // Su PC il pannello è un drawer a destra: il calendario si stringe per restare tutto visibile
    <div className="space-y-3 transition-[margin] duration-200" style={{ marginRight: pannello && !mobile ? 452 : 0 }}>
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden" style={{ userSelect: 'none' }}>
        <div className="grid grid-cols-7" style={{ background: SCURO }}>
          {GIORNI_SETT.map((g, k) => (
            <div key={g} className={`py-2 text-center text-[10px] font-bold uppercase tracking-widest ${k >= 5 ? 'text-gray-500' : 'text-gray-300'}`}>{g}</div>
          ))}
        </div>
        {settimane.map((sett, w) => (
          <div key={w} className="grid grid-cols-7 border-b border-gray-100 last:border-b-0">
            {sett.map(({ d, i }) => {
              const data = d.format('YYYY-MM-DD')
              const fuori = d.month() !== mese
              const weekend = d.day() === 0 || d.day() === 6
              const isOggi = d.isSame(oggi, 'day')
              const selezionato = i >= i0 && i <= i1
              const gruppi = perGiorno[data] || []
              const persone = new Set(gruppi.filter(g => !isLibera(g.ass)).flatMap(g => [...g.ops.keys()])).size
              return (
                <div key={data} data-gi={i}
                  onPointerDown={e => onPointerDown(e, i)} onClick={e => onClick(e, i)}
                  className="relative border-l border-gray-100 first:border-l-0 cursor-pointer hover:bg-gray-50 transition-colors"
                  style={{
                    minHeight: mobile ? 78 : 118,
                    background: selezionato ? ACCENTO_TENUE : weekend ? '#fafaf8' : undefined,
                    boxShadow: selezionato ? `inset 0 0 0 2px ${SCURO}` : undefined,
                    opacity: fuori ? 0.45 : 1,
                  }}>
                  <div className="flex items-center justify-between px-1.5 pt-1">
                    <span className="text-xs font-bold px-1.5 py-0.5 rounded-md leading-none"
                      style={isOggi ? { background: ACCENTO, color: '#fff' } : { color: weekend ? '#9ca3af' : '#374151' }}>
                      {d.date() === 1 && !mobile ? d.format('D MMM') : d.format('D')}
                    </span>
                    {persone > 0 && !mobile && (
                      <span className="text-[10px] text-gray-400 flex items-center gap-0.5" title="Persone in cantiere"><Users size={10}/>{persone}</span>
                    )}
                  </div>
                  <div className="px-1 pb-1 pt-0.5 space-y-0.5">
                    {gruppi.slice(0, maxChip).map(g => {
                      const col = coloreAss(g.ass)
                      const scuro = testoScuro(col)
                      const nomi = [...g.ops.keys()].map(k => opsByKey[k]?.nome).filter(Boolean)
                      const gruppoData = JSON.stringify(isLibera(g.ass) ? { tipo: g.ass.tipo } : { tipo: 'cantiere', cantiere_id: g.ass.cantiere_id })
                      return (
                        <div key={g.key} data-gruppo={gruppoData}
                          title={`${labelAss(g.ass)}\n${nomi.join(', ')}`}
                          className={`flex items-center rounded leading-none ${mobile ? 'gap-0.5 px-0.5' : 'gap-1 px-1'}`}
                          style={{ background: col, color: scuro ? '#1B1B24' : '#fff', height: mobile ? 15 : 19 }}>
                          <span className={`font-bold flex-1 ${mobile ? 'overflow-hidden whitespace-nowrap' : 'truncate'}`} style={{ fontSize: mobile ? 8 : 11, letterSpacing: mobile ? -0.2 : 0 }}>
                            {mobile ? siglaAss(g.ass, sigle) : labelAss(g.ass)}
                          </span>
                          <span className={`font-bold flex-shrink-0 rounded ${mobile ? '' : 'px-1'}`}
                            style={{ fontSize: mobile ? 8 : 10, background: mobile ? undefined : (scuro ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.25)') }}>
                            {g.ops.size}
                          </span>
                        </div>
                      )
                    })}
                    {gruppi.length > maxChip && (
                      <p className="text-[10px] font-semibold text-gray-400 px-1">+{gruppi.length - maxChip}{mobile ? '' : ' altri'}</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-400 px-1">
        {canWrite
          ? (mobile ? 'Tocca un giorno per vedere chi c\'è e comporre la squadra' : 'Click su un giorno (o su un cantiere) per vedere chi c\'è e comporre la squadra · trascina per più giorni')
          : 'Tocca un giorno per vedere chi c\'è'}
      </p>

      {pannello && (
        <PannelloSquadra key={pannello.id} giorniSel={pannello.giorni} gruppoIniziale={pannello.gruppo}
          assMap={assMap} perGiorno={perGiorno} operatori={operatori} opsByKey={opsByKey}
          cantieri={cantieri} sigle={sigle} canWrite={canWrite} onSalva={onSalva} onChiudi={chiudi} mobile={mobile}/>
      )}
    </div>
  )
}
