/**
 * Gantt operatori — costanti di marca e funzioni comuni a griglia e calendario.
 * Il blocco "Brand" è l'unica parte che cambia tra STEELEX e FR.
 */
// ── Brand (unica parte che cambia tra STEELEX e FR) ───────────────────────────
export const ACCENTO = '#FF6B00'
export const SCURO = '#1A1A2E'
export const ACCENTO_TENUE = 'rgba(255,107,0,0.07)'      // colonna "oggi"
export const OGGI_SLOT = '#fff1e6'                        // intestazione M/P di oggi
export const OGGI_PILL = { background: ACCENTO, color: '#fff' }
export const SEL_VUOTA = 'repeating-linear-gradient(135deg, rgba(255,107,0,0.35) 0 3px, rgba(255,107,0,0.12) 3px 7px)'
export const HOVER_RIGA = 'group-hover:bg-orange-50'

// Stessa palette del PDF (backend/app/routers/assegnazioni.py → PALETTE_CANTIERI)
export const PALETTE = [
  ACCENTO,'#3b82f6','#22c55e','#a855f7','#f59e0b',
  '#06b6d4','#ec4899','#64748b','#84cc16','#f97316',
  '#6366f1','#14b8a6','#e11d48','#0ea5e9','#8b5cf6',
]
export const getColore = id => id ? PALETTE[(id - 1) % PALETTE.length] : '#94a3b8'

// Programmazione libera: attività fuori cantiere con colori fissi
export const TIPI_LIBERI = {
  ferie:    { label: 'Ferie',    sigla: 'FER', colore: '#eab308' },
  corso:    { label: 'Corso',    sigla: 'COR', colore: '#7c3aed' },
  permesso: { label: 'Permesso', sigla: 'PRM', colore: '#db2777' },
  altro:    { label: 'Altro',    sigla: 'ALT', colore: '#475569' },
}
export const isLibera = ass => ass?.tipo && ass.tipo !== 'cantiere'
export const coloreAss = ass => !ass ? null : (isLibera(ass) ? (TIPI_LIBERI[ass.tipo]?.colore || '#475569') : getColore(ass.cantiere_id))
export const labelAss = ass => !ass ? '' : isLibera(ass) ? (TIPI_LIBERI[ass.tipo]?.label || 'Altro') : (ass.cantiere_nome || 'Senza cantiere')
export const siglaAss = (ass, sigle) => !ass ? '' : isLibera(ass)
  ? (TIPI_LIBERI[ass.tipo]?.sigla || 'ALT')
  : (ass.cantiere_id ? (sigle[ass.cantiere_id] || '?') : '—')
// Due turni fanno parte della stessa barra se l'attività è identica
export const stessoBlocco = (a, b) => !!a && !!b && (a.tipo || 'cantiere') === (b.tipo || 'cantiere')
  && (a.cantiere_id || null) === (b.cantiere_id || null) && (a.lavorazione || '') === (b.lavorazione || '')

// Testo scuro su colori chiari (giallo, lime...) — stessa soglia del PDF
export function testoScuro(hex) {
  const h = (hex || '#000000').replace('#', '')
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16)
  return 0.299 * r + 0.587 * g + 0.114 * b > 165
}

// Sigle univoche per cantiere: prime 3 lettere, doppioni risolti come nel PDF
export function siglePerCantieri(lista) {
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

export function ck(tipo, id, data, turno) { return `${tipo}__${id}__${data}__${turno}` }
export const opKey = op => `${op.tipo}_${op.id}`
