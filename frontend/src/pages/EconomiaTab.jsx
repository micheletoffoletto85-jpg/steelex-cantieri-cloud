import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { Euro, TrendingUp, TrendingDown, ShoppingCart, FileText, BarChart2, Plus, Trash2, X, Upload, ExternalLink, Camera, ClipboardList, Package } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../lib/api'
import { useAuth } from '../lib/auth'
import dayjs from 'dayjs'

const fmt = (n) => `€ ${(n || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtDate = (d) => d ? dayjs(d).format('DD/MM/YYYY') : '—'

const STATO_ORDINE = {
  bozza:      { label: 'Bozza',      bg: 'bg-gray-100 text-gray-600' },
  inviato:    { label: 'Inviato',    bg: 'bg-blue-100 text-blue-700' },
  confermato: { label: 'Confermato', bg: 'bg-yellow-100 text-yellow-700' },
  evaso:      { label: 'Evaso',      bg: 'bg-green-100 text-green-700' },
  annullato:  { label: 'Annullato',  bg: 'bg-red-100 text-red-700' },
}
const STATO_FATTURA = {
  ricevuta:   { label: 'Ricevuta',   bg: 'bg-gray-100 text-gray-600' },
  da_pagare:  { label: 'Da Pagare',  bg: 'bg-red-100 text-red-700' },
  pagata:     { label: 'Pagata',     bg: 'bg-green-100 text-green-700' },
  contestata: { label: 'Contestata', bg: 'bg-orange-100 text-orange-700' },
}
const STATO_SAL = {
  bozza:   { label: 'Bozza',   bg: 'bg-gray-100 text-gray-600' },
  emesso:  { label: 'Emesso',  bg: 'bg-blue-100 text-blue-700' },
  pagato:  { label: 'Pagato',  bg: 'bg-green-100 text-green-700' },
}
const CATEGORIE = ['materiali', 'manodopera', 'nolo', 'servizi', 'altro']

const SEZIONI = [
  ['overview',    'Panoramica', BarChart2],
  ['preventivo',  'Preventivo', ClipboardList],
  ['bolle',       'Bolle/DDT',  Package],
  ['fatture',     'Fatture',    FileText],
  ['sal',         'SAL',        TrendingUp],
]

export default function EconomiaTab({ cantiereId }) {
  const { utente } = useAuth()
  const [sezione, setSezione] = useState('overview')
  const canWrite = ['admin', 'capo_cantiere'].includes(utente?.ruolo)

  return (
    <div className="space-y-3">
      {/* Sotto-navigazione — scroll orizzontale su mobile */}
      <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1">
        {SEZIONI.map(([k,l,Icon]) => (
          <button key={k} onClick={() => setSezione(k)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0 ${sezione===k ? 'bg-steelex-orange text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            <Icon size={12} />{l}
          </button>
        ))}
      </div>

      {sezione === 'overview'   && <OverviewSection    cantiereId={cantiereId} />}
      {sezione === 'preventivo' && <PreventivoSection  cantiereId={cantiereId} canWrite={canWrite} />}
      {sezione === 'bolle'      && <BolleSection       cantiereId={cantiereId} canWrite={canWrite} />}
      {sezione === 'fatture'    && <FattureSection     cantiereId={cantiereId} canWrite={canWrite} />}
      {sezione === 'sal'        && <SALSection         cantiereId={cantiereId} canWrite={canWrite} />}
    </div>
  )
}

/* ─── OVERVIEW ─── */
function OverviewSection({ cantiereId }) {
  const { data: ov, isLoading } = useQuery(['economia', cantiereId], () => api.get(`/cantieri/${cantiereId}/economia`).then(r => r.data), { staleTime: 0 })
  const { data: preventivi = [] } = useQuery(['preventivi', cantiereId], () => api.get(`/cantieri/${cantiereId}/preventivi`).then(r => r.data), { staleTime: 0 })

  if (isLoading) return <div className="text-center py-8 text-gray-400">Caricamento...</div>
  if (!ov) return null

  const prevAccettato = preventivi.find(p => p.stato === 'accettato')
  const percSpesa = ov.budget > 0 ? Math.min((ov.spesa_reale / ov.budget) * 100, 100) : 0
  const percFatturato = ov.budget > 0 ? Math.min((ov.fatturato / ov.budget) * 100, 100) : 0

  return (
    <div className="space-y-3">
      {/* Alert preventivo mancante */}
      {!prevAccettato && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-xs text-yellow-700">
          ⚠️ Nessun preventivo accettato — il budget mostrato è quello del cantiere. Vai su <strong>Preventivo</strong> per creare il preventivo cliente.
        </div>
      )}

      {prevAccettato && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-xs text-green-700">
          ✅ Preventivo #{prevAccettato.numero || prevAccettato.id} accettato — {fmt(prevAccettato.totale)} (acconto ricevuto: {fmt(prevAccettato.acconto_ricevuto)})
        </div>
      )}

      {/* Cards */}
      <div className="grid grid-cols-2 gap-3">
        <EcoCard label="Valore Lavoro" value={fmt(ov.budget)} icon={Euro} color="orange" sub={prevAccettato ? 'da preventivo' : 'da budget'} />
        <EcoCard label="Costi Sostenuti" value={fmt(ov.spesa_reale)} icon={TrendingDown} color="red"
          sub={ov.budget > 0 ? `${Math.round(percSpesa)}% del valore` : null} />
        <EcoCard label="Fatturato Cliente" value={fmt(ov.fatturato)} icon={TrendingUp} color="blue"
          sub={ov.budget > 0 ? `${Math.round(percFatturato)}% emesso` : null} />
        <EcoCard label="Margine Atteso" value={fmt(ov.margine)} icon={BarChart2}
          color={ov.margine >= 0 ? 'green' : 'red'} sub={ov.budget > 0 ? `${Math.round((ov.margine/ov.budget)*100)}%` : null} />
      </div>

      {/* Barra Costi vs Ricavi */}
      {ov.budget > 0 && (
        <div className="card space-y-3">
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Costi vs Ricavi</p>
          <div className="space-y-2">
            <div>
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>Costi sostenuti</span><span>{fmt(ov.spesa_reale)} / {fmt(ov.budget)}</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-3">
                <div className="bg-red-400 h-3 rounded-full transition-all" style={{ width: `${percSpesa}%` }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>Fatturato cliente</span><span>{fmt(ov.fatturato)} / {fmt(ov.budget)}</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-3">
                <div className="bg-steelex-orange h-3 rounded-full transition-all" style={{ width: `${percFatturato}%` }} />
              </div>
            </div>
          </div>
          {ov.da_incassare > 0 && (
            <p className="text-xs text-blue-600 font-medium">💰 Da incassare: {fmt(ov.da_incassare)}</p>
          )}
        </div>
      )}
    </div>
  )
}

function EcoCard({ label, value, icon: Icon, color, sub }) {
  const colors = { orange: 'bg-orange-50 text-steelex-orange', yellow: 'bg-yellow-50 text-yellow-600', red: 'bg-red-50 text-red-600', green: 'bg-green-50 text-green-600', blue: 'bg-blue-50 text-blue-600' }
  return (
    <div className="card">
      <div className={`inline-flex p-1.5 rounded-lg ${colors[color] || colors.orange} mb-1.5`}><Icon size={16} /></div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="font-bold text-gray-900 text-sm mt-0.5">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

/* ─── PREVENTIVO ─── */
const CATEGORIE_VOCE = ['Materiali','Manodopera','Nolo','Servizi','Sicurezza','Altro']

function PreventivoSection({ cantiereId, canWrite }) {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [voci, setVoci] = useState([])
  const [formBase, setFormBase] = useState({ numero: '', data: '', iva_perc: 22, acconto_perc: 30, note: '' })
  const [uploadingFor, setUploadingFor] = useState(null)
  const setB = (k, v) => setFormBase(f => ({ ...f, [k]: v }))

  const { data: preventivi = [], isLoading } = useQuery(['preventivi', cantiereId], () => api.get(`/cantieri/${cantiereId}/preventivi`).then(r => r.data), { staleTime: 0 })

  const STATO_PREV = {
    bozza:     { label: 'Bozza',     bg: 'bg-gray-100 text-gray-600' },
    inviato:   { label: 'Inviato',   bg: 'bg-blue-100 text-blue-700' },
    accettato: { label: 'Accettato', bg: 'bg-green-100 text-green-700' },
    rifiutato: { label: 'Rifiutato', bg: 'bg-red-100 text-red-700' },
  }

  const aggiungiVoce = () => setVoci(v => [...v, { id: Date.now(), descrizione: '', categoria: 'Materiali', qt: 1, um: 'fornitura', costo_unitario: 0, ricarico_perc: 30, prezzo_unitario: 0, totale_costo: 0, totale_cliente: 0 }])

  const aggiornaVoce = (id, k, val) => setVoci(vv => vv.map(v => {
    if (v.id !== id) return v
    const up = { ...v, [k]: val }
    // ricalcola prezzo_unitario e totali
    if (['costo_unitario','ricarico_perc','qt'].includes(k)) {
      const costo = k === 'costo_unitario' ? parseFloat(val)||0 : up.costo_unitario
      const ric = k === 'ricarico_perc' ? parseFloat(val)||0 : up.ricarico_perc
      const qt = k === 'qt' ? parseFloat(val)||1 : up.qt
      up.prezzo_unitario = parseFloat((costo * (1 + ric/100)).toFixed(2))
      up.totale_costo = parseFloat((costo * qt).toFixed(2))
      up.totale_cliente = parseFloat((up.prezzo_unitario * qt).toFixed(2))
    }
    return up
  }))

  const subtotale = voci.reduce((s, v) => s + (v.totale_cliente||0), 0)
  const costoTot  = voci.reduce((s, v) => s + (v.totale_costo||0), 0)
  const totale    = subtotale * (1 + (parseFloat(formBase.iva_perc)||22)/100)
  const acconto   = totale * (parseFloat(formBase.acconto_perc)||30)/100
  const margine   = subtotale - costoTot

  const apriNuovo = () => { setEditId(null); setVoci([]); setFormBase({ numero: '', data: '', iva_perc: 22, acconto_perc: 30, note: '' }); setShowForm(true) }
  const apriModifica = (p) => {
    setEditId(p.id)
    setVoci(p.voci || [])
    setFormBase({ numero: p.numero||'', data: p.data||'', iva_perc: p.iva_perc, acconto_perc: p.acconto_perc, note: p.note||'' })
    setShowForm(true)
  }

  const saveMutation = useMutation(
    (payload) => editId
      ? api.put(`/cantieri/${cantiereId}/preventivi/${editId}`, payload)
      : api.post(`/cantieri/${cantiereId}/preventivi`, payload),
    { onSuccess: () => { qc.invalidateQueries(['preventivi', cantiereId]); qc.invalidateQueries(['economia', cantiereId]); setShowForm(false); toast.success(editId ? 'Preventivo aggiornato!' : 'Preventivo creato!') },
      onError: e => toast.error(e.response?.data?.detail || 'Errore') }
  )
  const updateMutation = useMutation(
    ({ id, data }) => api.put(`/cantieri/${cantiereId}/preventivi/${id}`, data),
    { onSuccess: () => { qc.invalidateQueries(['preventivi', cantiereId]); qc.invalidateQueries(['economia', cantiereId]); toast.success('Aggiornato') } }
  )
  const deleteMutation = useMutation(
    id => api.delete(`/cantieri/${cantiereId}/preventivi/${id}`),
    { onSuccess: () => { qc.invalidateQueries(['preventivi', cantiereId]); qc.invalidateQueries(['economia', cantiereId]); toast.success('Eliminato') } }
  )
  const uploadPdf = async (prevId, file) => {
    setUploadingFor(prevId)
    try {
      const fd = new FormData(); fd.append('file', file)
      await api.post(`/cantieri/${cantiereId}/preventivi/${prevId}/pdf`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      qc.invalidateQueries(['preventivi', cantiereId]); toast.success('PDF allegato!')
    } catch { toast.error('Errore upload')
    } finally { setUploadingFor(null) }
  }

  if (isLoading) return <div className="text-center py-8 text-gray-400">Caricamento...</div>

  return (
    <div className="space-y-3">
      {canWrite && !showForm && (
        <button onClick={apriNuovo} className="btn-primary w-full flex items-center justify-center gap-2">
          <Plus size={16} /> Nuovo Preventivo
        </button>
      )}

      {/* Form preventivo */}
      {showForm && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold">{editId ? 'Modifica Preventivo' : 'Nuovo Preventivo'}</h3>
            <button onClick={() => setShowForm(false)}><X size={16} /></button>
          </div>

          {/* Dati base */}
          <div className="grid grid-cols-2 gap-2">
            <input className="input-field" placeholder="N° Preventivo" value={formBase.numero} onChange={e => setB('numero', e.target.value)} />
            <input type="date" className="input-field" value={formBase.data} onChange={e => setB('data', e.target.value)} />
            <div>
              <label className="text-xs text-gray-500 mb-1 block">IVA %</label>
              <input type="number" className="input-field" value={formBase.iva_perc} onChange={e => setB('iva_perc', e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Acconto %</label>
              <input type="number" className="input-field" value={formBase.acconto_perc} onChange={e => setB('acconto_perc', e.target.value)} />
            </div>
          </div>

          {/* Voci */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Voci</p>
              <button onClick={aggiungiVoce} className="text-xs text-steelex-orange hover:underline flex items-center gap-1"><Plus size={12} /> Aggiungi voce</button>
            </div>
            {voci.length === 0 && <p className="text-xs text-gray-400 italic">Nessuna voce — clicca "Aggiungi voce"</p>}
            {voci.map((v, i) => (
              <div key={v.id} className="bg-gray-50 rounded-xl p-3 space-y-2">
                <div className="flex gap-2">
                  <input className="input-field flex-1 text-sm" placeholder="Descrizione *" value={v.descrizione} onChange={e => aggiornaVoce(v.id, 'descrizione', e.target.value)} />
                  <select className="input-field w-28 text-xs" value={v.categoria} onChange={e => aggiornaVoce(v.id, 'categoria', e.target.value)}>
                    {CATEGORIE_VOCE.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <button onClick={() => setVoci(vv => vv.filter(x => x.id !== v.id))} className="text-gray-300 hover:text-red-500"><Trash2 size={14} /></button>
                </div>
                <div className="grid grid-cols-4 gap-2 text-xs">
                  <div><label className="text-gray-400 block mb-0.5">Qt</label><input type="number" className="input-field py-1 text-xs" value={v.qt} onChange={e => aggiornaVoce(v.id, 'qt', e.target.value)} /></div>
                  <div><label className="text-gray-400 block mb-0.5">Costo unit. €</label><input type="number" className="input-field py-1 text-xs" value={v.costo_unitario} onChange={e => aggiornaVoce(v.id, 'costo_unitario', e.target.value)} /></div>
                  <div><label className="text-gray-400 block mb-0.5">Ricarico %</label><input type="number" className="input-field py-1 text-xs" value={v.ricarico_perc} onChange={e => aggiornaVoce(v.id, 'ricarico_perc', e.target.value)} /></div>
                  <div><label className="text-gray-400 block mb-0.5">Prezzo unit. €</label><p className="text-sm font-semibold text-steelex-orange pt-1">{(v.prezzo_unitario||0).toFixed(2)}</p></div>
                </div>
                <div className="flex justify-end gap-4 text-xs text-gray-500">
                  <span>Costo tot: {fmt(v.totale_costo)}</span>
                  <span className="font-semibold text-gray-800">Prezzo cliente: {fmt(v.totale_cliente)}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Riepilogo */}
          {voci.length > 0 && (
            <div className="bg-gray-50 rounded-xl p-3 space-y-1 text-sm">
              <div className="flex justify-between text-gray-500"><span>Costo totale (privato)</span><span>{fmt(costoTot)}</span></div>
              <div className="flex justify-between text-gray-500"><span>Margine atteso</span><span className={margine >= 0 ? 'text-green-600 font-medium' : 'text-red-600'}>{fmt(margine)} ({costoTot > 0 ? Math.round((margine/costoTot)*100) : 0}%)</span></div>
              <div className="flex justify-between border-t pt-1"><span>Subtotale cliente</span><span className="font-semibold">{fmt(subtotale)}</span></div>
              <div className="flex justify-between text-gray-500"><span>IVA {formBase.iva_perc}%</span><span>{fmt(subtotale * formBase.iva_perc/100)}</span></div>
              <div className="flex justify-between text-steelex-orange font-bold text-base border-t pt-1"><span>Totale</span><span>{fmt(totale)}</span></div>
              <div className="flex justify-between text-blue-600"><span>Acconto richiesto {formBase.acconto_perc}%</span><span>{fmt(acconto)}</span></div>
            </div>
          )}

          <textarea className="input-field h-12 resize-none text-sm" placeholder="Note..." value={formBase.note} onChange={e => setB('note', e.target.value)} />

          <div className="flex gap-2">
            <button onClick={() => setShowForm(false)} className="btn-secondary flex-1">Annulla</button>
            <button onClick={() => saveMutation.mutate({ ...formBase, voci, iva_perc: parseFloat(formBase.iva_perc)||22, acconto_perc: parseFloat(formBase.acconto_perc)||30 })}
              disabled={voci.length === 0 || saveMutation.isLoading} className="btn-primary flex-1">
              {saveMutation.isLoading ? 'Salvataggio...' : editId ? 'Aggiorna' : 'Crea Preventivo'}
            </button>
          </div>
        </div>
      )}

      {/* Lista preventivi */}
      {preventivi.length === 0 && !showForm
        ? <div className="card text-center py-8 text-gray-400"><ClipboardList size={32} className="mx-auto mb-2 opacity-30" /><p>Nessun preventivo</p><p className="text-xs mt-1">Crea il preventivo cliente con le voci di lavoro e il tuo ricarico</p></div>
        : preventivi.map(p => (
          <div key={p.id} className="card space-y-2">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-bold text-gray-900">Preventivo {p.numero || `#${p.id}`}</p>
                {p.data && <p className="text-xs text-gray-400">{fmtDate(p.data)}</p>}
              </div>
              <div className="text-right">
                <p className="font-bold text-steelex-orange text-lg">{fmt(p.totale)}</p>
                <p className="text-xs text-gray-400">Acconto: {fmt(p.acconto_importo)}</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs text-gray-500">
              <div><span className="text-gray-400">Costo</span><br /><span className="font-medium text-gray-700">{fmt(p.costo_totale)}</span></div>
              <div><span className="text-gray-400">Margine</span><br /><span className={`font-medium ${(p.subtotale-p.costo_totale)>=0?'text-green-600':'text-red-600'}`}>{fmt(p.subtotale-p.costo_totale)}</span></div>
              <div><span className="text-gray-400">Acc. ricevuto</span><br /><span className="font-medium text-blue-600">{fmt(p.acconto_ricevuto)}</span></div>
            </div>
            <div className="flex items-center justify-between gap-2">
              {canWrite ? (
                <select value={p.stato} onChange={e => updateMutation.mutate({ id: p.id, data: { stato: e.target.value } })}
                  className={`text-xs px-2 py-1 rounded-full font-medium border-0 cursor-pointer ${STATO_PREV[p.stato]?.bg}`}>
                  {Object.entries(STATO_PREV).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              ) : (
                <span className={`text-xs px-2 py-0.5 rounded-full ${STATO_PREV[p.stato]?.bg}`}>{STATO_PREV[p.stato]?.label}</span>
              )}
              <div className="flex items-center gap-1">
                {p.pdf_url && <a href={p.pdf_url} target="_blank" rel="noreferrer" className="p-1 text-blue-500"><ExternalLink size={14} /></a>}
                {canWrite && <>
                  <label className="p-1 text-gray-400 hover:text-steelex-orange cursor-pointer" title="Allega PDF firmato">
                    <Upload size={14} />
                    <input type="file" accept=".pdf,.jpg,.png" className="hidden" onChange={e => e.target.files[0] && uploadPdf(p.id, e.target.files[0])} />
                  </label>
                  <button onClick={() => apriModifica(p)} className="p-1 text-gray-400 hover:text-steelex-orange" title="Modifica"><FileText size={14} /></button>
                  <button onClick={() => confirm('Eliminare?') && deleteMutation.mutate(p.id)} className="p-1 text-gray-300 hover:text-red-500"><Trash2 size={14} /></button>
                </>}
              </div>
            </div>
            {/* Acconto ricevuto */}
            {canWrite && p.stato === 'accettato' && p.acconto_ricevuto < p.acconto_importo && (
              <div className="bg-blue-50 rounded-lg p-2 flex items-center justify-between">
                <span className="text-xs text-blue-600">Registra acconto ricevuto</span>
                <button onClick={() => {
                  const imp = prompt(`Importo acconto ricevuto (atteso: € ${p.acconto_importo.toFixed(2)}):`)
                  if (imp) updateMutation.mutate({ id: p.id, data: { acconto_ricevuto: parseFloat(imp)||0, data_acconto: new Date().toISOString().split('T')[0] } })
                }} className="text-xs btn-primary py-1 px-2">Registra</button>
              </div>
            )}
          </div>
        ))}
    </div>
  )
}

