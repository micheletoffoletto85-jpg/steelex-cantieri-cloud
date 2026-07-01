/**
 * Modulo Economico STEELEX — struttura semplice:
 *   Computo → Spese → SAL → Riepilogo
 */
import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { Euro, TrendingUp, TrendingDown, FileText, BarChart2, Plus, Trash2, X, Upload, ExternalLink, Camera, ClipboardList, Receipt, Edit2, CheckCircle2, Download, Sparkles, Loader2, AlertCircle, Clock, UserCheck, Pencil, MapPin, ShoppingCart, Package, Table, ChevronDown, ChevronUp } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../lib/api'
import { useAuth } from '../lib/auth'
import dayjs from 'dayjs'

const fmt = n => `€ ${(n || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtD = d => d ? dayjs(d).format('DD/MM/YYYY') : '—'

const CATEGORIE = ['materiali','manodopera','nolo','servizi','trasporto','altro']
const CAT_COLORI = { materiali:'bg-blue-100 text-blue-700', manodopera:'bg-purple-100 text-purple-700', nolo:'bg-yellow-100 text-yellow-700', servizi:'bg-green-100 text-green-700', trasporto:'bg-orange-100 text-orange-700', altro:'bg-gray-100 text-gray-600' }
const STATO_PREV = { bozza:{label:'Bozza',bg:'bg-gray-100 text-gray-600'}, inviato:{label:'Inviato',bg:'bg-blue-100 text-blue-700'}, accettato:{label:'Accettato ✓',bg:'bg-green-100 text-green-700'}, rifiutato:{label:'Rifiutato',bg:'bg-red-100 text-red-700'} }
const STATO_SAL = { bozza:{label:'Bozza',bg:'bg-gray-100 text-gray-600'}, emesso:{label:'Emesso',bg:'bg-blue-100 text-blue-700'}, pagato:{label:'Pagato ✓',bg:'bg-green-100 text-green-700'} }
const CATEGORIE_VOCE = ['Materiali','Manodopera','Nolo','Servizi','Sicurezza','Altro']

const SEZIONI = [
  ['riepilogo', 'Riepilogo', BarChart2],
  ['computo',   'Computo',   ClipboardList],
  ['spese',     'Spese',     Receipt],
  ['ordini',    'Ordini',    ShoppingCart],
  ['bolle',     'DDT',       Package],
  ['fatture',   'Fatture',   FileText],
  ['sal',       'SAL',       TrendingUp],
  ['ore',       'Ore Extra', Clock],
]

const STATI_ORDINE = {
  bozza:      { label: 'Bozza',      bg: 'bg-gray-100 text-gray-600' },
  inviato:    { label: 'Inviato',    bg: 'bg-blue-100 text-blue-700' },
  confermato: { label: 'Confermato', bg: 'bg-indigo-100 text-indigo-700' },
  evaso:      { label: 'Evaso ✓',   bg: 'bg-green-100 text-green-700' },
  annullato:  { label: 'Annullato',  bg: 'bg-red-100 text-red-600' },
}

export default function EconomiaTab({ cantiereId }) {
  const { utente } = useAuth()
  const qc = useQueryClient()
  const isDL = utente?.ruolo === 'direzione_lavori'
  const canWrite = ['admin','capo_cantiere','amministrazione'].includes(utente?.ruolo)
  const [sezione, setSezione] = useState('riepilogo')

  const SEZIONI_DL = [
    ['riepilogo', 'Riepilogo', BarChart2],
    ['computo',   'Computo',   ClipboardList],
    ['sal',       'SAL',       TrendingUp],
  ]

  const cambiaSezione = (k) => {
    setSezione(k)
    if (k === 'riepilogo') {
      qc.invalidateQueries(['economia', cantiereId])
      qc.invalidateQueries(['preventivi', cantiereId])
      qc.invalidateQueries(['spese', cantiereId])
      qc.invalidateQueries(['sal', cantiereId])
    }
    if (k === 'spese') {
      qc.invalidateQueries(['extra-preventivo', cantiereId])
    }
  }

  const sezioniVisibili = isDL ? SEZIONI_DL : SEZIONI

  return (
    <div className="space-y-3">
      {isDL && (
        <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2 text-xs text-blue-700">
          <AlertCircle size={13} />
          <span>Vista Direzione Lavori — prezzi cliente, nessun dato di costo interno.</span>
        </div>
      )}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {sezioniVisibili.map(([k,l,Icon]) => (
          <button key={k} onClick={() => cambiaSezione(k)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap flex-shrink-0 transition-colors ${sezione===k ? 'bg-steelex-orange text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            <Icon size={12} />{l}
          </button>
        ))}
      </div>

      <div style={{ display: sezione === 'riepilogo' ? 'block' : 'none' }}>
        <RiepilogoSection cantiereId={cantiereId} attiva={sezione === 'riepilogo'} isDL={isDL} />
      </div>
      <div style={{ display: sezione === 'computo' ? 'block' : 'none' }}>
        <ComputoSection cantiereId={cantiereId} canWrite={canWrite} isDL={isDL} />
      </div>
      {!isDL && (
        <>
          <div style={{ display: sezione === 'spese' ? 'block' : 'none' }}>
            <SpeseSection cantiereId={cantiereId} canWrite={canWrite} />
          </div>
          <div style={{ display: sezione === 'ordini' ? 'block' : 'none' }}>
            <OrdiniSection cantiereId={cantiereId} canWrite={canWrite} />
          </div>
          <div style={{ display: sezione === 'bolle' ? 'block' : 'none' }}>
            <BolleSection cantiereId={cantiereId} canWrite={canWrite} />
          </div>
          <div style={{ display: sezione === 'fatture' ? 'block' : 'none' }}>
            <FattureSection cantiereId={cantiereId} canWrite={canWrite} />
          </div>
        </>
      )}
      <div style={{ display: sezione === 'sal' ? 'block' : 'none' }}>
        <SALSection cantiereId={cantiereId} canWrite={canWrite} isDL={isDL} />
      </div>
      {!isDL && (
        <div style={{ display: sezione === 'ore' ? 'block' : 'none' }}>
          <OreExtraSection cantiereId={cantiereId} canWrite={canWrite} />
        </div>
      )}
    </div>
  )
}

/* ─── MINI TOTALE LIVE (visibile nelle sezioni Spese/SAL/Computo) ─── */
function MiniRiepilogoLive({ cantiereId }) {
  const { data: rv } = useQuery(
    ['economia', cantiereId],
    () => api.get(`/cantieri/${cantiereId}/economia`).then(r => r.data),
    { staleTime: 0, refetchInterval: 15000 }
  )
  if (!rv) return null
  return (
    <div className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-2 text-xs border border-gray-200">
      <span className="text-gray-400">Live →</span>
      <span>Budget: <strong className="text-steelex-orange">{`€ ${(rv.budget_preventivo||0).toLocaleString('it-IT',{minimumFractionDigits:0})}`}</strong></span>
      <span>Spese: <strong className={rv.totale_speso > rv.budget_preventivo ? 'text-red-600' : 'text-gray-700'}>{`€ ${(rv.totale_speso||0).toLocaleString('it-IT',{minimumFractionDigits:0})}`}</strong></span>
      <span className="ml-auto">Margine: <strong className={rv.margine_atteso >= 0 ? 'text-green-600' : 'text-red-600'}>{`€ ${(rv.margine_atteso||0).toLocaleString('it-IT',{minimumFractionDigits:0})}`}</strong></span>
    </div>
  )
}

/* ─── RIEPILOGO ─── */
function RiepilogoSection({ cantiereId, attiva, isDL = false }) {
  const { data: rv, isLoading, dataUpdatedAt } = useQuery(
    ['economia', cantiereId],
    () => api.get(`/cantieri/${cantiereId}/economia`).then(r => r.data),
    { staleTime: 0, refetchInterval: 20000, refetchOnMount: 'always' }
  )
  const { data: preventivi = [] } = useQuery(
    ['preventivi', cantiereId],
    () => api.get(`/cantieri/${cantiereId}/preventivi`).then(r => r.data),
    { staleTime: 0, refetchOnMount: 'always' }
  )

  const scaricaExcel = async () => {
    try {
      const resp = await api.get(`/cantieri/${cantiereId}/export/excel`, { responseType: 'blob' })
      const url = URL.createObjectURL(resp.data)
      const a = document.createElement('a')
      a.href = url
      a.download = resp.headers['content-disposition']?.match(/filename="(.+)"/)?.[1] || 'economico.xlsx'
      a.click()
      URL.revokeObjectURL(url)
    } catch { toast.error('Errore export Excel') }
  }

  if (isLoading) return <div className="text-center py-8 text-gray-400">Caricamento...</div>
  if (!rv) return null

  const prevOk = preventivi.find(p => p.stato === 'accettato')
  const percSpeso = rv.budget_preventivo > 0 ? Math.min((rv.totale_speso / rv.budget_preventivo) * 100, 100) : 0
  const marginePositivo = rv.margine_atteso >= 0

  return (
    <div className="space-y-3">
      {/* Pulsante export + timestamp aggiornamento */}
      <div className="flex items-center justify-between">
        {dataUpdatedAt ? (
          <span className="text-xs text-gray-400">
            ↻ aggiornato alle {new Date(dataUpdatedAt).toLocaleTimeString('it-IT', {hour:'2-digit',minute:'2-digit'})}
          </span>
        ) : <span />}
        <button onClick={scaricaExcel}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 transition-colors">
          <Download size={15} /> Export Excel
        </button>
      </div>

      {!prevOk && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-xs text-yellow-700">
          ⚠️ Nessun computo accettato — vai su <strong>Computo</strong> per creare il preventivo cliente.
        </div>
      )}
      {prevOk && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-xs text-green-700 flex justify-between items-center">
          <div>✅ <strong>{prevOk.numero || 'Computo'}</strong> accettato</div>
          <div>Acconto: <strong>{fmt(prevOk.acconto_ricevuto)}</strong> / {fmt(prevOk.acconto_importo)}</div>
        </div>
      )}

      {/* Cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="card">
          <p className="text-xs text-gray-400 mb-1">Valore lavoro</p>
          <p className="text-lg font-bold text-steelex-orange">{fmt(rv.budget_preventivo)}</p>
          <p className="text-xs text-gray-400">+ IVA: {fmt(rv.budget_iva)}</p>
        </div>
        {!isDL && (
          <div className="card">
            <p className="text-xs text-gray-400 mb-1">Totale speso</p>
            <p className="text-lg font-bold text-gray-900">{fmt(rv.totale_speso)}</p>
            <p className="text-xs text-gray-400">{Math.round(percSpeso)}% del budget</p>
          </div>
        )}
        {!isDL && (
          <div className="card">
            <p className="text-xs text-gray-400 mb-1">Margine atteso</p>
            <p className={`text-lg font-bold ${marginePositivo ? 'text-green-600' : 'text-red-600'}`}>{fmt(rv.margine_atteso)}</p>
            <p className="text-xs text-gray-400">{rv.budget_preventivo > 0 ? Math.round((rv.margine_atteso / rv.budget_preventivo)*100) : 0}%</p>
          </div>
        )}
        <div className={isDL ? 'card col-span-2' : 'card'}>
          <p className="text-xs text-gray-400 mb-1">Da incassare</p>
          <p className="text-lg font-bold text-blue-600">{fmt(rv.da_incassare)}</p>
          <p className="text-xs text-gray-400">Incassato: {fmt(rv.totale_sal_pagati)}</p>
        </div>
      </div>

      {/* Barra budget — solo admin/capo */}
      {!isDL && rv.budget_preventivo > 0 && (
        <div className="card space-y-2">
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Utilizzo budget costi</p>
          <div className="w-full bg-gray-100 rounded-full h-3">
            <div className={`h-3 rounded-full transition-all ${percSpeso > 100 ? 'bg-red-500' : 'bg-steelex-orange'}`} style={{ width: `${percSpeso}%` }} />
          </div>
          <div className="flex justify-between text-xs text-gray-500">
            <span>Speso: {fmt(rv.totale_speso)}</span>
            <span>Budget: {fmt(rv.budget_preventivo)}</span>
          </div>
        </div>
      )}

      {/* Spese per categoria — solo admin/capo */}
      {!isDL && Object.keys(rv.spese_per_categoria || {}).length > 0 && (
        <div className="card space-y-2">
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Spese per categoria</p>
          {Object.entries(rv.spese_per_categoria).sort((a,b) => b[1]-a[1]).map(([cat, tot]) => (
            <div key={cat} className="flex items-center gap-2">
              <span className={`text-xs px-2 py-0.5 rounded-full w-24 text-center ${CAT_COLORI[cat] || CAT_COLORI.altro}`}>{cat}</span>
              <div className="flex-1 bg-gray-100 rounded-full h-2">
                <div className="bg-steelex-orange h-2 rounded-full" style={{ width: rv.totale_speso > 0 ? `${(tot/rv.totale_speso)*100}%` : '0%' }} />
              </div>
              <span className="text-xs font-medium text-gray-700 w-24 text-right">{fmt(tot)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ─── COMPUTO ─── */
const COLORI_VOCE_PRESET = ['#FF6B00','#3b82f6','#22c55e','#ef4444','#8b5cf6','#f59e0b']

function ComputoSection({ cantiereId, canWrite, isDL = false }) {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [voci, setVoci] = useState([])
  const [base, setBase] = useState({ numero: '', data_preventivo: '', iva_perc: 22, acconto_perc: 30, note: '' })
  const setB = (k,v) => setBase(f => ({...f,[k]:v}))
  const [uploadingFor, setUploadingFor] = useState(null)
  const [importando, setImportando] = useState(false)
  const [vociImportate, setVociImportate] = useState(null)   // tutte le righe dell'Excel
  const [righeSelezionate, setRigheSelezionate] = useState(null) // set di id selezionati
  const importInputRef = useRef(null)
  const [ricarico_globale, setRicaricoGlobale] = useState('')
  const [modalita, setModalita] = useState('costo') // 'costo' = costo+ricarico | 'cliente' = prezzi cliente diretti
  const [showPaste, setShowPaste] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [pasteRighe, setPasteRighe] = useState(null)   // righe grezze dopo incolla
  const [colMap, setColMap] = useState({})             // { colIndex: ruolo }
  // ruoli: 'desc' | 'um' | 'qt' | 'prezzo' | 'tot' | 'ignora'

  const { data: preventivi = [], isLoading } = useQuery(['preventivi', cantiereId], () => api.get(`/cantieri/${cantiereId}/preventivi`).then(r => r.data), { staleTime: 0 })

  const chiudi = () => { setShowForm(false); setEditId(null); setVoci([]); setBase({ numero:'',data_preventivo:'',iva_perc:22,acconto_perc:30,note:'' }); setRicaricoGlobale(''); setModalita('costo'); setVociImportate(null); setRigheSelezionate(null) }

  const applicaRicaricoGlobale = () => {
    const ric = parseFloat(ricarico_globale) || 0
    if (ric <= 0) { toast.error('Inserisci una percentuale valida'); return }
    setVoci(vv => vv.map(v => {
      const costo = v.costo_unitario || 0
      const qt = v.qt || 1
      const prezzoCliente = parseFloat((costo * (1 + ric / 100)).toFixed(2))
      return { ...v, ricarico_perc: ric, prezzo_unitario: prezzoCliente, totale_costo: parseFloat((costo * qt).toFixed(2)), totale_cliente: parseFloat((prezzoCliente * qt).toFixed(2)) }
    }))
    toast.success(`Ricarico ${ric}% applicato a tutte le voci`)
  }

  const apriModifica = (p) => {
    setEditId(p.id)
    // Normalizza i campi — possono venire dal backend o da import Claude
    const vociNorm = (p.voci || []).map((v, i) => {
      const qt      = parseFloat(v.qt || v.quantita || 1)
      const costo   = parseFloat(v.costo_unitario || v.prezzo_costo || 0)
      const ric     = parseFloat(v.ricarico_perc || 0)
      const prezzoC = parseFloat(v.prezzo_unitario || v.prezzo_cliente || costo * (1 + ric / 100) || 0)
      return {
        id: v.id || Date.now() + i,
        descrizione:     v.descrizione    || '',
        categoria:       v.categoria      || 'Materiali',
        qt,
        um:              v.um             || 'cad',
        costo_unitario:  parseFloat(costo.toFixed(2)),
        ricarico_perc:   parseFloat(ric.toFixed(2)),
        prezzo_unitario: parseFloat(prezzoC.toFixed(2)),
        totale_costo:    parseFloat((costo   * qt).toFixed(2)),
        totale_cliente:  parseFloat((prezzoC * qt).toFixed(2)),
      }
    })
    setVoci(vociNorm)
    setBase({ numero: p.numero||'', data_preventivo: p.data||'', iva_perc: p.iva_perc, acconto_perc: p.acconto_perc, note: p.note||'' })
    setShowForm(true)
  }

  const aggiungiVoce = () => setVoci(v => [...v, { id: Date.now(), descrizione:'', categoria:'Materiali', qt:1, um:'fornitura', costo_unitario:0, ricarico_perc:30, prezzo_unitario:0, totale_costo:0, totale_cliente:0 }])

  const aggiornaVoce = (id, k, val) => setVoci(vv => vv.map(v => {
    if (v.id !== id) return v
    const up = { ...v, [k]: val }
    if (modalita === 'cliente') {
      // Modalità prezzi diretti: prezzo_cliente editabile, costo = prezzo_cliente (nessun ricarico)
      if (['prezzo_unitario','qt'].includes(k)) {
        const prezzoC = k==='prezzo_unitario' ? parseFloat(val)||0 : up.prezzo_unitario
        const qt = k==='qt' ? parseFloat(val)||1 : up.qt
        up.costo_unitario = prezzoC // non c'è distinzione costo/cliente
        up.ricarico_perc = 0
        up.totale_costo = parseFloat((prezzoC * qt).toFixed(2))
        up.totale_cliente = parseFloat((prezzoC * qt).toFixed(2))
      }
    } else {
      // Modalità costo + ricarico
      if (['costo_unitario','ricarico_perc','qt'].includes(k)) {
        const costo = k==='costo_unitario' ? parseFloat(val)||0 : up.costo_unitario
        const ric   = k==='ricarico_perc'  ? parseFloat(val)||0 : up.ricarico_perc
        const qt    = k==='qt'             ? parseFloat(val)||1 : up.qt
        up.prezzo_unitario = parseFloat((costo*(1+ric/100)).toFixed(2))
        up.totale_costo    = parseFloat((costo*qt).toFixed(2))
        up.totale_cliente  = parseFloat((up.prezzo_unitario*qt).toFixed(2))
      }
    }
    return up
  }))

  // Calcolo difensivo: se totale_cliente è 0 o mancante, lo deriva da prezzo*qt
  const _totCli = v => parseFloat(v.totale_cliente) || parseFloat(((parseFloat(v.prezzo_unitario)||0) * (parseFloat(v.qt)||1)).toFixed(2))
  const _totCos = v => parseFloat(v.totale_costo)   || parseFloat(((parseFloat(v.costo_unitario) ||0) * (parseFloat(v.qt)||1)).toFixed(2))
  const subtotale = voci.reduce((s,v) => s + _totCli(v), 0)
  const costoTot  = voci.reduce((s,v) => s + _totCos(v), 0)
  const ivaPerc   = base.iva_perc === '' ? 22 : (parseFloat(base.iva_perc) ?? 22)
  const totale    = subtotale * (1 + ivaPerc/100)
  const acconto   = totale * (parseFloat(base.acconto_perc)||30)/100
  const margine   = subtotale - costoTot

  const saveMutation = useMutation(
    (payload) => editId ? api.put(`/cantieri/${cantiereId}/preventivi/${editId}`, payload) : api.post(`/cantieri/${cantiereId}/preventivi`, payload),
    { onSuccess: () => { qc.invalidateQueries(['preventivi',cantiereId]); qc.invalidateQueries(['economia',cantiereId]); chiudi(); toast.success(editId?'Aggiornato!':'Computo creato!') },
      onError: e => toast.error(e.response?.data?.detail||'Errore') }
  )
  const updateMutation = useMutation(
    ({id,data}) => api.put(`/cantieri/${cantiereId}/preventivi/${id}`, data),
    { onSuccess: () => { qc.invalidateQueries(['preventivi',cantiereId]); qc.invalidateQueries(['economia',cantiereId]); toast.success('Aggiornato') } }
  )
  const deleteMutation = useMutation(
    id => api.delete(`/cantieri/${cantiereId}/preventivi/${id}`),
    { onSuccess: () => { qc.invalidateQueries(['preventivi',cantiereId]); qc.invalidateQueries(['economia',cantiereId]); toast.success('Eliminato') } }
  )
  const importaComputoAI = async (file) => {
    setImportando(true)
    try {
      const fd = new FormData(); fd.append('file', file)
      const r = await api.post(`/cantieri/${cantiereId}/preventivi/import-computo`, fd, { headers: {'Content-Type':'multipart/form-data'} })
      const vv = r.data.voci
      setVociImportate(vv)
      // seleziona di default solo le righe NON sospette
      const selDefault = new Set(vv.filter(v => !v.sospetta).map(v => v.id))
      setRigheSelezionate(selDefault)
      const nSospette = vv.filter(v => v.sospetta).length
      if (nSospette > 0)
        toast.success(`${r.data.totale_voci} righe trovate · ${nSospette} sospette escluse automaticamente`)
      else
        toast.success(`${r.data.totale_voci} righe trovate — tutte selezionate`)
    } catch(e) {
      toast.error(e.response?.data?.detail || 'Errore import')
    } finally { setImportando(false) }
  }

  const parseNum = s => {
    if (s == null || s === '') return null
    let t = String(s).replace(/[^\d.,-]/g, '').trim() // rimuovi €, spazi, ecc.
    if (!t) return null
    // Formato italiano: 1.234,56 → punto=migliaia, virgola=decimale
    if (/\d+\.\d{3},\d{1,2}$/.test(t)) t = t.replace(/\./g, '').replace(',', '.')
    // Formato con solo virgola decimale: 1234,56
    else if (/,\d{1,2}$/.test(t) && !t.includes('.')) t = t.replace(',', '.')
    // Rimuovi eventuali punti migliaia residui (es. 1.234.567)
    else if ((t.match(/\./g)||[]).length > 1) t = t.replace(/\./g, '')
    const n = parseFloat(t)
    return isNaN(n) ? null : n
  }

  // Dopo incolla: mostra tabella grezza e chiedi all'utente di mappare le colonne
  const onPasteRicevuto = (testo) => {
    const righe = testo.trim().split('\n')
      .map(r => r.split('\t').map(c => c.trim()))
      .filter(r => r.some(c => c))
    if (!righe.length) { toast.error('Nessuna riga trovata'); return }
    const nCols = Math.max(...righe.map(r => r.length))
    // Suggerimento automatico: col con testo lungo = desc, ultime numeriche = prezzo/tot
    const campione = righe.slice(0, 10)
    const numScore = Array(nCols).fill(0)
    campione.forEach(r => r.forEach((c, ci) => { if (parseNum(c) !== null) numScore[ci]++ }))
    const soglia = Math.max(1, Math.floor(campione.length * 0.3))
    const colNum = numScore.map((n,i) => n >= soglia ? i : -1).filter(i => i >= 0)
    const suggeriti = {}
    // colonna con testo più lungo = desc
    let maxLen = 0, colDescSugg = 0
    campione.forEach(r => r.forEach((c,ci) => { if (!colNum.includes(ci) && c.length > maxLen) { maxLen=c.length; colDescSugg=ci } }))
    suggeriti[colDescSugg] = 'desc'
    if (colNum.length >= 3) {
      suggeriti[colNum[0]] = 'qt'
      suggeriti[colNum[colNum.length-2]] = 'prezzo'
      suggeriti[colNum[colNum.length-1]] = 'tot'
    } else if (colNum.length === 2) {
      suggeriti[colNum[0]] = 'prezzo'
      suggeriti[colNum[1]] = 'tot'
    } else if (colNum.length === 1) {
      suggeriti[colNum[0]] = 'tot'
    }
    // prima colonna corta non numerica dopo desc = um
    for (let ci = 0; ci < nCols; ci++) {
      if (ci === colDescSugg || colNum.includes(ci)) continue
      if (campione.some(r => r[ci] && r[ci].length <= 6)) { suggeriti[ci] = 'um'; break }
    }
    setPasteRighe(righe)
    setColMap(suggeriti)
    setShowPaste(false)
  }

  const confermaMappatura = () => {
    const colDesc   = parseInt(Object.entries(colMap).find(([,v]) => v==='desc')?.[0] ?? '-1')
    const colUm     = parseInt(Object.entries(colMap).find(([,v]) => v==='um')?.[0] ?? '-1')
    const colQt     = parseInt(Object.entries(colMap).find(([,v]) => v==='qt')?.[0] ?? '-1')
    const colPrezzo = parseInt(Object.entries(colMap).find(([,v]) => v==='prezzo')?.[0] ?? '-1')
    const colTot    = parseInt(Object.entries(colMap).find(([,v]) => v==='tot')?.[0] ?? '-1')
    if (colDesc < 0) { toast.error('Assegna almeno la colonna Descrizione'); return }
    const vv = []
    pasteRighe.forEach((r, i) => {
      const desc = r[colDesc] || ''
      if (!desc || desc.length < 2) return
      const qt  = parseNum(colQt  >= 0 ? r[colQt]    : null) ?? 1
      const pr  = parseNum(colPrezzo >= 0 ? r[colPrezzo] : null) ?? 0
      const tot = parseNum(colTot >= 0 ? r[colTot]   : null) ?? (qt * pr)
      const um  = (colUm >= 0 ? r[colUm] : '') || 'cad'
      vv.push({ id: Date.now()+i, descrizione: desc.slice(0,200), categoria:'Altro', um,
        quantita:qt, prezzo_costo:pr, ricarico_perc:0, prezzo_cliente:pr,
        totale_costo:tot, totale_cliente:tot, sospetta:false })
    })
    if (!vv.length) { toast.error('Nessuna riga valida'); return }
    setVociImportate(vv)
    setRigheSelezionate(new Set(vv.map(v => v.id)))
    setPasteRighe(null)
    toast.success(`${vv.length} righe importate`)
  }

  const _normalizzaVoce = (v, i) => {
    const qt               = parseFloat(v.quantita || v.qt || 1)
    const totCostoStored   = parseFloat(v.totale_costo   || 0)
    const totClienteStored = parseFloat(v.totale_cliente || 0)
    let costo   = parseFloat(v.prezzo_costo   || v.costo_unitario  || 0)
    const ric   = parseFloat(v.ricarico_perc  || 0)
    let prezzoC = parseFloat(v.prezzo_cliente || v.prezzo_unitario || costo * (1 + ric / 100) || 0)
    // Se il totale era già calcolato dall'Excel, usalo direttamente (non ricalcolare prezzo*qt)
    // e se manca il prezzo unitario, derivalo dal totale
    const totCosto   = totCostoStored   > 0 ? totCostoStored   : parseFloat((costo   * qt).toFixed(2))
    const totCliente = totClienteStored > 0 ? totClienteStored : parseFloat((prezzoC * qt).toFixed(2))
    if (costo   === 0 && totCosto   > 0) costo   = totCosto   / qt
    if (prezzoC === 0 && totCliente > 0) prezzoC = totCliente / qt
    return {
      id: Date.now() + i,
      descrizione: v.descrizione || '',
      categoria:   v.categoria   || 'Materiali',
      qt, um: v.um || 'cad',
      costo_unitario:  parseFloat(costo.toFixed(2)),
      ricarico_perc:   parseFloat(ric.toFixed(2)),
      prezzo_unitario: parseFloat(prezzoC.toFixed(2)),
      totale_costo:    parseFloat(totCosto.toFixed(2)),
      totale_cliente:  parseFloat(totCliente.toFixed(2)),
    }
  }

  const confermaImport = () => {
    const selezionate = (vociImportate || []).filter(v => righeSelezionate?.has(v.id))
    const normalizzate = selezionate.map((v, i) => {
      // Voci da incolla: totale_costo/totale_cliente già calcolati da confermaMappatura — usarli direttamente
      const qt         = parseFloat(v.quantita || v.qt || 1)
      const totCosto   = parseFloat(v.totale_costo   || 0)
      const totCliente = parseFloat(v.totale_cliente || 0)
      const totUso     = totCliente || totCosto
      // Prezzo unitario: mappato dall'utente oppure derivato dal totale
      let costoUnit  = parseFloat(v.prezzo_costo   || v.costo_unitario  || 0)
      let prezzoUnit = parseFloat(v.prezzo_cliente || v.prezzo_unitario || costoUnit || 0)
      if (costoUnit  === 0 && totUso > 0) costoUnit  = totUso / qt
      if (prezzoUnit === 0 && totUso > 0) prezzoUnit = totUso / qt
      console.log('[import voce]', v.descrizione, { qt, totCosto, totCliente, costoUnit, prezzoUnit })
      return {
        id:              Date.now() + i,
        descrizione:     v.descrizione || '',
        categoria:       v.categoria   || 'Materiali',
        qt,
        um:              v.um          || 'cad',
        costo_unitario:  parseFloat(costoUnit.toFixed(2)),
        ricarico_perc:   0,
        prezzo_unitario: parseFloat(prezzoUnit.toFixed(2)),
        totale_costo:    parseFloat(totCosto.toFixed(2))   || parseFloat((costoUnit  * qt).toFixed(2)),
        totale_cliente:  parseFloat(totCliente.toFixed(2)) || parseFloat((prezzoUnit * qt).toFixed(2)),
      }
    })
    setVoci(prev => [...prev, ...normalizzate])
    setVociImportate(null); setRigheSelezionate(null)
    setShowForm(true)
    toast.success(`${normalizzate.length} voci aggiunte al computo!`)
  }

  const generaPdfPreventivo = async (prevId, numero) => {
    try {
      const resp = await api.get(`/cantieri/${cantiereId}/preventivi/${prevId}/genera-pdf`, { responseType: 'blob' })
      const url = URL.createObjectURL(resp.data)
      const a = document.createElement('a')
      a.href = url
      a.download = `preventivo_${numero}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('PDF generato!')
    } catch { toast.error('Errore generazione PDF') }
  }

  const uploadPdf = async (prevId, file) => {
    setUploadingFor(prevId)
    try {
      const fd = new FormData(); fd.append('file', file)
      await api.post(`/cantieri/${cantiereId}/preventivi/${prevId}/pdf`, fd, { headers: {'Content-Type':'multipart/form-data'} })
      qc.invalidateQueries(['preventivi',cantiereId]); toast.success('PDF allegato!')
    } catch { toast.error('Errore upload')
    } finally { setUploadingFor(null) }
  }

  if (isLoading) return <div className="text-center py-8 text-gray-400">Caricamento...</div>

  // Fallback: se il backend torna totale=0 (dati vecchi), ricalcola dai voci
  const _pSubtotale = (p) => {
    if (p.subtotale > 0) return p.subtotale
    return (p.voci || []).reduce((s,v) => {
      const tc = parseFloat(v.totale_cliente) || 0
      const fallback = (parseFloat(v.prezzo_cliente)||parseFloat(v.prezzo_unitario)||0) * (parseFloat(v.quantita)||parseFloat(v.qt)||1)
      return s + (tc > 0 ? tc : fallback)
    }, 0)
  }
  const _pTotale = (p) => {
    if (p.totale > 0) return p.totale
    const sub = _pSubtotale(p)
    return sub * (1 + (p.iva_perc || 22) / 100)
  }

  return (
    <div className="space-y-3">
      <MiniRiepilogoLive cantiereId={cantiereId} />
      {canWrite && !showForm && (
        <div className="space-y-2">
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setShowForm(true)} className="btn-primary flex-1 flex items-center justify-center gap-2 min-w-[140px]">
              <Plus size={16} /> Nuovo Computo
            </button>
            <button onClick={() => { setShowPaste(v => !v); setPasteText('') }}
              className={`flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-medium border flex-shrink-0 transition-colors ${showPaste ? 'bg-green-100 border-green-400 text-green-800' : 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100'}`}>
              <ClipboardList size={13}/> Incolla da Excel
            </button>
            <a href="/api/v1/cantieri/template-computo"
              download className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 flex-shrink-0">
              <Download size={13} /> Template
            </a>
          </div>

          {showPaste && (
            <div className="card border-2 border-green-300 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-green-900 text-sm">Incolla righe da Excel</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    1. Apri il tuo Excel &nbsp;·&nbsp; 2. Seleziona le righe che vuoi (salta subtotali e alternative) &nbsp;·&nbsp; 3. Copia (Ctrl+C) &nbsp;·&nbsp; 4. Incolla qui sotto
                  </p>
                </div>
                <button onClick={() => setShowPaste(false)} className="text-gray-400 hover:text-gray-600 flex-shrink-0"><X size={16}/></button>
              </div>
              <textarea
                className="w-full h-36 text-xs font-mono border border-gray-200 rounded-lg p-2 resize-none focus:outline-none focus:ring-2 focus:ring-green-300"
                placeholder="Incolla qui il contenuto copiato da Excel (Ctrl+V)..."
                value={pasteText}
                onChange={e => setPasteText(e.target.value)}
                onPaste={e => { const t = e.clipboardData.getData('text'); setTimeout(() => onPasteRicevuto(t), 30) }}
              />
              <div className="flex gap-2">
                <button onClick={() => { setShowPaste(false); setPasteText('') }} className="btn-secondary flex-1 text-sm">Annulla</button>
                <button onClick={() => onPasteRicevuto(pasteText)} disabled={!pasteText.trim()}
                  className="btn-primary flex-1 text-sm disabled:opacity-50 flex items-center justify-center gap-1">
                  <ClipboardList size={14}/> Continua
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Mappatura colonne */}
      {pasteRighe && (
        <div className="card border-2 border-green-300 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold text-green-900">Assegna le colonne</p>
              <p className="text-xs text-gray-500 mt-0.5">Per ogni colonna scegli cosa contiene. Abbiamo suggerito in automatico — correggi se necessario.</p>
            </div>
            <button onClick={() => setPasteRighe(null)} className="text-gray-400 hover:text-gray-600"><X size={16}/></button>
          </div>

          {/* Tabella anteprima con dropdown per colonna */}
          <div className="overflow-x-auto border border-gray-200 rounded-xl">
            <table className="w-full text-xs">
              <thead className="bg-gray-50">
                <tr>
                  {Array.from({length: Math.max(...pasteRighe.slice(0,3).map(r=>r.length))}, (_,ci) => (
                    <th key={ci} className="p-1.5 text-center border-b border-gray-200 min-w-[100px]">
                      <select
                        value={colMap[ci] || 'ignora'}
                        onChange={e => setColMap(m => ({...m, [ci]: e.target.value}))}
                        className={`text-xs rounded px-1 py-0.5 border w-full font-semibold ${
                          colMap[ci]==='desc'   ? 'bg-blue-100 border-blue-300 text-blue-800' :
                          colMap[ci]==='tot'    ? 'bg-orange-100 border-orange-300 text-orange-800' :
                          colMap[ci]==='prezzo' ? 'bg-purple-100 border-purple-300 text-purple-800' :
                          colMap[ci]==='qt'     ? 'bg-green-100 border-green-300 text-green-800' :
                          colMap[ci]==='um'     ? 'bg-yellow-100 border-yellow-300 text-yellow-800' :
                          'bg-gray-100 border-gray-200 text-gray-400'
                        }`}>
                        <option value="ignora">— ignora</option>
                        <option value="desc">Descrizione</option>
                        <option value="um">U.M.</option>
                        <option value="qt">Quantità</option>
                        <option value="prezzo">Prezzo unit.</option>
                        <option value="tot">Totale</option>
                      </select>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pasteRighe.slice(0, 8).map((r, ri) => (
                  <tr key={ri} className={ri%2===0?'bg-white':'bg-gray-50/50'}>
                    {Array.from({length: Math.max(...pasteRighe.slice(0,3).map(x=>x.length))}, (_,ci) => (
                      <td key={ci} className={`p-1.5 border-t border-gray-100 max-w-[200px] truncate ${
                        colMap[ci]==='desc'   ? 'bg-blue-50' :
                        colMap[ci]==='tot'    ? 'bg-orange-50 text-right font-medium' :
                        colMap[ci]==='prezzo' ? 'bg-purple-50 text-right' :
                        colMap[ci]==='qt'     ? 'bg-green-50 text-right' :
                        colMap[ci]==='um'     ? 'bg-yellow-50 text-center' : 'text-gray-300'
                      }`} title={r[ci]||''}>
                        {r[ci] || ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pasteRighe.length > 8 && <p className="text-xs text-gray-400 text-center">Mostrate 8 di {pasteRighe.length} righe</p>}
          <div className="flex gap-2">
            <button onClick={() => setPasteRighe(null)} className="btn-secondary flex-1">Annulla</button>
            <button onClick={confermaMappatura}
              disabled={!Object.values(colMap).includes('desc')}
              className="btn-primary flex-1 flex items-center justify-center gap-1 disabled:opacity-50">
              <CheckCircle2 size={14}/> Importa {pasteRighe.length} righe
            </button>
          </div>
        </div>
      )}

      {/* Import con selezione righe */}
      {vociImportate && (
        <div className="card border-2 border-purple-300 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 flex-wrap">
              <Sparkles size={16} className="text-purple-600" />
              <h3 className="font-bold text-purple-900">{vociImportate.length} righe trovate</h3>
              {vociImportate.filter(v=>v.sospetta).length > 0 && (
                <span className="text-xs bg-yellow-100 text-yellow-800 rounded-full px-2 py-0.5 font-medium">
                  ⚠ {vociImportate.filter(v=>v.sospetta).length} sospette escluse
                </span>
              )}
            </div>
            <button onClick={() => { setVociImportate(null); setRigheSelezionate(null) }} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
          </div>
          <div className="flex items-center justify-between text-xs">
            <p className="text-purple-700 bg-purple-50 rounded-lg px-3 py-1.5">
              ✓ Selezionate: <strong>{righeSelezionate?.size || 0}</strong> righe &nbsp;·&nbsp;
              Totale selezionato: <strong className="text-steelex-orange">{fmt([...(righeSelezionate||[])].reduce((s,id)=>{const v=vociImportate.find(x=>x.id===id);return s+(v?.totale_cliente||v?.totale_costo||0)},0))}</strong>
            </p>
            <div className="flex gap-2">
              <button onClick={() => setRigheSelezionate(new Set(vociImportate.map(v=>v.id)))} className="text-purple-600 hover:underline">Tutte</button>
              <button onClick={() => setRigheSelezionate(new Set())} className="text-gray-400 hover:underline">Nessuna</button>
            </div>
          </div>
          <div className="max-h-96 overflow-y-auto border border-gray-200 rounded-lg">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="w-8 p-2 text-center"></th>
                  <th className="p-2 text-left font-semibold text-gray-600">Descrizione</th>
                  <th className="p-2 text-center font-semibold text-gray-600 w-16">U.M.</th>
                  <th className="p-2 text-right font-semibold text-gray-600 w-16">Qt</th>
                  <th className="p-2 text-right font-semibold text-gray-600 w-20">Prezzo</th>
                  <th className="p-2 text-right font-semibold text-gray-600 w-24">Totale</th>
                </tr>
              </thead>
              <tbody>
                {vociImportate.map((v) => {
                  const sel = righeSelezionate?.has(v.id)
                  const tot = v.totale_cliente || v.totale_costo || 0
                  const pr  = v.prezzo_cliente || v.prezzo_costo || 0
                  return (
                    <tr key={v.id}
                      onClick={() => setRigheSelezionate(prev => { const s=new Set(prev); sel?s.delete(v.id):s.add(v.id); return s })}
                      className={`border-t border-gray-100 cursor-pointer transition-colors ${
                        sel
                          ? v.sospetta ? 'bg-yellow-50 hover:bg-yellow-100' : 'bg-white hover:bg-orange-50'
                          : 'bg-gray-50 opacity-40 hover:opacity-60'
                      }`}>
                      <td className="p-2 text-center">
                        <input type="checkbox" readOnly checked={sel} className="accent-orange-500 w-4 h-4" />
                      </td>
                      <td className="p-2">
                        <div className="flex items-center gap-1.5 leading-tight">
                          <p className="font-medium text-gray-900">{v.descrizione || '—'}</p>
                          {v.sospetta && <span className="flex-shrink-0 text-[10px] font-semibold bg-yellow-200 text-yellow-800 rounded px-1 py-0.5">⚠ sospetta</span>}
                        </div>
                        <p className="text-gray-400 mt-0.5">{v.categoria}</p>
                      </td>
                      <td className="p-2 text-center text-gray-500">{v.um || '—'}</td>
                      <td className="p-2 text-right text-gray-700">{v.quantita ?? v.qt ?? '—'}</td>
                      <td className="p-2 text-right text-gray-700">{pr > 0 ? fmt(pr) : '—'}</td>
                      <td className="p-2 text-right font-semibold text-gray-900">{tot > 0 ? fmt(tot) : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={() => { setVociImportate(null); setRigheSelezionate(null) }} className="btn-secondary flex-1">Annulla</button>
            <button onClick={confermaImport} disabled={!righeSelezionate?.size}
              className="btn-primary flex-1 flex items-center justify-center gap-1 disabled:opacity-50">
              <CheckCircle2 size={14} /> Importa {righeSelezionate?.size || 0} voci
            </button>
          </div>
        </div>
      )}

      {showForm && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold">{editId ? 'Modifica Computo' : 'Nuovo Computo'}</h3>
            <button onClick={chiudi}><X size={16} /></button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input className="input-field" placeholder="Titolo computo (opzionale)" value={base.numero} onChange={e => setB('numero',e.target.value)} />
            <input type="date" className="input-field" value={base.data_preventivo} onChange={e => setB('data_preventivo',e.target.value)} />
            <div><label className="text-xs text-gray-500 block mb-1">IVA %</label>
              <input type="number" className="input-field" value={base.iva_perc} onChange={e => setB('iva_perc',e.target.value)} /></div>
            <div><label className="text-xs text-gray-500 block mb-1">Acconto %</label>
              <input type="number" className="input-field" value={base.acconto_perc} onChange={e => setB('acconto_perc',e.target.value)} /></div>
          </div>

          {/* Modalità inserimento */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Modalità inserimento voci</p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setModalita('costo')}
                className={`py-2.5 px-3 rounded-xl text-xs font-medium border-2 transition-colors text-left ${modalita==='costo' ? 'border-steelex-orange bg-orange-50 text-steelex-orange' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                <p className="font-bold">💰 Costo + ricarico</p>
                <p className="text-gray-400 font-normal mt-0.5">Inserisci i costi e applica il tuo margine</p>
              </button>
              <button onClick={() => setModalita('cliente')}
                className={`py-2.5 px-3 rounded-xl text-xs font-medium border-2 transition-colors text-left ${modalita==='cliente' ? 'border-steelex-orange bg-orange-50 text-steelex-orange' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                <p className="font-bold">📋 Prezzi cliente diretti</p>
                <p className="text-gray-400 font-normal mt-0.5">Inserisci i prezzi già concordati col cliente</p>
              </button>
            </div>

            {/* Pannello ricarico globale — solo in modalità costo */}
            {modalita === 'costo' && voci.length > 0 && (
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 flex items-end gap-2">
                <div className="flex-1">
                  <label className="text-xs font-semibold text-steelex-orange block mb-1">Ricarico globale %</label>
                  <input type="number" min="0" max="999" step="1" placeholder="es. 35"
                    className="input-field py-1.5 text-sm"
                    value={ricarico_globale}
                    onChange={e => setRicaricoGlobale(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && applicaRicaricoGlobale()} />
                </div>
                <button onClick={applicaRicaricoGlobale}
                  className="btn-primary py-1.5 px-4 text-sm flex-shrink-0 whitespace-nowrap">
                  Applica a tutte
                </button>
              </div>
            )}
          </div>

          {/* Griglia voci — stile spreadsheet */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Voci ({voci.length})</p>
              <div className="flex gap-3">
                <label className={`text-xs cursor-pointer flex items-center gap-1 px-3 py-1.5 rounded-lg border-2 font-medium transition-colors ${importando?'opacity-50 pointer-events-none':''} border-purple-300 text-purple-700 hover:bg-purple-50`}>
                  {importando ? <Loader2 size={12} className="animate-spin"/> : <Sparkles size={12}/>}
                  {importando ? 'Lettura...' : 'Importa da file'}
                  <input ref={importInputRef} type="file" accept=".xlsx,.xls,.csv,.pdf" className="hidden"
                    disabled={importando} onChange={e => e.target.files[0] && importaComputoAI(e.target.files[0])} />
                </label>
                <button onClick={aggiungiVoce} className="text-xs text-steelex-orange hover:underline flex items-center gap-1 font-medium"><Plus size={12}/> Aggiungi riga</button>
              </div>
            </div>

            {voci.length === 0 ? (
              <div className="border-2 border-dashed border-gray-200 rounded-xl py-8 text-center space-y-2">
                <p className="text-gray-400 text-sm">Nessuna voce</p>
                <div className="flex justify-center gap-3">
                  <button onClick={aggiungiVoce} className="btn-primary text-sm py-1.5 px-4 flex items-center gap-1"><Plus size={14}/> Aggiungi riga</button>
                  <label className="btn-secondary text-sm py-1.5 px-4 flex items-center gap-1 cursor-pointer">
                    <Sparkles size={14}/> Importa Excel / PDF
                    <input type="file" accept=".xlsx,.xls,.csv,.pdf" className="hidden"
                      onChange={e => e.target.files[0] && importaComputoAI(e.target.files[0])} />
                  </label>
                </div>
              </div>
            ) : (
              <div className="border border-gray-200 rounded-xl overflow-x-auto">
                <table className="w-full text-xs min-w-[700px]">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="p-2 text-left font-semibold text-gray-500 w-[30%]">Descrizione</th>
                      <th className="p-2 text-left font-semibold text-gray-500 w-[12%]">Categoria</th>
                      <th className="p-2 text-center font-semibold text-gray-500 w-[6%]">U.M.</th>
                      <th className="p-2 text-right font-semibold text-gray-500 w-[7%]">Qt</th>
                      {modalita === 'costo' ? <>
                        <th className="p-2 text-right font-semibold text-gray-500 w-[10%]">Costo €</th>
                        <th className="p-2 text-right font-semibold text-gray-500 w-[8%]">Ric. %</th>
                        <th className="p-2 text-right font-semibold text-gray-500 w-[10%]">Pr. cliente</th>
                      </> : <>
                        <th className="p-2 text-right font-semibold text-gray-500 w-[13%]">Prezzo cliente €</th>
                      </>}
                      <th className="p-2 text-right font-semibold text-steelex-orange w-[12%]">Totale €</th>
                      <th className="w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {voci.map((v, idx) => (
                      <tr key={v.id} className={`border-t border-gray-100 ${idx%2===0?'bg-white':'bg-gray-50/50'} hover:bg-orange-50/30 transition-colors`}>
                        <td className="p-1">
                          <input className="w-full bg-transparent border-0 outline-none text-xs text-gray-800 px-1 py-1 rounded hover:bg-white focus:bg-white focus:shadow-sm focus:ring-1 focus:ring-orange-300 transition-all"
                            placeholder="Descrizione voce..." value={v.descrizione}
                            onChange={e => aggiornaVoce(v.id,'descrizione',e.target.value)} />
                        </td>
                        <td className="p-1">
                          <select className="w-full bg-transparent border-0 outline-none text-xs text-gray-600 px-1 py-1 rounded hover:bg-white focus:bg-white focus:ring-1 focus:ring-orange-300"
                            value={v.categoria} onChange={e => aggiornaVoce(v.id,'categoria',e.target.value)}>
                            {CATEGORIE_VOCE.map(c=><option key={c}>{c}</option>)}
                          </select>
                        </td>
                        <td className="p-1">
                          <input className="w-full bg-transparent border-0 outline-none text-xs text-center text-gray-600 px-1 py-1 rounded hover:bg-white focus:bg-white focus:ring-1 focus:ring-orange-300"
                            placeholder="mq" value={v.um||''}
                            onChange={e => aggiornaVoce(v.id,'um',e.target.value)} />
                        </td>
                        <td className="p-1">
                          <input type="number" className="w-full bg-transparent border-0 outline-none text-xs text-right text-gray-700 px-1 py-1 rounded hover:bg-white focus:bg-white focus:ring-1 focus:ring-orange-300"
                            value={v.qt} onChange={e => aggiornaVoce(v.id,'qt',e.target.value)} />
                        </td>
                        {modalita === 'costo' ? <>
                          <td className="p-1">
                            <input type="number" className="w-full bg-transparent border-0 outline-none text-xs text-right text-gray-700 px-1 py-1 rounded hover:bg-white focus:bg-white focus:ring-1 focus:ring-orange-300"
                              value={v.costo_unitario} onChange={e => aggiornaVoce(v.id,'costo_unitario',e.target.value)} />
                          </td>
                          <td className="p-1">
                            <input type="number" className="w-full bg-transparent border-0 outline-none text-xs text-right text-gray-700 px-1 py-1 rounded hover:bg-white focus:bg-white focus:ring-1 focus:ring-orange-300"
                              value={v.ricarico_perc} onChange={e => aggiornaVoce(v.id,'ricarico_perc',e.target.value)} />
                          </td>
                          <td className="p-1 text-right pr-2 font-medium text-steelex-orange">
                            {(v.prezzo_unitario||0).toFixed(2)}
                          </td>
                        </> : <>
                          <td className="p-1">
                            <input type="number" className="w-full bg-transparent border-0 outline-none text-xs text-right text-gray-700 px-1 py-1 rounded hover:bg-white focus:bg-white focus:ring-1 focus:ring-orange-300"
                              value={v.prezzo_unitario||0} onChange={e => aggiornaVoce(v.id,'prezzo_unitario',e.target.value)} />
                          </td>
                        </>}
                        <td className="p-1 text-right pr-2 font-bold text-gray-800">
                          {fmt(v.totale_cliente)}
                        </td>
                        <td className="p-1 text-center">
                          <button onClick={() => setVoci(vv => vv.filter(x=>x.id!==v.id))}
                            className="text-gray-300 hover:text-red-500 transition-colors p-0.5">
                            <Trash2 size={13}/>
                          </button>
                        </td>
                      </tr>
                    ))}
                    {/* Riga aggiungi rapido */}
                    <tr className="border-t border-dashed border-gray-200 bg-gray-50/50">
                      <td colSpan={99} className="p-1.5">
                        <button onClick={aggiungiVoce}
                          className="w-full text-xs text-gray-400 hover:text-steelex-orange flex items-center gap-1 justify-center py-1 rounded hover:bg-orange-50 transition-colors">
                          <Plus size={12}/> Aggiungi riga
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Riepilogo */}
          {voci.length > 0 && (
            <div className="bg-gray-50 rounded-xl p-3 space-y-1 text-sm border-t">
              {modalita === 'costo' && <>
                <div className="flex justify-between text-gray-500"><span>Costo totale (riservato)</span><span>{fmt(costoTot)}</span></div>
                <div className="flex justify-between"><span>Margine</span><span className={margine>=0?'text-green-600 font-medium':'text-red-600'}>{fmt(margine)} ({costoTot>0?Math.round((margine/costoTot)*100):0}%)</span></div>
              </>}
              <div className="flex justify-between border-t pt-1 text-steelex-orange font-bold text-base"><span>TOTALE NETTO</span><span>{fmt(subtotale)}</span></div>
              <div className="flex justify-between text-gray-400 text-xs"><span>+ IVA {ivaPerc}%</span><span>{fmt(subtotale*ivaPerc/100)}</span></div>
              <div className="flex justify-between text-blue-600"><span>Acconto {base.acconto_perc}%</span><span>{fmt(acconto)}</span></div>
            </div>
          )}

          <textarea className="input-field h-12 resize-none text-sm" placeholder="Note..." value={base.note} onChange={e => setB('note',e.target.value)} />
          <div className="flex gap-2">
            <button onClick={chiudi} className="btn-secondary flex-1">Annulla</button>
            <button onClick={() => {
                const payload = {
                  ...base,
                  data_preventivo: base.data_preventivo || null,  // stringa vuota → null
                  iva_perc: base.iva_perc === '' ? 22 : (parseFloat(base.iva_perc) ?? 22),
                  acconto_perc: parseFloat(base.acconto_perc) || 30,
                  voci: voci.map(v => {
                    const qt  = parseFloat(v.qt) || 1
                    const cos = parseFloat(v.costo_unitario)  || 0
                    const cli = parseFloat(v.prezzo_unitario) || 0
                    const totCos = parseFloat(v.totale_costo)   || parseFloat((cos * qt).toFixed(2))
                    const totCli = parseFloat(v.totale_cliente) || parseFloat((cli * qt).toFixed(2))
                    return {
                      descrizione:    v.descrizione,
                      categoria:      v.categoria,
                      um:             v.um || 'cad',
                      quantita:       qt,
                      prezzo_costo:   cos,
                      ricarico_perc:  parseFloat(v.ricarico_perc) || 0,
                      prezzo_cliente: cli,
                      totale_costo:   totCos,
                      totale_cliente: totCli,
                    }
                  }),
                }
                saveMutation.mutate(payload)
              }}
              disabled={voci.length===0||saveMutation.isLoading} className="btn-primary flex-1">
              {saveMutation.isLoading ? 'Salvataggio...' : editId ? 'Aggiorna' : 'Crea Computo'}
            </button>
          </div>
        </div>
      )}

      {preventivi.length > 1 && !showForm && (
        <div className="bg-steelex-orange/10 rounded-xl px-4 py-3 flex justify-between items-center border border-steelex-orange/20">
          <span className="text-sm font-semibold text-gray-700">Totale tutti i computi</span>
          <div className="text-right">
            <p className="text-lg font-bold text-steelex-orange">{fmt(preventivi.reduce((s,p)=>s+_pSubtotale(p),0))}</p>
            <p className="text-xs text-gray-400">+ IVA: {fmt(preventivi.reduce((s,p)=>s+(_pTotale(p)-_pSubtotale(p)),0))}</p>
          </div>
        </div>
      )}
      {preventivi.length === 0 && !showForm ? (
        <div className="card text-center py-8 text-gray-400"><ClipboardList size={32} className="mx-auto mb-2 opacity-30" /><p>Nessun computo</p><p className="text-xs mt-1">Inserisci le voci di costo con il tuo ricarico per creare il preventivo cliente</p></div>
      ) : preventivi.map(p => (
        <div key={p.id} className="card space-y-2">
          <div className="flex items-start justify-between">
            <div><p className="font-bold">{p.numero || 'Computo'}</p>{p.data && <p className="text-xs text-gray-400">{fmtD(p.data)}</p>}</div>
            <div className="text-right"><p className="text-xl font-bold text-steelex-orange">{fmt(_pSubtotale(p))}</p><p className="text-xs text-gray-400">+ IVA {p.iva_perc}%: {fmt(_pTotale(p) - _pSubtotale(p))}</p></div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            {!isDL && <div><span className="text-gray-400 block">Costo base</span><span className="font-medium">{fmt(p.costo_totale)}</span></div>}
            {!isDL && <div><span className="text-gray-400 block">Margine</span><span className={`font-medium ${(_pSubtotale(p)-p.costo_totale)>=0?'text-green-600':'text-red-600'}`}>{fmt(_pSubtotale(p)-p.costo_totale)}</span></div>}
            <div><span className="text-gray-400 block">Acc. ricevuto</span><span className="font-medium text-blue-600">{fmt(p.acconto_ricevuto)}</span></div>
          </div>
          <div className="flex items-center justify-between gap-2">
            {canWrite ? (
              <select value={p.stato} onChange={e => updateMutation.mutate({id:p.id, data:{stato:e.target.value}})}
                className={`text-xs px-2 py-1 rounded-full font-medium border-0 cursor-pointer ${STATO_PREV[p.stato]?.bg||'bg-gray-100'}`}>
                {Object.entries(STATO_PREV).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            ) : <span className={`text-xs px-2 py-0.5 rounded-full ${STATO_PREV[p.stato]?.bg}`}>{STATO_PREV[p.stato]?.label}</span>}
            <div className="flex items-center gap-1">
              <button onClick={() => generaPdfPreventivo(p.id, p.numero||p.id)} title="Genera PDF preventivo" className="p-1 text-steelex-orange hover:text-orange-700"><Download size={14} /></button>
              {p.pdf_url && <a href={p.pdf_url} target="_blank" rel="noreferrer" className="p-1 text-blue-500"><ExternalLink size={14} /></a>}
              {canWrite && <>
                <label className="p-1 text-gray-400 hover:text-steelex-orange cursor-pointer" title="Allega PDF firmato">
                  <Upload size={14} />
                  <input type="file" accept=".pdf,.jpg,.png" className="hidden" onChange={e => e.target.files[0] && uploadPdf(p.id, e.target.files[0])} />
                </label>
                <button onClick={() => apriModifica(p)} className="p-1 text-gray-400 hover:text-steelex-orange"><Edit2 size={14} /></button>
                <button onClick={() => confirm('Eliminare?') && deleteMutation.mutate(p.id)} className="p-1 text-gray-300 hover:text-red-500"><Trash2 size={14} /></button>
              </>}
            </div>
          </div>
          {/* Registra acconto ricevuto */}
          {canWrite && p.stato==='accettato' && p.acconto_ricevuto < p.acconto_importo && (
            <div className="bg-blue-50 rounded-lg p-2 flex items-center justify-between">
              <span className="text-xs text-blue-600">Acconto da registrare: {fmt(p.acconto_importo - p.acconto_ricevuto)}</span>
              <button onClick={() => { const imp=prompt(`Importo acconto ricevuto:`); if(imp) updateMutation.mutate({id:p.id,data:{acconto_ricevuto:parseFloat(imp)||0,data_acconto:new Date().toISOString().split('T')[0]}}) }} className="text-xs btn-primary py-1 px-2">Registra</button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

/* ─── SPESE ─── */
function SpeseSection({ cantiereId, canWrite }) {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editSpesaId, setEditSpesaId] = useState(null)
  const [uploadingFor, setUploadingFor] = useState(null)
  const [analizzando, setAnalizzando] = useState(false)
  const [pinDaImportare, setPinDaImportare] = useState(null)
  const [importExcel, setImportExcel] = useState(null) // { righe, totale, errori, selezionate }
  const [importandoExcel, setImportandoExcel] = useState(false)
  const [form, setForm] = useState({ descrizione:'', fornitore:'', categoria:'materiali', importo:'', data:'', note:'' })
  const set = (k,v) => setForm(f => ({...f,[k]:v}))

  const apriModificaSpesa = (s) => {
    setEditSpesaId(s.id)
    setForm({ descrizione: s.descrizione, fornitore: s.fornitore||'', categoria: s.categoria||'materiali', importo: String(s.importo), data: s.data||'', note: s.note||'' })
    setShowForm(true)
  }
  const chiudiFormSpesa = () => { setShowForm(false); setEditSpesaId(null); setPinDaImportare(null); setForm({ descrizione:'', fornitore:'', categoria:'materiali', importo:'', data:'', note:'' }) }

  const analizzaFottura = async (file) => {
    setAnalizzando(true)
    try {
      const fd = new FormData(); fd.append('file', file)
      const r = await api.post(`/cantieri/${cantiereId}/spese/import-foto`, fd, { headers: {'Content-Type':'multipart/form-data'} })
      const d = r.data
      setForm({
        descrizione: d.descrizione || '',
        fornitore: d.fornitore || '',
        categoria: d.categoria || 'materiali',
        importo: d.importo_totale ? String(d.importo_totale) : '',
        data: d.data || '',
        note: [
          d.numero_documento ? `${d.tipo_documento || 'Doc'} n° ${d.numero_documento}` : null,
          d.importo_netto ? `Imponibile: €${d.importo_netto} (IVA ${d.iva_perc || 22}%)` : null,
          d.note || null,
        ].filter(Boolean).join(' — ') || '',
      })
      setShowForm(true)
      toast.success('Claude ha compilato il form — controlla e conferma!')
    } catch(e) {
      toast.error(e.response?.data?.detail || 'Errore analisi foto')
    } finally { setAnalizzando(false) }
  }

  const caricaExcelSpese = async (file) => {
    setImportandoExcel(true)
    try {
      const fd = new FormData(); fd.append('file', file)
      const r = await api.post(`/cantieri/${cantiereId}/spese/import-excel`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      const selezionate = new Set(r.data.righe.map((_,i) => i))
      setImportExcel({ ...r.data, selezionate })
      if (r.data.errori?.length) toast(`${r.data.righe.length} righe lette, ${r.data.errori.length} errori`, { icon: '⚠️' })
      else toast.success(`${r.data.righe.length} righe pronte — controlla e conferma`)
    } catch(e) {
      toast.error(e.response?.data?.detail || 'Errore lettura Excel')
    } finally { setImportandoExcel(false) }
  }

  const confermaImportExcel = async () => {
    if (!importExcel) return
    setImportandoExcel(true)
    try {
      const selezionate = importExcel.righe.filter((_,i) => importExcel.selezionate.has(i))
      await api.post(`/cantieri/${cantiereId}/spese/import-excel/conferma`, selezionate)
      toast.success(`${selezionate.length} spese importate!`)
      qc.invalidateQueries(['spese', cantiereId])
      qc.invalidateQueries(['economia', cantiereId])
      setImportExcel(null)
    } catch(e) {
      toast.error(e.response?.data?.detail || 'Errore import')
    } finally { setImportandoExcel(false) }
  }

  const { data: spese = [], isLoading } = useQuery(['spese', cantiereId], () => api.get(`/cantieri/${cantiereId}/spese`).then(r => r.data), { staleTime: 0 })
  const { data: extraPin = [] } = useQuery(['extra-preventivo', cantiereId], () => api.get(`/cantieri/${cantiereId}/extra-preventivo`).then(r => r.data), { staleTime: 0 })
  const { data: preventivi = [] } = useQuery(['preventivi', cantiereId], () => api.get(`/cantieri/${cantiereId}/preventivi`).then(r => r.data), { staleTime: 60000 })
  const extraDaImportare = extraPin.filter(p => !p.importato_in_spese)

  const [pinComputoOpts, setPinComputoOpts] = useState({})
  const getPinOpt = (pinId) => pinComputoOpts[pinId] || { aggiungiComputo: preventivi.length > 0, prevId: preventivi[0]?.id || null }
  const setPinOpt = (pinId, k, v) => setPinComputoOpts(o => ({ ...o, [pinId]: { ...getPinOpt(pinId), [k]: v } }))

  const totale = spese.reduce((s,sp) => s+sp.importo, 0)

  const createMutation = useMutation(
    d => api.post(`/cantieri/${cantiereId}/spese`, d),
    { onSuccess: () => { qc.invalidateQueries(['spese',cantiereId]); qc.invalidateQueries(['economia',cantiereId]); chiudiFormSpesa(); toast.success('Spesa registrata!') },
      onError: e => toast.error(e.response?.data?.detail||'Errore') }
  )
  const updateSpesaMutation = useMutation(
    ({id, d}) => api.put(`/cantieri/${cantiereId}/spese/${id}`, d),
    { onSuccess: () => { qc.invalidateQueries(['spese',cantiereId]); qc.invalidateQueries(['economia',cantiereId]); chiudiFormSpesa(); toast.success('Spesa aggiornata!') },
      onError: e => toast.error(e.response?.data?.detail||'Errore') }
  )
  const deleteMutation = useMutation(
    id => api.delete(`/cantieri/${cantiereId}/spese/${id}`),
    { onSuccess: () => { qc.invalidateQueries(['spese',cantiereId]); qc.invalidateQueries(['economia',cantiereId]); toast.success('Eliminata') } }
  )
  const importaPinMutation = useMutation(
    async ({ pin, spesaPayload, aggiungiComputo, prevId, ricarico }) => {
      await api.post(`/cantieri/${cantiereId}/spese`, spesaPayload)
      if (aggiungiComputo && prevId) {
        await api.post(`/cantieri/${cantiereId}/preventivi/${prevId}/voce-extra`, {
          descrizione: pin.nota || spesaPayload.descrizione,
          importo: spesaPayload.importo || 0,
          categoria: spesaPayload.categoria || 'Altro',
          ricarico_perc: ricarico || 0,
        })
      }
      await api.put(`/cantieri/${cantiereId}/documenti/${pin.doc_id}/pin/${pin.id}/importato`)
    },
    { onSuccess: (_, vars) => {
        qc.invalidateQueries(['spese', cantiereId])
        qc.invalidateQueries(['extra-preventivo', cantiereId])
        qc.invalidateQueries(['economia', cantiereId])
        if (vars.aggiungiComputo && vars.prevId) qc.invalidateQueries(['preventivi', cantiereId])
        toast.success(vars.aggiungiComputo && vars.prevId ? 'Importato in Spese e Computo!' : 'Voce importata nelle spese!')
      },
      onError: e => toast.error(e.response?.data?.detail || 'Errore importazione')
    }
  )
  const salvaSpesa = async () => {
    const payload = {...form, importo: parseFloat(form.importo)||0, data: form.data||null}
    if (editSpesaId) {
      updateSpesaMutation.mutate({id: editSpesaId, d: payload})
    } else {
      try {
        await api.post(`/cantieri/${cantiereId}/spese`, payload)
        if (pinDaImportare) {
          const opt = getPinOpt(pinDaImportare.id)
          if (opt.aggiungiComputo && opt.prevId) {
            await api.post(`/cantieri/${cantiereId}/preventivi/${opt.prevId}/voce-extra`, {
              descrizione: pinDaImportare.nota || payload.descrizione,
              importo: payload.importo,
              categoria: payload.categoria || 'Altro',
              ricarico_perc: opt.ricarico || 0,
            })
            qc.invalidateQueries(['preventivi', cantiereId])
          }
          await api.put(`/cantieri/${cantiereId}/documenti/${pinDaImportare.doc_id}/pin/${pinDaImportare.id}/importato`)
          qc.invalidateQueries(['extra-preventivo', cantiereId])
        }
        qc.invalidateQueries(['spese', cantiereId])
        qc.invalidateQueries(['economia', cantiereId])
        chiudiFormSpesa()
        const opt2 = pinDaImportare ? getPinOpt(pinDaImportare.id) : null
        toast.success(opt2?.aggiungiComputo && opt2?.prevId ? 'Importato in Spese e Computo!' : 'Spesa registrata!')
      } catch(e) { toast.error(e.response?.data?.detail||'Errore') }
    }
  }
  const uploadAllegato = async (spesaId, file) => {
    setUploadingFor(spesaId)
    try {
      const fd = new FormData(); fd.append('file', file)
      await api.post(`/cantieri/${cantiereId}/spese/${spesaId}/allegato`, fd, { headers: {'Content-Type':'multipart/form-data'} })
      qc.invalidateQueries(['spese',cantiereId]); toast.success('Allegato caricato!')
    } catch { toast.error('Errore upload')
    } finally { setUploadingFor(null) }
  }

  if (isLoading) return <div className="text-center py-8 text-gray-400">Caricamento...</div>

  return (
    <div className="space-y-3">
      <MiniRiepilogoLive cantiereId={cantiereId} />
      {spese.length > 0 && (
        <div className="card flex items-center justify-between">
          <div><p className="text-xs text-gray-400">Totale spese registrate</p><p className="text-xl font-bold text-gray-900">{fmt(totale)}</p></div>
          <Receipt size={24} className="text-gray-300" />
        </div>
      )}

      {canWrite && (
        <div className="flex gap-2">
          <button onClick={() => setShowForm(!showForm)} className="btn-primary flex-1 flex items-center justify-center gap-2">
            <Plus size={16} /> Registra Spesa
          </button>
          <label className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors cursor-pointer flex-shrink-0 ${analizzando ? 'bg-purple-100 text-purple-400' : 'bg-purple-600 text-white hover:bg-purple-700'}`}
            title="Scatta foto o carica screenshot di fattura/bolla — Claude compila il form automaticamente">
            {analizzando ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
            {analizzando ? 'Analisi...' : 'Foto AI'}
            <input type="file" accept="image/*,.pdf" className="hidden"
              disabled={analizzando}
              onChange={e => e.target.files[0] && analizzaFottura(e.target.files[0])} />
          </label>
          <label className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors cursor-pointer flex-shrink-0 ${importandoExcel ? 'bg-green-100 text-green-400' : 'bg-green-600 text-white hover:bg-green-700'}`}
            title="Importa più spese da un file Excel (colonne: Data, Descrizione, Fornitore, Categoria, Importo, Note)">
            {importandoExcel ? <Loader2 size={15} className="animate-spin" /> : <Table size={15} />}
            {importandoExcel ? 'Lettura...' : 'Excel'}
            <input type="file" accept=".xlsx,.xls,.ods" className="hidden"
              disabled={importandoExcel}
              onChange={e => e.target.files[0] && caricaExcelSpese(e.target.files[0])} />
          </label>
        </div>
      )}

      {/* Preview import Excel */}
      {importExcel && (
        <div className="card border-2 border-green-300 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-sm text-green-800">
                <Table size={14} className="inline mr-1" />
                Import Excel — {importExcel.righe.length} righe trovate
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Totale selezionato: <strong>{fmt(importExcel.righe.filter((_,i)=>importExcel.selezionate.has(i)).reduce((s,r)=>s+r.importo,0))}</strong>
                {' · '}selezionate {importExcel.selezionate.size}/{importExcel.righe.length}
              </p>
            </div>
            <button onClick={() => setImportExcel(null)} className="text-gray-300 hover:text-gray-500"><X size={16}/></button>
          </div>

          {importExcel.errori?.length > 0 && (
            <div className="bg-yellow-50 rounded-lg p-2 text-xs text-yellow-700 space-y-0.5">
              {importExcel.errori.map((e,i) => <p key={i}>⚠️ {e}</p>)}
            </div>
          )}

          <div className="overflow-x-auto rounded-lg border border-gray-100">
            <table className="w-full text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-2 py-1.5 text-left w-6">
                    <input type="checkbox"
                      checked={importExcel.selezionate.size === importExcel.righe.length}
                      onChange={e => setImportExcel(prev => ({
                        ...prev,
                        selezionate: e.target.checked ? new Set(prev.righe.map((_,i)=>i)) : new Set()
                      }))} />
                  </th>
                  <th className="px-2 py-1.5 text-left text-gray-500">Data</th>
                  <th className="px-2 py-1.5 text-left text-gray-500">Descrizione</th>
                  <th className="px-2 py-1.5 text-left text-gray-500">Fornitore</th>
                  <th className="px-2 py-1.5 text-left text-gray-500">Cat.</th>
                  <th className="px-2 py-1.5 text-right text-gray-500">Importo</th>
                </tr>
              </thead>
              <tbody>
                {importExcel.righe.map((r, i) => (
                  <tr key={i} className={`border-t border-gray-50 ${!importExcel.selezionate.has(i) ? 'opacity-40' : ''}`}>
                    <td className="px-2 py-1">
                      <input type="checkbox" checked={importExcel.selezionate.has(i)}
                        onChange={e => setImportExcel(prev => {
                          const s = new Set(prev.selezionate)
                          e.target.checked ? s.add(i) : s.delete(i)
                          return { ...prev, selezionate: s }
                        })} />
                    </td>
                    <td className="px-2 py-1 text-gray-500 whitespace-nowrap">{r.data ? r.data.split('-').reverse().join('/') : '—'}</td>
                    <td className="px-2 py-1 text-gray-900 max-w-[160px] truncate">{r.descrizione}</td>
                    <td className="px-2 py-1 text-gray-500 max-w-[100px] truncate">{r.fornitore || '—'}</td>
                    <td className="px-2 py-1">
                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${CAT_COLORI[r.categoria] || 'bg-gray-100 text-gray-500'}`}>{r.categoria}</span>
                    </td>
                    <td className="px-2 py-1 text-right font-bold text-gray-900 whitespace-nowrap">{fmt(r.importo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-2">
            <button onClick={confermaImportExcel} disabled={importandoExcel || importExcel.selezionate.size === 0}
              className="btn-primary flex items-center gap-2 flex-1 justify-center">
              {importandoExcel ? <Loader2 size={14} className="animate-spin"/> : <CheckCircle2 size={14}/>}
              Importa {importExcel.selezionate.size} spese
            </button>
            <button onClick={() => setImportExcel(null)} className="px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
              Annulla
            </button>
          </div>
        </div>
      )}

      {/* Voci extra preventivo da mappa non ancora importate */}
      {extraDaImportare.length > 0 && (
        <div className="card border-2 border-orange-300 space-y-2">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="text-orange-500 flex-shrink-0" />
            <h3 className="font-bold text-sm text-orange-800">Extra Preventivo da Mappa</h3>
            <span className="ml-auto bg-orange-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{extraDaImportare.length}</span>
          </div>
          <p className="text-xs text-orange-700">Questi pin sono stati segnalati sulla mappa ma non ancora registrati nelle spese.</p>
          {extraDaImportare.map(pin => (
            <div key={pin.id} className="bg-orange-50 rounded-xl p-3 space-y-2 border border-orange-200">
              <div className="flex items-start gap-2">
                <MapPin size={14} className="text-orange-500 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 line-clamp-2">{pin.nota}</p>
                  <div className="flex gap-2 text-xs text-gray-500 mt-0.5 flex-wrap">
                    <span>📄 {pin.doc_nome}</span>
                    <span>👤 {pin.autore}</span>
                    {pin.creato_il && <span>{fmtD(pin.creato_il)}</span>}
                  </div>
                </div>
                {pin.importo != null && (
                  <span className="text-sm font-bold text-orange-700 flex-shrink-0">{fmt(pin.importo)}</span>
                )}
              </div>
              {/* Opzioni computo */}
              {preventivi.length > 0 && (() => {
                const opt = getPinOpt(pin.id)
                return (
                  <div className="border-t border-orange-200 pt-2 space-y-1.5">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={opt.aggiungiComputo}
                        onChange={e => setPinOpt(pin.id, 'aggiungiComputo', e.target.checked)}
                        className="accent-orange-500" />
                      <span className="text-xs font-medium text-gray-700">Aggiungi voce anche al Computo</span>
                    </label>
                    {opt.aggiungiComputo && (
                      <div className="flex gap-2">
                        <select className="input-field text-xs flex-1"
                          value={opt.prevId || ''}
                          onChange={e => setPinOpt(pin.id, 'prevId', parseInt(e.target.value))}>
                          {preventivi.map(p => (
                            <option key={p.id} value={p.id}>
                              {p.numero ? `Prev. ${p.numero}` : `Preventivo #${p.id}`} — {p.stato}
                            </option>
                          ))}
                        </select>
                        <div className="flex items-center gap-1">
                          <input type="number" min="0" step="1" placeholder="Ric.%" className="input-field text-xs w-20"
                            value={opt.ricarico || ''}
                            onChange={e => setPinOpt(pin.id, 'ricarico', parseFloat(e.target.value)||0)}
                            title="Ricarico % sul costo" />
                          <span className="text-xs text-gray-400">%</span>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })()}
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    set('descrizione', pin.nota || '')
                    set('importo', pin.importo != null ? String(pin.importo) : '')
                    set('data', pin.creato_il ? pin.creato_il.slice(0,10) : dayjs().format('YYYY-MM-DD'))
                    set('note', `Da pin su "${pin.doc_nome}"`)
                    set('categoria', 'altro')
                    setEditSpesaId(null)
                    setShowForm(true)
                    setPinDaImportare(pin)
                  }}
                  className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg bg-orange-500 text-white text-xs font-medium hover:bg-orange-600 active:scale-95 transition-all">
                  <Plus size={13} /> Compila e Importa
                </button>
                <button
                  onClick={() => {
                    const opt = getPinOpt(pin.id)
                    importaPinMutation.mutate({
                      pin,
                      spesaPayload: { descrizione: pin.nota || 'Extra preventivo', importo: pin.importo || 0, data: pin.creato_il ? pin.creato_il.slice(0,10) : null, categoria: 'altro', note: `Da pin su "${pin.doc_nome}"` },
                      aggiungiComputo: opt.aggiungiComputo,
                      prevId: opt.prevId,
                      ricarico: opt.ricarico || 0,
                    })
                  }}
                  disabled={importaPinMutation.isLoading}
                  className="px-3 py-2 rounded-lg bg-gray-700 text-white text-xs font-medium hover:bg-gray-800 active:scale-95 transition-all"
                  title="Importa subito con i valori del pin">
                  ↗ Importa diretto
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="card space-y-3">
          <div className="flex items-center justify-between"><h3 className="font-bold">{editSpesaId ? 'Modifica Spesa' : 'Nuova Spesa'}</h3><button onClick={chiudiFormSpesa}><X size={16} /></button></div>
          {pinDaImportare && (() => {
            const opt = getPinOpt(pinDaImportare.id)
            return (
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2 text-xs text-orange-700">
                  <MapPin size={12} /><span>Pre-compilato da pin su mappa — verifica importo e categoria prima di salvare</span>
                </div>
                {preventivi.length > 0 && (
                  <div className="space-y-1.5 pt-1 border-t border-orange-200">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={opt.aggiungiComputo}
                        onChange={e => setPinOpt(pinDaImportare.id, 'aggiungiComputo', e.target.checked)}
                        className="accent-orange-500" />
                      <span className="text-xs font-medium text-gray-700">Aggiungi voce anche al Computo</span>
                    </label>
                    {opt.aggiungiComputo && (
                      <div className="flex gap-2">
                        <select className="input-field text-xs flex-1"
                          value={opt.prevId || ''}
                          onChange={e => setPinOpt(pinDaImportare.id, 'prevId', parseInt(e.target.value))}>
                          {preventivi.map(p => (
                            <option key={p.id} value={p.id}>
                              {p.numero ? `Prev. ${p.numero}` : `Preventivo #${p.id}`} — {p.stato}
                            </option>
                          ))}
                        </select>
                        <div className="flex items-center gap-1">
                          <input type="number" min="0" step="1" placeholder="Ric.%" className="input-field text-xs w-20"
                            value={opt.ricarico || ''}
                            onChange={e => setPinOpt(pinDaImportare.id, 'ricarico', parseFloat(e.target.value)||0)} />
                          <span className="text-xs text-gray-400">%</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })()}
          {!pinDaImportare && form.descrizione && (
            <div className="flex items-center gap-2 bg-purple-50 border border-purple-200 rounded-lg p-2 text-xs text-purple-700">
              <Sparkles size={12} /><span>Dati pre-compilati da Claude — verifica prima di salvare</span>
            </div>
          )}
          <input className="input-field" placeholder="Descrizione *" value={form.descrizione} onChange={e => set('descrizione',e.target.value)} autoFocus />
          <div className="grid grid-cols-2 gap-2">
            <input className="input-field" placeholder="Fornitore" value={form.fornitore} onChange={e => set('fornitore',e.target.value)} />
            <select className="input-field" value={form.categoria} onChange={e => set('categoria',e.target.value)}>
              {CATEGORIE.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase()+c.slice(1)}</option>)}
            </select>
            <input type="number" className="input-field" placeholder="Importo € *" value={form.importo} onChange={e => set('importo',e.target.value)} />
            <input type="date" className="input-field" value={form.data} onChange={e => set('data',e.target.value)} />
          </div>
          <textarea className="input-field h-12 resize-none text-sm" placeholder="Note..." value={form.note} onChange={e => set('note',e.target.value)} />
          <div className="flex gap-2">
            <button onClick={chiudiFormSpesa} className="btn-secondary flex-1">Annulla</button>
            <button onClick={salvaSpesa}
              disabled={!form.descrizione||!form.importo||(createMutation.isLoading||updateSpesaMutation.isLoading)} className="btn-primary flex-1">
              {(createMutation.isLoading||updateSpesaMutation.isLoading) ? 'Salvataggio...' : editSpesaId ? 'Aggiorna' : 'Registra'}
            </button>
          </div>
        </div>
      )}

      {spese.length === 0 && !showForm ? (
        <div className="card text-center py-8 text-gray-400"><Receipt size={32} className="mx-auto mb-2 opacity-30" /><p>Nessuna spesa registrata</p><p className="text-xs mt-1">Registra le spese man mano che le sostieni — allega foto della bolla o PDF della fattura</p></div>
      ) : spese.map(s => (
        <div key={s.id} className="card space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 truncate">{s.descrizione}</p>
              <div className="flex gap-2 text-xs text-gray-400 flex-wrap">
                {s.fornitore && <span>{s.fornitore}</span>}
                {s.data && <span>{fmtD(s.data)}</span>}
                {s.note && <span className="italic">{s.note}</span>}
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <div className="text-right">
                <p className="font-bold text-gray-900">{fmt(s.importo)}</p>
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${CAT_COLORI[s.categoria]||CAT_COLORI.altro}`}>{s.categoria}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {s.allegato_url && (
              <a href={s.allegato_url} target="_blank" rel="noreferrer"
                className="text-xs text-blue-500 hover:underline flex items-center gap-1">
                {s.allegato_tipo === 'pdf' ? <FileText size={12} /> : <Camera size={12} />}
                {s.allegato_tipo === 'pdf' ? 'PDF allegato' : 'Foto allegata'}
              </a>
            )}
            {canWrite && (
              <div className="ml-auto flex gap-1">
                <label className={`p-1 text-gray-400 hover:text-steelex-orange cursor-pointer ${uploadingFor===s.id?'opacity-50':''}`} title="Allega foto o PDF">
                  {uploadingFor===s.id ? <span className="text-xs">...</span> : <Camera size={14} />}
                  <input type="file" accept="image/*,.pdf" className="hidden"
                    onChange={e => e.target.files[0] && uploadAllegato(s.id, e.target.files[0])} disabled={uploadingFor===s.id} />
                </label>
                <label className="p-1 text-gray-400 hover:text-steelex-orange cursor-pointer" title="Allega PDF">
                  <FileText size={14} />
                  <input type="file" accept=".pdf" className="hidden" onChange={e => e.target.files[0] && uploadAllegato(s.id, e.target.files[0])} />
                </label>
                <button onClick={() => apriModificaSpesa(s)} className="p-1 text-gray-400 hover:text-steelex-orange"><Edit2 size={14} /></button>
                <button onClick={() => confirm('Eliminare?') && deleteMutation.mutate(s.id)} className="p-1 text-gray-300 hover:text-red-500"><Trash2 size={14} /></button>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

/* ─── SAL ─── */
function SALSection({ cantiereId, canWrite, isDL = false }) {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ titolo:'', percentuale:'', importo:'', data:'', note:'' })
  const set = (k,v) => setForm(f => ({...f,[k]:v}))

  const { data: salList = [], isLoading } = useQuery(['sal', cantiereId], () => api.get(`/cantieri/${cantiereId}/sal`).then(r => r.data), { staleTime: 0 })

  const totEmesso = salList.filter(s=>s.stato!=='bozza').reduce((t,s)=>t+s.importo,0)

  const createMutation = useMutation(
    d => api.post(`/cantieri/${cantiereId}/sal`, d),
    { onSuccess: () => { qc.invalidateQueries(['sal',cantiereId]); qc.invalidateQueries(['economia',cantiereId]); setShowForm(false); toast.success('SAL creato!') },
      onError: e => toast.error(e.response?.data?.detail||'Errore') }
  )
  const updateMutation = useMutation(
    ({id,data}) => api.put(`/cantieri/${cantiereId}/sal/${id}`, data),
    { onSuccess: () => { qc.invalidateQueries(['sal',cantiereId]); qc.invalidateQueries(['economia',cantiereId]); toast.success('Aggiornato') } }
  )
  const deleteMutation = useMutation(
    id => api.delete(`/cantieri/${cantiereId}/sal/${id}`),
    { onSuccess: () => { qc.invalidateQueries(['sal',cantiereId]); qc.invalidateQueries(['economia',cantiereId]); toast.success('Eliminato') } }
  )

  if (isLoading) return <div className="text-center py-8 text-gray-400">Caricamento...</div>

  return (
    <div className="space-y-3">
      <MiniRiepilogoLive cantiereId={cantiereId} />
      {salList.length > 0 && (
        <div className="card flex items-center justify-between">
          <div><p className="text-xs text-gray-400">Totale SAL emessi</p><p className="text-xl font-bold text-steelex-orange">{fmt(totEmesso)}</p></div>
          <TrendingUp size={24} className="text-steelex-orange opacity-40" />
        </div>
      )}

      {canWrite && (
        <button onClick={() => setShowForm(!showForm)} className="btn-primary w-full flex items-center justify-center gap-2">
          <Plus size={16} /> Nuovo SAL
        </button>
      )}

      {showForm && (
        <div className="card space-y-3">
          <div className="flex items-center justify-between"><h3 className="font-bold">Nuovo SAL #{salList.length+1}</h3><button onClick={() => setShowForm(false)}><X size={16} /></button></div>
          <input className="input-field" placeholder="Titolo SAL *" value={form.titolo} onChange={e => set('titolo',e.target.value)} autoFocus />
          <div className="grid grid-cols-2 gap-2">
            <div><label className="text-xs text-gray-500 block mb-1">% Avanzamento</label><input type="number" min="0" max="100" className="input-field" placeholder="es. 30" value={form.percentuale} onChange={e => set('percentuale',e.target.value)} /></div>
            <div><label className="text-xs text-gray-500 block mb-1">Importo €</label><input type="number" className="input-field" placeholder="0.00" value={form.importo} onChange={e => set('importo',e.target.value)} /></div>
          </div>
          <input type="date" className="input-field" value={form.data} onChange={e => set('data',e.target.value)} />
          <textarea className="input-field h-12 resize-none text-sm" placeholder="Note..." value={form.note} onChange={e => set('note',e.target.value)} />
          <div className="flex gap-2">
            <button onClick={() => setShowForm(false)} className="btn-secondary flex-1">Annulla</button>
            <button onClick={() => createMutation.mutate({...form, percentuale:parseFloat(form.percentuale)||0, importo:parseFloat(form.importo)||0, data:form.data||null})}
              disabled={!form.titolo||!form.importo||createMutation.isLoading} className="btn-primary flex-1">
              {createMutation.isLoading ? 'Salvataggio...' : 'Crea SAL'}
            </button>
          </div>
        </div>
      )}

      {salList.length === 0 && !showForm ? (
        <div className="card text-center py-8 text-gray-400"><TrendingUp size={32} className="mx-auto mb-2 opacity-30" /><p>Nessun SAL</p><p className="text-xs mt-1">Crea un SAL per fatturare al cliente ogni volta che raggiungi una milestone</p></div>
      ) : salList.map(s => (
        <div key={s.id} className="card space-y-2">
          <div className="flex items-start justify-between">
            <div><div className="flex items-center gap-2"><span className="text-xs font-bold text-gray-400">SAL #{s.numero}</span>{s.data && <span className="text-xs text-gray-400">{fmtD(s.data)}</span>}</div>
              <p className="font-semibold text-gray-900">{s.titolo}</p>
              {s.percentuale>0 && <p className="text-xs text-gray-400">{s.percentuale}% avanzamento</p>}
            </div>
            <p className="font-bold text-steelex-orange text-lg">{fmt(s.importo)}</p>
          </div>
          <div className="flex items-center justify-between">
            {canWrite ? (
              <select value={s.stato} onChange={e => updateMutation.mutate({id:s.id,data:{stato:e.target.value}})}
                className={`text-xs px-2 py-1 rounded-full font-medium border-0 cursor-pointer ${STATO_SAL[s.stato]?.bg||'bg-gray-100'}`}>
                {Object.entries(STATO_SAL).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            ) : <span className={`text-xs px-2 py-0.5 rounded-full ${STATO_SAL[s.stato]?.bg}`}>{STATO_SAL[s.stato]?.label}</span>}
            {canWrite && <button onClick={() => confirm('Eliminare?') && deleteMutation.mutate(s.id)} className="p-1 text-gray-300 hover:text-red-500"><Trash2 size={14} /></button>}
          </div>
        </div>
      ))}
    </div>
  )
}

/* ─── ORE EXTRA ─── */
function OreExtraSection({ cantiereId, canWrite }) {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState({ operaio_nome:'', ore:'', attivita:'', tariffa_oraria:'', data:'', note:'' })
  const set = (k,v) => setForm(f => ({...f,[k]:v}))

  const startEdit = (o) => {
    setEditId(o.id)
    setForm({ operaio_nome: o.operaio_nome||'', ore: o.ore||'', attivita: o.attivita||'', tariffa_oraria: o.tariffa_oraria||'', data: o.data||'', note: o.note||'' })
    setShowForm(false)
  }
  const cancelEdit = () => { setEditId(null); setForm({ operaio_nome:'', ore:'', attivita:'', tariffa_oraria:'', data:'', note:'' }) }

  const { data: oreList = [], isLoading } = useQuery(
    ['ore-extra', cantiereId],
    () => api.get(`/cantieri/${cantiereId}/ore-extra`).then(r => r.data),
    { staleTime: 0 }
  )

  const totaleOre = oreList.reduce((s,o) => s + o.ore, 0)
  const totaleCosto = oreList.filter(o => o.approvato).reduce((s,o) => s + o.totale, 0)

  const createMutation = useMutation(
    d => api.post(`/cantieri/${cantiereId}/ore-extra`, d),
    { onSuccess: () => { qc.invalidateQueries(['ore-extra',cantiereId]); setShowForm(false); setForm({operaio_nome:'',ore:'',attivita:'',tariffa_oraria:'',data:'',note:''}); toast.success('Ore registrate!') },
      onError: e => toast.error(e.response?.data?.detail||'Errore') }
  )
  const updateMutation = useMutation(
    ({id,data}) => api.put(`/cantieri/${cantiereId}/ore-extra/${id}`, data),
    { onSuccess: () => { qc.invalidateQueries(['ore-extra',cantiereId]); toast.success('Aggiornato') } }
  )
  const deleteMutation = useMutation(
    id => api.delete(`/cantieri/${cantiereId}/ore-extra/${id}`),
    { onSuccess: () => { qc.invalidateQueries(['ore-extra',cantiereId]); toast.success('Eliminato') } }
  )

  const convertiInSpesa = async (ore) => {
    try {
      await api.post(`/cantieri/${cantiereId}/spese`, {
        descrizione: `Ore extra — ${ore.operaio_nome}${ore.attivita ? `: ${ore.attivita}` : ''}`,
        categoria: 'manodopera',
        fornitore: ore.operaio_nome,
        importo: ore.totale,
        data: ore.data,
        note: `${ore.ore}h × €${ore.tariffa_oraria}/h`,
      })
      await api.put(`/cantieri/${cantiereId}/ore-extra/${ore.id}`, { approvato: true })
      qc.invalidateQueries(['ore-extra',cantiereId]); qc.invalidateQueries(['spese',cantiereId]); qc.invalidateQueries(['economia',cantiereId])
      toast.success('Registrato nelle spese!')
    } catch(e) { toast.error(e.response?.data?.detail||'Errore') }
  }

  if (isLoading) return <div className="text-center py-8 text-gray-400">Caricamento...</div>

  return (
    <div className="space-y-3">
      <MiniRiepilogoLive cantiereId={cantiereId} />

      {oreList.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <div className="card text-center">
            <p className="text-xs text-gray-400">Ore totali</p>
            <p className="text-xl font-bold text-steelex-orange">{totaleOre.toFixed(1)}h</p>
          </div>
          <div className="card text-center">
            <p className="text-xs text-gray-400">Costo approvato</p>
            <p className="text-xl font-bold text-gray-900">{fmt(totaleCosto)}</p>
          </div>
        </div>
      )}

      {canWrite && (
        <button onClick={() => setShowForm(!showForm)} className="btn-primary w-full flex items-center justify-center gap-2">
          <Plus size={16} /> Registra ore extra
        </button>
      )}

      {showForm && (
        <div className="card space-y-3">
          <div className="flex items-center justify-between"><h3 className="font-bold">Nuove Ore Extra</h3><button onClick={() => setShowForm(false)}><X size={16}/></button></div>
          <input className="input-field" placeholder="Nome operaio *" value={form.operaio_nome} onChange={e => set('operaio_nome',e.target.value)} autoFocus />
          <div className="grid grid-cols-2 gap-2">
            <div><label className="text-xs text-gray-500 block mb-1">Ore *</label>
              <input type="number" step="0.5" min="0" className="input-field" placeholder="es. 3.5" value={form.ore} onChange={e => set('ore',e.target.value)} /></div>
            <div><label className="text-xs text-gray-500 block mb-1">Tariffa €/h</label>
              <input type="number" className="input-field" placeholder="es. 28" value={form.tariffa_oraria} onChange={e => set('tariffa_oraria',e.target.value)} /></div>
          </div>
          <input className="input-field" placeholder="Attività svolta" value={form.attivita} onChange={e => set('attivita',e.target.value)} />
          <input type="date" className="input-field" value={form.data} onChange={e => set('data',e.target.value)} />
          {form.ore && form.tariffa_oraria && (
            <p className="text-sm text-center text-steelex-orange font-semibold">
              Totale: {fmt(parseFloat(form.ore||0) * parseFloat(form.tariffa_oraria||0))}
            </p>
          )}
          <div className="flex gap-2">
            <button onClick={() => setShowForm(false)} className="btn-secondary flex-1">Annulla</button>
            <button onClick={() => createMutation.mutate({...form, ore:parseFloat(form.ore)||0, tariffa_oraria:parseFloat(form.tariffa_oraria)||0, data:form.data||null})}
              disabled={!form.operaio_nome||!form.ore} className="btn-primary flex-1">Registra</button>
          </div>
        </div>
      )}

      {oreList.length === 0 && !showForm ? (
        <div className="card text-center py-8 text-gray-400">
          <Clock size={32} className="mx-auto mb-2 opacity-30" />
          <p>Nessuna ora extra registrata</p>
          <p className="text-xs mt-1">Le ore vengono aggiunte automaticamente dalle note vocali nel Diario</p>
        </div>
      ) : oreList.map(o => (
        <div key={o.id} className={`card space-y-1.5 ${o.approvato ? 'opacity-60' : ''}`}>
          {editId === o.id ? (
            /* ── Form modifica inline ── */
            <div className="space-y-2">
              <div className="flex items-center justify-between"><p className="font-bold text-sm">Modifica ore</p><button onClick={cancelEdit}><X size={14}/></button></div>
              <input className="input-field" placeholder="Nome operaio *" value={form.operaio_nome} onChange={e => set('operaio_nome',e.target.value)} />
              <div className="grid grid-cols-2 gap-2">
                <div><label className="text-xs text-gray-500 block mb-1">Ore</label>
                  <input type="number" step="0.5" min="0" className="input-field" value={form.ore} onChange={e => set('ore',e.target.value)} /></div>
                <div><label className="text-xs text-gray-500 block mb-1">Tariffa €/h</label>
                  <input type="number" className="input-field" value={form.tariffa_oraria} onChange={e => set('tariffa_oraria',e.target.value)} /></div>
              </div>
              <input className="input-field" placeholder="Attività svolta" value={form.attivita} onChange={e => set('attivita',e.target.value)} />
              <input type="date" className="input-field" value={form.data} onChange={e => set('data',e.target.value)} />
              {form.ore && form.tariffa_oraria && (
                <p className="text-sm text-center text-steelex-orange font-semibold">Totale: {fmt(parseFloat(form.ore||0)*parseFloat(form.tariffa_oraria||0))}</p>
              )}
              <div className="flex gap-2">
                <button onClick={cancelEdit} className="btn-secondary flex-1">Annulla</button>
                <button onClick={() => updateMutation.mutate({ id: o.id, data: {...form, ore: parseFloat(form.ore)||0, tariffa_oraria: parseFloat(form.tariffa_oraria)||0, data: form.data||null }}, { onSuccess: cancelEdit })}
                  disabled={!form.operaio_nome||!form.ore} className="btn-primary flex-1">Salva</button>
              </div>
            </div>
          ) : (
            /* ── Vista normale ── */
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <UserCheck size={14} className="text-steelex-orange flex-shrink-0" />
                  <p className="font-semibold text-gray-900">{o.operaio_nome}</p>
                  {o.approvato && <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">✓ In spese</span>}
                </div>
                <p className="text-xs text-gray-400 mt-0.5">
                  {o.ore}h {o.tariffa_oraria > 0 ? `× €${o.tariffa_oraria}/h` : ''} {o.data ? `— ${fmtD(o.data)}` : ''}
                </p>
                {o.attivita && <p className="text-xs text-gray-600 italic">{o.attivita}</p>}
              </div>
              <div className="text-right flex-shrink-0">
                {o.totale > 0 && <p className="font-bold text-gray-900">{fmt(o.totale)}</p>}
                <div className="flex gap-1 mt-1 justify-end">
                  {!o.approvato && canWrite && (
                    <button onClick={() => convertiInSpesa(o)}
                      className="text-xs px-2 py-1 bg-steelex-orange text-white rounded-lg hover:bg-orange-600 font-medium whitespace-nowrap">
                      → Spesa
                    </button>
                  )}
                  {canWrite && <button onClick={() => startEdit(o)} className="p-1 text-gray-300 hover:text-blue-500"><Pencil size={13}/></button>}
                  {canWrite && <button onClick={() => confirm('Eliminare?') && deleteMutation.mutate(o.id)} className="p-1 text-gray-300 hover:text-red-500"><Trash2 size={13}/></button>}
                </div>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

/* ─── ORDINI ACQUISTO ─── */
function OrdiniSection({ cantiereId, canWrite }) {
  const qc = useQueryClient()
  const vuotoOrdine = { fornitore_nome: '', descrizione: '', categoria: 'materiali', importo: '', iva_perc: '22', data_ordine: '', data_consegna_prevista: '', note: '', stato: 'bozza' }
  const [form, setForm] = useState(vuotoOrdine)
  const [editId, setEditId] = useState(null)
  const [apriForm, setApriForm] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const { data: ordini = [], isLoading } = useQuery(['ordini', cantiereId], () => api.get(`/cantieri/${cantiereId}/ordini`).then(r => r.data), { staleTime: 0 })

  const crea = useMutation(body => api.post(`/cantieri/${cantiereId}/ordini`, body), {
    onSuccess: () => { qc.invalidateQueries(['ordini', cantiereId]); setApriForm(false); setEditId(null); setForm(vuotoOrdine); toast.success('Ordine creato') }
  })
  const aggiorna = useMutation(({ id, body }) => api.put(`/cantieri/${cantiereId}/ordini/${id}`, body), {
    onSuccess: () => { qc.invalidateQueries(['ordini', cantiereId]); setApriForm(false); setEditId(null); setForm(vuotoOrdine); toast.success('Ordine aggiornato') }
  })
  const cambiaStato = useMutation(({ id, stato }) => api.patch(`/cantieri/${cantiereId}/ordini/${id}/stato?stato=${stato}`), {
    onSuccess: () => { qc.invalidateQueries(['ordini', cantiereId]) }
  })
  const elimina = useMutation(id => api.delete(`/cantieri/${cantiereId}/ordini/${id}`), {
    onSuccess: () => { qc.invalidateQueries(['ordini', cantiereId]); toast.success('Ordine eliminato') }
  })

  const salva = () => {
    const body = { ...form, importo: parseFloat(form.importo) || 0, iva_perc: parseFloat(form.iva_perc) || 22, data_ordine: form.data_ordine || undefined, data_consegna_prevista: form.data_consegna_prevista || undefined }
    if (!body.fornitore_nome || !body.descrizione || !body.importo) { toast.error('Fornitore, descrizione e importo obbligatori'); return }
    editId ? aggiorna.mutate({ id: editId, body }) : crea.mutate(body)
  }

  const apriModifica = (o) => {
    setEditId(o.id)
    setForm({ fornitore_nome: o.fornitore_nome, descrizione: o.descrizione, categoria: o.categoria, importo: String(o.importo), iva_perc: String(o.iva_perc || 22), data_ordine: o.data_ordine || '', data_consegna_prevista: o.data_consegna_prevista || '', note: o.note || '', stato: o.stato })
    setApriForm(true)
  }

  const totaleOrdini = ordini.reduce((s, o) => s + (o.importo_totale || 0), 0)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-400">Totale ordinato (IVA incl.)</p>
          <p className="text-xl font-bold text-gray-900">{fmt(totaleOrdini)}</p>
        </div>
        {canWrite && (
          <button onClick={() => { setApriForm(!apriForm); setEditId(null); setForm(vuotoOrdine) }} className="btn-primary flex items-center gap-2">
            <Plus size={15}/> Nuovo Ordine
          </button>
        )}
      </div>

      {apriForm && (
        <div className="card space-y-3 border-2 border-steelex-orange/30">
          <h3 className="font-bold text-sm text-gray-800">{editId ? 'Modifica Ordine' : 'Nuovo Ordine Acquisto'}</h3>
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2"><label className="label-field">Fornitore *</label><input className="input-field" value={form.fornitore_nome} onChange={e => set('fornitore_nome', e.target.value)} placeholder="Nome fornitore"/></div>
            <div className="col-span-2"><label className="label-field">Descrizione *</label><input className="input-field" value={form.descrizione} onChange={e => set('descrizione', e.target.value)} placeholder="Cosa si ordina"/></div>
            <div><label className="label-field">Categoria</label>
              <select className="input-field" value={form.categoria} onChange={e => set('categoria', e.target.value)}>
                {CATEGORIE.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div><label className="label-field">Stato</label>
              <select className="input-field" value={form.stato} onChange={e => set('stato', e.target.value)}>
                {Object.entries(STATI_ORDINE).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div><label className="label-field">Importo netto (€) *</label><input type="number" className="input-field" value={form.importo} onChange={e => set('importo', e.target.value)} placeholder="0.00"/></div>
            <div><label className="label-field">IVA %</label><input type="number" className="input-field" value={form.iva_perc} onChange={e => set('iva_perc', e.target.value)} placeholder="22"/></div>
            <div><label className="label-field">Data ordine</label><input type="date" className="input-field" value={form.data_ordine} onChange={e => set('data_ordine', e.target.value)}/></div>
            <div><label className="label-field">Consegna prevista</label><input type="date" className="input-field" value={form.data_consegna_prevista} onChange={e => set('data_consegna_prevista', e.target.value)}/></div>
            <div className="col-span-2"><label className="label-field">Note</label><textarea className="input-field resize-none" rows={2} value={form.note} onChange={e => set('note', e.target.value)}/></div>
          </div>
          <div className="flex gap-2">
            <button onClick={salva} className="btn-primary flex-1">{editId ? 'Aggiorna' : 'Crea Ordine'}</button>
            <button onClick={() => { setApriForm(false); setEditId(null); setForm(vuotoOrdine) }} className="px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600">Annulla</button>
          </div>
        </div>
      )}

      {isLoading ? <div className="text-center py-8 text-gray-400">Caricamento...</div> : ordini.length === 0 ? (
        <div className="card text-center py-10 text-gray-400">
          <ShoppingCart size={32} className="mx-auto mb-2 opacity-30"/>
          <p className="font-medium">Nessun ordine registrato</p>
          <p className="text-xs mt-1">Traccia gli ordini ai fornitori per questo cantiere</p>
        </div>
      ) : (
        <div className="space-y-2">
          {ordini.map(o => {
            const statoInfo = STATI_ORDINE[o.stato] || STATI_ORDINE.bozza
            return (
              <div key={o.id} className="card space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-gray-900 truncate">{o.descrizione}</p>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ${statoInfo.bg}`}>{statoInfo.label}</span>
                      {o.categoria && <span className={`text-[10px] px-2 py-0.5 rounded-full ${CAT_COLORI[o.categoria] || 'bg-gray-100 text-gray-500'}`}>{o.categoria}</span>}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{o.fornitore_nome}</p>
                    <div className="flex gap-3 text-xs text-gray-400 mt-1 flex-wrap">
                      {o.data_ordine && <span>📅 {fmtD(o.data_ordine)}</span>}
                      {o.data_consegna_prevista && <span>🚚 Consegna: {fmtD(o.data_consegna_prevista)}</span>}
                    </div>
                    {o.note && <p className="text-xs text-gray-500 italic mt-1">{o.note}</p>}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-bold text-gray-900">{fmt(o.importo_totale)}</p>
                    <p className="text-[10px] text-gray-400">netto {fmt(o.importo)} + IVA {o.iva_perc}%</p>
                  </div>
                </div>
                {canWrite && (
                  <div className="flex items-center gap-2 border-t border-gray-50 pt-2">
                    <select className="text-xs border border-gray-200 rounded-lg px-2 py-1 flex-1"
                      value={o.stato}
                      onChange={e => cambiaStato.mutate({ id: o.id, stato: e.target.value })}>
                      {Object.entries(STATI_ORDINE).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                    <button onClick={() => apriModifica(o)} className="p-1 text-gray-300 hover:text-blue-500"><Edit2 size={14}/></button>
                    <button onClick={() => confirm('Eliminare ordine?') && elimina.mutate(o.id)} className="p-1 text-gray-300 hover:text-red-500"><Trash2 size={14}/></button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ─── BOLLE DDT ─── */
function BolleSection({ cantiereId, canWrite }) {
  const qc = useQueryClient()
  const vuotoBolla = { fornitore_nome: '', numero_bolla: '', data: '', importo_stimato: '', descrizione: '', ordine_id: '', note: '' }
  const [form, setForm] = useState(vuotoBolla)
  const [editId, setEditId] = useState(null)
  const [apriForm, setApriForm] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const { data: bolle = [], isLoading } = useQuery(['bolle', cantiereId], () => api.get(`/cantieri/${cantiereId}/bolle`).then(r => r.data), { staleTime: 0 })
  const { data: ordini = [] } = useQuery(['ordini', cantiereId], () => api.get(`/cantieri/${cantiereId}/ordini`).then(r => r.data), { staleTime: 60000 })

  const crea = useMutation(body => api.post(`/cantieri/${cantiereId}/bolle`, body), {
    onSuccess: () => { qc.invalidateQueries(['bolle', cantiereId]); setApriForm(false); setEditId(null); setForm(vuotoBolla); toast.success('Bolla registrata') }
  })
  const aggiorna = useMutation(({ id, body }) => api.put(`/cantieri/${cantiereId}/bolle/${id}`, body), {
    onSuccess: () => { qc.invalidateQueries(['bolle', cantiereId]); setApriForm(false); setEditId(null); setForm(vuotoBolla); toast.success('Bolla aggiornata') }
  })
  const elimina = useMutation(id => api.delete(`/cantieri/${cantiereId}/bolle/${id}`), {
    onSuccess: () => { qc.invalidateQueries(['bolle', cantiereId]); toast.success('Bolla eliminata') }
  })
  const uploadFoto = async (bollaId, file) => {
    const fd = new FormData(); fd.append('file', file)
    try {
      await api.post(`/cantieri/${cantiereId}/bolle/${bollaId}/foto`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      qc.invalidateQueries(['bolle', cantiereId]); toast.success('Foto caricata')
    } catch { toast.error('Errore upload foto') }
  }

  const salva = () => {
    const body = {
      fornitore_nome: form.fornitore_nome, numero_bolla: form.numero_bolla || undefined,
      data: form.data || undefined, importo_stimato: form.importo_stimato ? parseFloat(form.importo_stimato) : undefined,
      descrizione: form.descrizione || undefined, ordine_id: form.ordine_id ? parseInt(form.ordine_id) : undefined,
      note: form.note || undefined,
    }
    if (!body.fornitore_nome) { toast.error('Fornitore obbligatorio'); return }
    editId ? aggiorna.mutate({ id: editId, body }) : crea.mutate(body)
  }

  const apriModifica = (b) => {
    setEditId(b.id)
    setForm({ fornitore_nome: b.fornitore_nome, numero_bolla: b.numero_bolla || '', data: b.data || '', importo_stimato: b.importo_stimato ? String(b.importo_stimato) : '', descrizione: b.descrizione || '', ordine_id: b.ordine_id ? String(b.ordine_id) : '', note: b.note || '' })
    setApriForm(true)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-400">{bolle.length} bolle di consegna registrate</p>
          <p className="text-xl font-bold text-gray-900">{bolle.filter(b => b.stato === 'aperta').length} aperte · {bolle.filter(b => b.stato === 'fatturata').length} fatturate</p>
        </div>
        {canWrite && (
          <button onClick={() => { setApriForm(!apriForm); setEditId(null); setForm(vuotoBolla) }} className="btn-primary flex items-center gap-2">
            <Plus size={15}/> Nuova DDT
          </button>
        )}
      </div>

      {apriForm && (
        <div className="card space-y-3 border-2 border-steelex-orange/30">
          <h3 className="font-bold text-sm text-gray-800">{editId ? 'Modifica DDT' : 'Nuova Bolla di Consegna'}</h3>
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2"><label className="label-field">Fornitore *</label><input className="input-field" value={form.fornitore_nome} onChange={e => set('fornitore_nome', e.target.value)} placeholder="Nome fornitore"/></div>
            <div><label className="label-field">N° Bolla / DDT</label><input className="input-field" value={form.numero_bolla} onChange={e => set('numero_bolla', e.target.value)} placeholder="es. DDT-2025-001"/></div>
            <div><label className="label-field">Data consegna</label><input type="date" className="input-field" value={form.data} onChange={e => set('data', e.target.value)}/></div>
            <div><label className="label-field">Importo stimato (€)</label><input type="number" className="input-field" value={form.importo_stimato} onChange={e => set('importo_stimato', e.target.value)} placeholder="0.00"/></div>
            <div><label className="label-field">Collega a Ordine</label>
              <select className="input-field" value={form.ordine_id} onChange={e => set('ordine_id', e.target.value)}>
                <option value="">— nessun ordine —</option>
                {ordini.map(o => <option key={o.id} value={o.id}>{o.fornitore_nome} — {o.descrizione.slice(0,30)}</option>)}
              </select>
            </div>
            <div className="col-span-2"><label className="label-field">Descrizione materiali consegnati</label><textarea className="input-field resize-none" rows={2} value={form.descrizione} onChange={e => set('descrizione', e.target.value)} placeholder="es. Lastre cartongesso 12.5mm — 80 pz"/></div>
            <div className="col-span-2"><label className="label-field">Note</label><input className="input-field" value={form.note} onChange={e => set('note', e.target.value)}/></div>
          </div>
          <div className="flex gap-2">
            <button onClick={salva} className="btn-primary flex-1">{editId ? 'Aggiorna' : 'Registra DDT'}</button>
            <button onClick={() => { setApriForm(false); setEditId(null); setForm(vuotoBolla) }} className="px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600">Annulla</button>
          </div>
        </div>
      )}

      {isLoading ? <div className="text-center py-8 text-gray-400">Caricamento...</div> : bolle.length === 0 ? (
        <div className="card text-center py-10 text-gray-400">
          <Package size={32} className="mx-auto mb-2 opacity-30"/>
          <p className="font-medium">Nessuna bolla di consegna</p>
          <p className="text-xs mt-1">Registra le DDT ricevute dai fornitori</p>
        </div>
      ) : (
        <div className="space-y-2">
          {bolle.map(b => {
            const ordine = ordini.find(o => o.id === b.ordine_id)
            return (
              <div key={b.id} className="card space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-gray-900">{b.fornitore_nome}</p>
                      {b.numero_bolla && <span className="text-xs text-gray-500 font-mono">{b.numero_bolla}</span>}
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ${b.stato === 'aperta' ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}`}>
                        {b.stato === 'aperta' ? '📦 Aperta' : '✓ Fatturata'}
                      </span>
                    </div>
                    {b.descrizione && <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">{b.descrizione}</p>}
                    <div className="flex gap-3 text-xs text-gray-400 mt-1 flex-wrap">
                      {b.data && <span>📅 {fmtD(b.data)}</span>}
                      {ordine && <span>🔗 Ordine: {ordine.fornitore_nome}</span>}
                    </div>
                    {b.note && <p className="text-xs text-gray-400 italic">{b.note}</p>}
                  </div>
                  <div className="text-right flex-shrink-0">
                    {b.importo_stimato && <p className="font-bold text-gray-900">{fmt(b.importo_stimato)}</p>}
                    {b.foto_url && (
                      <a href={b.foto_url} target="_blank" rel="noreferrer" className="text-[10px] text-blue-500 flex items-center gap-0.5 justify-end mt-1">
                        <Camera size={10}/> Foto
                      </a>
                    )}
                  </div>
                </div>
                {canWrite && (
                  <div className="flex items-center gap-2 border-t border-gray-50 pt-2">
                    <label className="text-xs px-2 py-1 bg-gray-100 rounded-lg cursor-pointer hover:bg-gray-200 flex items-center gap-1 flex-shrink-0">
                      <Camera size={12}/> Foto DDT
                      <input type="file" accept="image/*,.pdf" className="hidden" onChange={e => e.target.files[0] && uploadFoto(b.id, e.target.files[0])}/>
                    </label>
                    <div className="flex-1"/>
                    <button onClick={() => apriModifica(b)} className="p-1 text-gray-300 hover:text-blue-500"><Edit2 size={14}/></button>
                    <button onClick={() => confirm('Eliminare DDT?') && elimina.mutate(b.id)} className="p-1 text-gray-300 hover:text-red-500"><Trash2 size={14}/></button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ─── FATTURE FORNITORI ─── */
function FattureSection({ cantiereId, canWrite }) {
  const qc = useQueryClient()
  const { utente } = useAuth()
  const [form, setForm] = useState({ fornitore_nome: '', numero_fattura: '', descrizione: '', importo_netto: '', iva_perc: '22', data_fattura: '', data_scadenza: '' })
  const [apriForm, setApriForm] = useState(false)

  const { data: fatture = [], isLoading } = useQuery(
    ['fatture', cantiereId],
    () => api.get(`/cantieri/${cantiereId}/fatture`).then(r => r.data),
    { staleTime: 0 }
  )
  const crea = useMutation(body => api.post(`/cantieri/${cantiereId}/fatture`, body), {
    onSuccess: () => { qc.invalidateQueries(['fatture', cantiereId]); setApriForm(false); toast.success('Fattura aggiunta') }
  })
  const autorizza = useMutation(id => api.post(`/cantieri/${cantiereId}/fatture/${id}/autorizza`), {
    onSuccess: () => { qc.invalidateQueries(['fatture', cantiereId]); toast.success('Fattura autorizzata') }
  })
  const elimina = useMutation(id => api.delete(`/cantieri/${cantiereId}/fatture/${id}`), {
    onSuccess: () => { qc.invalidateQueries(['fatture', cantiereId]); toast.success('Fattura eliminata') }
  })
  const puoAutorizzare = ['admin','capo_cantiere','direzione_lavori','amministrazione'].includes(utente?.ruolo)
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-orange-600 font-bold">{fatture.filter(f=>!f.autorizzata).length > 0 ? `⏳ ${fatture.filter(f=>!f.autorizzata).length} da autorizzare` : `${fatture.length} fatture`}</span>
        {canWrite && <button onClick={()=>setApriForm(!apriForm)} className="flex items-center gap-1 px-3 py-2 bg-steelex-orange text-white rounded-lg text-sm font-medium"><Plus size={14}/> Nuova fattura</button>}
      </div>
      {apriForm && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-gray-500 mb-1 block">Fornitore *</label><input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.fornitore_nome} onChange={e=>setForm(f=>({...f,fornitore_nome:e.target.value}))} /></div>
            <div><label className="text-xs text-gray-500 mb-1 block">N° fattura</label><input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.numero_fattura} onChange={e=>setForm(f=>({...f,numero_fattura:e.target.value}))} /></div>
            <div><label className="text-xs text-gray-500 mb-1 block">Imponibile €</label><input type="number" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.importo_netto} onChange={e=>setForm(f=>({...f,importo_netto:e.target.value}))} /></div>
            <div><label className="text-xs text-gray-500 mb-1 block">IVA %</label><input type="number" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.iva_perc} onChange={e=>setForm(f=>({...f,iva_perc:e.target.value}))} /></div>
            <div><label className="text-xs text-gray-500 mb-1 block">Data fattura</label><input type="date" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.data_fattura} onChange={e=>setForm(f=>({...f,data_fattura:e.target.value}))} /></div>
            <div><label className="text-xs text-gray-500 mb-1 block">Scadenza pagamento</label><input type="date" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.data_scadenza} onChange={e=>setForm(f=>({...f,data_scadenza:e.target.value}))} /></div>
          </div>
          <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Descrizione (opzionale)" value={form.descrizione} onChange={e=>setForm(f=>({...f,descrizione:e.target.value}))} />
          <div className="flex gap-2">
            <button onClick={()=>setApriForm(false)} className="flex-1 px-3 py-2 border rounded-lg text-sm">Annulla</button>
            <button onClick={()=>crea.mutate({...form,importo_netto:parseFloat(form.importo_netto)||0,iva_perc:parseFloat(form.iva_perc)||22,data_fattura:form.data_fattura||null,data_scadenza:form.data_scadenza||null})}
              disabled={!form.fornitore_nome||!form.importo_netto}
              className="flex-1 px-3 py-2 bg-steelex-orange text-white rounded-lg text-sm font-medium disabled:opacity-50">Aggiungi</button>
          </div>
        </div>
      )}
      {isLoading && <div className="text-center py-4 text-gray-400">Caricamento...</div>}
      {!isLoading && fatture.length === 0 && !apriForm && (
        <div className="text-center py-8 text-gray-400"><FileText size={32} className="mx-auto mb-2 opacity-30"/><p>Nessuna fattura fornitore</p></div>
      )}
      {fatture.map(f => (
        <div key={f.id} className={`rounded-xl border p-3 space-y-1 ${f.autorizzata ? 'border-green-300 bg-green-50' : 'border-orange-300 bg-orange-50'}`}>
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 truncate">{f.fornitore_nome}</p>
              {f.numero_fattura && <p className="text-xs text-gray-500">N° {f.numero_fattura}</p>}
              {f.descrizione && <p className="text-xs text-gray-600 italic">{f.descrizione}</p>}
              <div className="flex gap-2 text-xs text-gray-400 mt-0.5">
                {f.data_fattura && <span>{f.data_fattura}</span>}
                {f.data_scadenza && <span>scad. {f.data_scadenza}</span>}
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="font-bold text-gray-900">{fmt(f.importo_totale||f.importo_netto)}</p>
              <p className="text-xs text-gray-400">IVA {f.iva_perc}%</p>
            </div>
          </div>
          <div className="flex items-center justify-between pt-1">
            {f.autorizzata ? (
              <span className="text-xs text-green-700 font-medium">✓ Autorizzata {f.autorizzata_da_nome ? `da ${f.autorizzata_da_nome}` : ''}</span>
            ) : puoAutorizzare ? (
              <button onClick={()=>autorizza.mutate(f.id)} className="text-xs px-3 py-1 bg-green-600 text-white rounded-lg font-medium">Autorizza</button>
            ) : (
              <span className="text-xs text-orange-600 font-medium">⏳ In attesa autorizzazione</span>
            )}
            {canWrite && <button onClick={()=>confirm('Eliminare fattura?')&&elimina.mutate(f.id)} className="p-1 text-gray-300 hover:text-red-500"><Trash2 size={13}/></button>}
          </div>
        </div>
      ))}
    </div>
  )
}
