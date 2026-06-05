import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { Euro, TrendingUp, TrendingDown, ShoppingCart, FileText, BarChart2, Plus, Trash2, X, ChevronDown, Upload, ExternalLink, CheckCircle, Clock, AlertCircle } from 'lucide-react'
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

export default function EconomiaTab({ cantiereId }) {
  const { utente } = useAuth()
  const [sezione, setSezione] = useState('overview') // overview | ordini | fatture | sal
  const canWrite = ['admin', 'capo_cantiere'].includes(utente?.ruolo)

  return (
    <div className="space-y-3">
      {/* Sotto-navigazione */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
        {[['overview','Panoramica',BarChart2],['ordini','Ordini',ShoppingCart],['fatture','Fatture',FileText],['sal','SAL',TrendingUp]].map(([k,l,Icon]) => (
          <button key={k} onClick={() => setSezione(k)}
            className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${sezione===k ? 'bg-white shadow text-steelex-orange' : 'text-gray-500'}`}>
            <Icon size={12} />{l}
          </button>
        ))}
      </div>

      {sezione === 'overview' && <OverviewSection cantiereId={cantiereId} />}
      {sezione === 'ordini'   && <OrdiniSection   cantiereId={cantiereId} canWrite={canWrite} />}
      {sezione === 'fatture'  && <FattureSection  cantiereId={cantiereId} canWrite={canWrite} />}
      {sezione === 'sal'      && <SALSection       cantiereId={cantiereId} canWrite={canWrite} />}
    </div>
  )
}

/* ─── OVERVIEW ─── */
function OverviewSection({ cantiereId }) {
  const { data: ov, isLoading } = useQuery(
    ['economia', cantiereId],
    () => api.get(`/cantieri/${cantiereId}/economia`).then(r => r.data),
    { staleTime: 0 }
  )
  if (isLoading) return <div className="text-center py-8 text-gray-400">Caricamento...</div>
  if (!ov) return null

  const percSpesa = ov.budget > 0 ? Math.min((ov.spesa_reale / ov.budget) * 100, 100) : 0
  const percImpegnato = ov.budget > 0 ? Math.min((ov.impegnato / ov.budget) * 100, 100) : 0

  return (
    <div className="space-y-3">
      {/* Cards principali */}
      <div className="grid grid-cols-2 gap-3">
        <EcoCard label="Budget Totale" value={fmt(ov.budget)} icon={Euro} color="orange" />
        <EcoCard label="Impegnato" value={fmt(ov.impegnato)} icon={ShoppingCart} color="yellow"
          sub={ov.budget > 0 ? `${Math.round(percImpegnato)}% del budget` : null} />
        <EcoCard label="Spesa Reale" value={fmt(ov.spesa_reale)} icon={TrendingDown} color="red"
          sub={ov.budget > 0 ? `${Math.round(percSpesa)}% del budget` : null} />
        <EcoCard label="Margine" value={fmt(ov.margine)} icon={TrendingUp}
          color={ov.margine >= 0 ? 'green' : 'red'} />
      </div>

      {/* Barra budget */}
      {ov.budget > 0 && (
        <div className="card space-y-2">
          <p className="text-xs font-medium text-gray-600">Utilizzo Budget</p>
          <div className="relative w-full bg-gray-100 rounded-full h-4 overflow-hidden">
            {/* Impegnato */}
            <div className="absolute left-0 top-0 h-4 bg-yellow-200 rounded-full transition-all"
              style={{ width: `${percImpegnato}%` }} />
            {/* Spesa reale sopra */}
            <div className="absolute left-0 top-0 h-4 bg-steelex-orange rounded-full transition-all"
              style={{ width: `${percSpesa}%` }} />
          </div>
          <div className="flex gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-steelex-orange inline-block" /> Spesa reale</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-yellow-200 inline-block" /> Impegnato</span>
          </div>
        </div>
      )}

      {/* SAL / Fatturato */}
      <div className="card space-y-2">
        <p className="text-xs font-medium text-gray-600 uppercase tracking-wide">Fatturato Cliente</p>
        <div className="flex justify-between">
          <div><p className="text-xs text-gray-400">SAL Emessi</p><p className="font-bold text-gray-900">{fmt(ov.fatturato)}</p></div>
          <div className="text-right"><p className="text-xs text-gray-400">Da Incassare</p><p className="font-bold text-blue-600">{fmt(ov.da_incassare)}</p></div>
        </div>
      </div>
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