/* ─── BOLLE / DDT ─── */
function BolleSection({ cantiereId, canWrite }) {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [uploadingFor, setUploadingFor] = useState(null)
  const [form, setForm] = useState({ fornitore_nome: '', numero_bolla: '', data: '', importo_stimato: '', descrizione: '' })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const { data: bolle = [], isLoading } = useQuery(['bolle', cantiereId], () => api.get(`/cantieri/${cantiereId}/bolle`).then(r => r.data), { staleTime: 0 })
  const { data: fatture = [] } = useQuery(['fatture', cantiereId], () => api.get(`/cantieri/${cantiereId}/fatture`).then(r => r.data), { staleTime: 0 })

  const createMutation = useMutation(
    d => api.post(`/cantieri/${cantiereId}/bolle`, d),
    { onSuccess: () => { qc.invalidateQueries(['bolle', cantiereId]); qc.invalidateQueries(['economia', cantiereId]); setShowForm(false); toast.success('Bolla registrata!') },
      onError: e => toast.error(e.response?.data?.detail || 'Errore') }
  )
  const updateMutation = useMutation(
    ({ id, data }) => api.put(`/cantieri/${cantiereId}/bolle/${id}`, data),
    { onSuccess: () => { qc.invalidateQueries(['bolle', cantiereId]); toast.success('Aggiornata') } }
  )
  const deleteMutation = useMutation(
    id => api.delete(`/cantieri/${cantiereId}/bolle/${id}`),
    { onSuccess: () => { qc.invalidateQueries(['bolle', cantiereId]); qc.invalidateQueries(['economia', cantiereId]); toast.success('Eliminata') } }
  )
  const uploadFoto = async (bollaId, file) => {
    setUploadingFor(bollaId)
    try {
      const fd = new FormData(); fd.append('file', file)
      await api.post(`/cantieri/${cantiereId}/bolle/${bollaId}/foto`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      qc.invalidateQueries(['bolle', cantiereId]); toast.success('Foto allegata!')
    } catch { toast.error('Errore upload')
    } finally { setUploadingFor(null) }
  }

  const totaleAperte = bolle.filter(b => b.stato === 'aperta').reduce((s, b) => s + b.importo_stimato, 0)

  if (isLoading) return <div className="text-center py-8 text-gray-400">Caricamento...</div>

  return (
    <div className="space-y-3">
      {totaleAperte > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-xs text-orange-700">
          📦 Bolle aperte (non ancora fatturate): <strong>{fmt(totaleAperte)}</strong> — ricordati di collegarle alla fattura quando arriva
        </div>
      )}

      {canWrite && (
        <button onClick={() => setShowForm(!showForm)} className="btn-primary w-full flex items-center justify-center gap-2">
          <Plus size={16} /> Registra Bolla/DDT
        </button>
      )}

      {showForm && (
        <div className="card space-y-3">
          <div className="flex items-center justify-between"><h3 className="font-bold">Nuova Bolla di Consegna</h3><button onClick={() => setShowForm(false)}><X size={16} /></button></div>
          <input className="input-field" placeholder="Fornitore *" value={form.fornitore_nome} onChange={e => set('fornitore_nome', e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <input className="input-field" placeholder="N° Bolla" value={form.numero_bolla} onChange={e => set('numero_bolla', e.target.value)} />
            <input type="date" className="input-field" value={form.data} onChange={e => set('data', e.target.value)} />
          </div>
          <input type="number" className="input-field" placeholder="Importo stimato (€)" value={form.importo_stimato} onChange={e => set('importo_stimato', e.target.value)} />
          <textarea className="input-field h-14 resize-none text-sm" placeholder="Materiali ricevuti..." value={form.descrizione} onChange={e => set('descrizione', e.target.value)} />
          <div className="flex gap-2">
            <button onClick={() => setShowForm(false)} className="btn-secondary flex-1">Annulla</button>
            <button onClick={() => createMutation.mutate({ ...form, importo_stimato: parseFloat(form.importo_stimato)||0 })}
              disabled={!form.fornitore_nome || createMutation.isLoading} className="btn-primary flex-1">Registra</button>
          </div>
        </div>
      )}

      {bolle.length === 0
        ? <div className="card text-center py-8 text-gray-400"><Package size={32} className="mx-auto mb-2 opacity-30" /><p>Nessuna bolla registrata</p><p className="text-xs mt-1">Registra le bolle di consegna quando acquisti materiali dal fornitore</p></div>
        : bolle.map(b => (
          <div key={b.id} className={`card space-y-2 ${b.stato === 'fatturata' ? 'opacity-60' : ''}`}>
            <div className="flex items-start justify-between">
              <div>
                <p className="font-semibold text-gray-900">{b.fornitore_nome}</p>
                <div className="flex gap-2 text-xs text-gray-400">
                  {b.numero_bolla && <span>Bolla #{b.numero_bolla}</span>}
                  {b.data && <span>{fmtDate(b.data)}</span>}
                </div>
                {b.descrizione && <p className="text-xs text-gray-600 mt-0.5">{b.descrizione}</p>}
              </div>
              <div className="text-right flex-shrink-0">
                <p className="font-bold text-gray-900">{fmt(b.importo_stimato)}</p>
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${b.stato==='aperta' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>{b.stato==='aperta' ? 'Aperta' : 'Fatturata'}</span>
              </div>
            </div>
            <div className="flex items-center justify-between gap-2">
              {/* Collega a fattura */}
              {canWrite && b.stato === 'aperta' && fatture.length > 0 && (
                <select className="input-field text-xs py-1 flex-1" defaultValue="" onChange={e => e.target.value && updateMutation.mutate({ id: b.id, data: { fattura_id: parseInt(e.target.value) } })}>
                  <option value="">Collega a fattura...</option>
                  {fatture.map(f => <option key={f.id} value={f.id}>{f.fornitore_nome} — {fmt(f.importo_totale)}</option>)}
                </select>
              )}
              <div className="flex gap-1 flex-shrink-0">
                {b.foto_url && <a href={b.foto_url} target="_blank" rel="noreferrer" className="p-1 text-blue-500"><ExternalLink size={14} /></a>}
                <label className={`p-1 text-gray-400 hover:text-steelex-orange cursor-pointer ${uploadingFor===b.id?'opacity-50':''}`} title="Foto bolla">
                  <Camera size={14} />
                  <input type="file" accept="image/*" capture="environment" className="hidden" onChange={e => e.target.files[0] && uploadFoto(b.id, e.target.files[0])} disabled={uploadingFor===b.id} />
                </label>
                {canWrite && <button onClick={() => confirm('Eliminare?') && deleteMutation.mutate(b.id)} className="p-1 text-gray-300 hover:text-red-500"><Trash2 size={14} /></button>}
              </div>
            </div>
          </div>
        ))}
    </div>
  )
}

/* ─── ORDINI ─── */
function OrdiniSection({ cantiereId, canWrite }) {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ fornitore_nome: '', descrizione: '', categoria: 'materiali', importo: '', iva_perc: 22, data_ordine: '', note: '' })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const { data: ordini = [], isLoading } = useQuery(['ordini', cantiereId], () => api.get(`/cantieri/${cantiereId}/ordini`).then(r => r.data), { staleTime: 0 })

  const createMutation = useMutation(
    d => api.post(`/cantieri/${cantiereId}/ordini`, d),
    { onSuccess: () => { qc.invalidateQueries(['ordini', cantiereId]); qc.invalidateQueries(['economia', cantiereId]); setShowForm(false); toast.success('Ordine creato!') },
      onError: e => toast.error(e.response?.data?.detail || 'Errore') }
  )
  const updateMutation = useMutation(
    ({ id, data }) => api.put(`/cantieri/${cantiereId}/ordini/${id}`, data),
    { onSuccess: () => { qc.invalidateQueries(['ordini', cantiereId]); qc.invalidateQueries(['economia', cantiereId]); toast.success('Aggiornato') } }
  )
  const deleteMutation = useMutation(
    id => api.delete(`/cantieri/${cantiereId}/ordini/${id}`),
    { onSuccess: () => { qc.invalidateQueries(['ordini', cantiereId]); qc.invalidateQueries(['economia', cantiereId]); toast.success('Eliminato') } }
  )

  const totale = (importo, iva) => ((parseFloat(importo)||0) * (1 + (parseFloat(iva)||22)/100)).toFixed(2)

  if (isLoading) return <div className="text-center py-8 text-gray-400">Caricamento...</div>

  return (
    <div className="space-y-3">
      {canWrite && (
        <button onClick={() => setShowForm(!showForm)} className="btn-primary w-full flex items-center justify-center gap-2">
          <Plus size={16} /> Nuovo Ordine
        </button>
      )}

      {showForm && (
        <div className="card space-y-3">
          <div className="flex items-center justify-between"><h3 className="font-bold">Nuovo Ordine di Acquisto</h3><button onClick={() => setShowForm(false)}><X size={16} /></button></div>
          <input className="input-field" placeholder="Fornitore *" value={form.fornitore_nome} onChange={e => set('fornitore_nome', e.target.value)} />
          <textarea className="input-field h-16 resize-none" placeholder="Descrizione *" value={form.descrizione} onChange={e => set('descrizione', e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Categoria</label>
              <select className="input-field" value={form.categoria} onChange={e => set('categoria', e.target.value)}>
                {CATEGORIE.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase()+c.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Data ordine</label>
              <input type="date" className="input-field" value={form.data_ordine} onChange={e => set('data_ordine', e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Importo netto (€)</label>
              <input type="number" className="input-field" placeholder="0.00" value={form.importo} onChange={e => set('importo', e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">IVA %</label>
              <input type="number" className="input-field" value={form.iva_perc} onChange={e => set('iva_perc', e.target.value)} />
            </div>
          </div>
          {form.importo && <p className="text-sm text-gray-600">Totale con IVA: <strong>€ {totale(form.importo, form.iva_perc)}</strong></p>}
          <textarea className="input-field h-12 resize-none" placeholder="Note..." value={form.note} onChange={e => set('note', e.target.value)} />
          <div className="flex gap-2">
            <button onClick={() => setShowForm(false)} className="btn-secondary flex-1">Annulla</button>
            <button onClick={() => createMutation.mutate({ ...form, importo: parseFloat(form.importo)||0, iva_perc: parseFloat(form.iva_perc)||22 })}
              disabled={!form.fornitore_nome || !form.descrizione || !form.importo || createMutation.isLoading}
              className="btn-primary flex-1">{createMutation.isLoading ? 'Salvataggio...' : 'Crea Ordine'}</button>
          </div>
        </div>
      )}

      {ordini.length === 0
        ? <div className="card text-center py-8 text-gray-400"><ShoppingCart size={32} className="mx-auto mb-2 opacity-30" /><p>Nessun ordine</p></div>
        : ordini.map(o => (
          <div key={o.id} className="card space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 truncate">{o.fornitore_nome}</p>
                <p className="text-sm text-gray-600 truncate">{o.descrizione}</p>
                <div className="flex gap-2 mt-1 flex-wrap">
                  <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">{o.categoria}</span>
                  {o.data_ordine && <span className="text-xs text-gray-400">{fmtDate(o.data_ordine)}</span>}
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="font-bold text-gray-900">{fmt(o.importo_totale)}</p>
                <p className="text-xs text-gray-400">+IVA {o.iva_perc}%</p>
              </div>
            </div>
            <div className="flex items-center justify-between">
              {canWrite ? (
                <select value={o.stato} onChange={e => updateMutation.mutate({ id: o.id, data: { stato: e.target.value } })}
                  className={`text-xs px-2 py-1 rounded-full font-medium border-0 cursor-pointer ${STATO_ORDINE[o.stato]?.bg}`}>
                  {Object.entries(STATO_ORDINE).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              ) : (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATO_ORDINE[o.stato]?.bg}`}>{STATO_ORDINE[o.stato]?.label}</span>
              )}
              {canWrite && (
                <button onClick={() => confirm('Eliminare?') && deleteMutation.mutate(o.id)} className="p-1 text-gray-300 hover:text-red-500"><Trash2 size={15} /></button>
              )}
            </div>
          </div>
        ))}
    </div>
  )
}

/* ─── FATTURE ─── */
function FattureSection({ cantiereId, canWrite }) {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [uploadingFor, setUploadingFor] = useState(null)
  const [form, setForm] = useState({ fornitore_nome: '', numero_fattura: '', descrizione: '', importo_netto: '', iva_perc: 22, data_fattura: '', data_scadenza: '' })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const { data: fatture = [], isLoading } = useQuery(['fatture', cantiereId], () => api.get(`/cantieri/${cantiereId}/fatture`).then(r => r.data), { staleTime: 0 })

  const createMutation = useMutation(
    d => api.post(`/cantieri/${cantiereId}/fatture`, d),
    { onSuccess: () => { qc.invalidateQueries(['fatture', cantiereId]); qc.invalidateQueries(['economia', cantiereId]); setShowForm(false); toast.success('Fattura registrata!') },
      onError: e => toast.error(e.response?.data?.detail || 'Errore') }
  )
  const updateMutation = useMutation(
    ({ id, data }) => api.put(`/cantieri/${cantiereId}/fatture/${id}`, data),
    { onSuccess: () => { qc.invalidateQueries(['fatture', cantiereId]); qc.invalidateQueries(['economia', cantiereId]); toast.success('Aggiornato') } }
  )
  const deleteMutation = useMutation(
    id => api.delete(`/cantieri/${cantiereId}/fatture/${id}`),
    { onSuccess: () => { qc.invalidateQueries(['fatture', cantiereId]); qc.invalidateQueries(['economia', cantiereId]); toast.success('Eliminata') } }
  )

  const uploadPDF = async (fatturaId, file) => {
    setUploadingFor(fatturaId)
    try {
      const fd = new FormData(); fd.append('file', file)
      await api.post(`/cantieri/${cantiereId}/fatture/${fatturaId}/pdf`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      qc.invalidateQueries(['fatture', cantiereId]); toast.success('PDF allegato!')
    } catch { toast.error('Errore upload PDF')
    } finally { setUploadingFor(null) }
  }

  if (isLoading) return <div className="text-center py-8 text-gray-400">Caricamento...</div>

  return (
    <div className="space-y-3">
      {canWrite && (
        <button onClick={() => setShowForm(!showForm)} className="btn-primary w-full flex items-center justify-center gap-2">
          <Plus size={16} /> Registra Fattura
        </button>
      )}

      {showForm && (
        <div className="card space-y-3">
          <div className="flex items-center justify-between"><h3 className="font-bold">Nuova Fattura Fornitore</h3><button onClick={() => setShowForm(false)}><X size={16} /></button></div>
          <div className="grid grid-cols-2 gap-2">
            <input className="input-field col-span-2" placeholder="Fornitore *" value={form.fornitore_nome} onChange={e => set('fornitore_nome', e.target.value)} />
            <input className="input-field" placeholder="N° Fattura" value={form.numero_fattura} onChange={e => set('numero_fattura', e.target.value)} />
            <input type="date" className="input-field" placeholder="Data fattura" value={form.data_fattura} onChange={e => set('data_fattura', e.target.value)} />
            <input type="number" className="input-field" placeholder="Importo netto (€) *" value={form.importo_netto} onChange={e => set('importo_netto', e.target.value)} />
            <input type="number" className="input-field" placeholder="IVA %" value={form.iva_perc} onChange={e => set('iva_perc', e.target.value)} />
            <input type="date" className="input-field col-span-2" placeholder="Scadenza" value={form.data_scadenza} onChange={e => set('data_scadenza', e.target.value)} />
          </div>
          {form.importo_netto && <p className="text-sm text-gray-600">Totale: <strong>€ {((parseFloat(form.importo_netto)||0)*(1+(parseFloat(form.iva_perc)||22)/100)).toFixed(2)}</strong></p>}
          <div className="flex gap-2">
            <button onClick={() => setShowForm(false)} className="btn-secondary flex-1">Annulla</button>
            <button onClick={() => createMutation.mutate({ ...form, importo_netto: parseFloat(form.importo_netto)||0, iva_perc: parseFloat(form.iva_perc)||22 })}
              disabled={!form.fornitore_nome || !form.importo_netto || createMutation.isLoading}
              className="btn-primary flex-1">{createMutation.isLoading ? 'Salvataggio...' : 'Registra'}</button>
          </div>
        </div>
      )}

      {fatture.length === 0
        ? <div className="card text-center py-8 text-gray-400"><FileText size={32} className="mx-auto mb-2 opacity-30" /><p>Nessuna fattura</p></div>
        : fatture.map(f => (
          <div key={f.id} className="card space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 truncate">{f.fornitore_nome}</p>
                {f.numero_fattura && <p className="text-xs text-gray-500">N° {f.numero_fattura}</p>}
                <div className="flex gap-2 mt-1 text-xs text-gray-400 flex-wrap">
                  {f.data_fattura && <span>Emessa: {fmtDate(f.data_fattura)}</span>}
                  {f.data_scadenza && <span className={dayjs(f.data_scadenza).isBefore(dayjs()) && f.stato !== 'pagata' ? 'text-red-500 font-medium' : ''}>Scade: {fmtDate(f.data_scadenza)}</span>}
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="font-bold text-gray-900">{fmt(f.importo_totale)}</p>
                <p className="text-xs text-gray-400">netto {fmt(f.importo_netto)}</p>
              </div>
            </div>
            <div className="flex items-center justify-between gap-2">
              {canWrite ? (
                <select value={f.stato} onChange={e => updateMutation.mutate({ id: f.id, data: { stato: e.target.value } })}
                  className={`text-xs px-2 py-1 rounded-full font-medium border-0 cursor-pointer ${STATO_FATTURA[f.stato]?.bg}`}>
                  {Object.entries(STATO_FATTURA).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              ) : (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATO_FATTURA[f.stato]?.bg}`}>{STATO_FATTURA[f.stato]?.label}</span>
              )}
              <div className="flex items-center gap-1">
                {f.pdf_url && (
                  <a href={f.pdf_url} target="_blank" rel="noreferrer" className="p-1 text-blue-500 hover:text-blue-700" title="Apri PDF"><ExternalLink size={15} /></a>
                )}
                {canWrite && (
                  <>
                    <label className={`p-1 text-gray-400 hover:text-steelex-orange cursor-pointer ${uploadingFor===f.id?'opacity-50':''}`} title="Allega PDF">
                      <Upload size={15} />
                      <input type="file" accept=".pdf" className="hidden" onChange={e => e.target.files[0] && uploadPDF(f.id, e.target.files[0])} disabled={uploadingFor===f.id} />
                    </label>
                    <button onClick={() => confirm('Eliminare?') && deleteMutation.mutate(f.id)} className="p-1 text-gray-300 hover:text-red-500"><Trash2 size={15} /></button>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
    </div>
  )
}

/* ─── SAL ─── */
function SALSection({ cantiereId, canWrite }) {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ titolo: '', percentuale: '', importo: '', data: '', note: '' })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const { data: salList = [], isLoading } = useQuery(['sal', cantiereId], () => api.get(`/cantieri/${cantiereId}/sal`).then(r => r.data), { staleTime: 0 })

  const createMutation = useMutation(
    d => api.post(`/cantieri/${cantiereId}/sal`, d),
    { onSuccess: () => { qc.invalidateQueries(['sal', cantiereId]); qc.invalidateQueries(['economia', cantiereId]); setShowForm(false); toast.success('SAL creato!') },
      onError: e => toast.error(e.response?.data?.detail || 'Errore') }
  )
  const updateMutation = useMutation(
    ({ id, data }) => api.put(`/cantieri/${cantiereId}/sal/${id}`, data),
    { onSuccess: () => { qc.invalidateQueries(['sal', cantiereId]); qc.invalidateQueries(['economia', cantiereId]); toast.success('Aggiornato') } }
  )
  const deleteMutation = useMutation(
    id => api.delete(`/cantieri/${cantiereId}/sal/${id}`),
    { onSuccess: () => { qc.invalidateQueries(['sal', cantiereId]); qc.invalidateQueries(['economia', cantiereId]); toast.success('Eliminato') } }
  )

  const totaleEmesso = salList.filter(s => s.stato !== 'bozza').reduce((s, sal) => s + sal.importo, 0)

  if (isLoading) return <div className="text-center py-8 text-gray-400">Caricamento...</div>

  return (
    <div className="space-y-3">
      {salList.length > 0 && (
        <div className="card flex items-center justify-between">
          <div><p className="text-xs text-gray-500">Totale SAL Emessi</p><p className="font-bold text-gray-900">{fmt(totaleEmesso)}</p></div>
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
          <div className="flex items-center justify-between"><h3 className="font-bold">Nuovo SAL #{salList.length + 1}</h3><button onClick={() => setShowForm(false)}><X size={16} /></button></div>
          <input className="input-field" placeholder="Titolo (es. SAL Fine Fondazioni) *" value={form.titolo} onChange={e => set('titolo', e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">% Avanzamento</label>
              <input type="number" min="0" max="100" className="input-field" placeholder="es. 30" value={form.percentuale} onChange={e => set('percentuale', e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Importo (€)</label>
              <input type="number" className="input-field" placeholder="0.00" value={form.importo} onChange={e => set('importo', e.target.value)} />
            </div>
          </div>
          <input type="date" className="input-field" value={form.data} onChange={e => set('data', e.target.value)} />
          <textarea className="input-field h-12 resize-none" placeholder="Note..." value={form.note} onChange={e => set('note', e.target.value)} />
          <div className="flex gap-2">
            <button onClick={() => setShowForm(false)} className="btn-secondary flex-1">Annulla</button>
            <button onClick={() => createMutation.mutate({ ...form, percentuale: parseFloat(form.percentuale)||0, importo: parseFloat(form.importo)||0 })}
              disabled={!form.titolo || !form.importo || createMutation.isLoading}
              className="btn-primary flex-1">{createMutation.isLoading ? 'Salvataggio...' : 'Crea SAL'}</button>
          </div>
        </div>
      )}

      {salList.length === 0
        ? <div className="card text-center py-8 text-gray-400"><BarChart2 size={32} className="mx-auto mb-2 opacity-30" /><p>Nessun SAL</p></div>
        : salList.map(s => (
          <div key={s.id} className="card space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-gray-400">SAL #{s.numero}</span>
                  {s.data && <span className="text-xs text-gray-400">{fmtDate(s.data)}</span>}
                </div>
                <p className="font-semibold text-gray-900">{s.titolo}</p>
                {s.percentuale > 0 && <p className="text-xs text-gray-500">{s.percentuale}% avanzamento</p>}
              </div>
              <div className="text-right flex-shrink-0">
                <p className="font-bold text-steelex-orange">{fmt(s.importo)}</p>
              </div>
            </div>
            <div className="flex items-center justify-between">
              {canWrite ? (
                <select value={s.stato} onChange={e => updateMutation.mutate({ id: s.id, data: { stato: e.target.value } })}
                  className={`text-xs px-2 py-1 rounded-full font-medium border-0 cursor-pointer ${STATO_SAL[s.stato]?.bg}`}>
                  {Object.entries(STATO_SAL).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              ) : (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATO_SAL[s.stato]?.bg}`}>{STATO_SAL[s.stato]?.label}</span>
              )}
              {canWrite && (
                <button onClick={() => confirm('Eliminare?') && deleteMutation.mutate(s.id)} className="p-1 text-gray-300 hover:text-red-500"><Trash2 size={15} /></button>
              )}
            </div>
          </div>
        ))}
    </div>
  )
}
