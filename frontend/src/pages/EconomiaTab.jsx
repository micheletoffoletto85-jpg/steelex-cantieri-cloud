/**
 * Modulo Economico STEELEX — struttura semplice:
 *   Computo → Spese → SAL → Riepilogo
 */
import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { Euro, TrendingUp, TrendingDown, FileText, BarChart2, Plus, Trash2, X, Upload, ExternalLink, Camera, ClipboardList, Receipt, Edit2, CheckCircle2 } from 'lucide-react'
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
  ['sal',       'SAL',       TrendingUp],
]

export default function EconomiaTab({ cantiereId }) {
  const { utente } = useAuth()
  const [sezione, setSezione] = useState('riepilogo')
  const canWrite = ['admin','capo_cantiere'].includes(utente?.ruolo)

  return (
    <div className="space-y-3">
      <div className="flex gap-1 overflow-x-auto pb-1">
        {SEZIONI.map(([k,l,Icon]) => (
          <button key={k} onClick={() => setSezione(k)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap flex-shrink-0 transition-colors ${sezione===k ? 'bg-steelex-orange text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            <Icon size={12} />{l}
          </button>
        ))}
      </div>
      {sezione === 'riepilogo' && <RiepilogoSection cantiereId={cantiereId} />}
      {sezione === 'computo'   && <ComputoSection   cantiereId={cantiereId} canWrite={canWrite} />}
      {sezione === 'spese'     && <SpeseSection     cantiereId={cantiereId} canWrite={canWrite} />}
      {sezione === 'sal'       && <SALSection        cantiereId={cantiereId} canWrite={canWrite} />}
    </div>
  )
}

/* ─── RIEPILOGO ─── */
function RiepilogoSection({ cantiereId }) {
  const { data: rv, isLoading } = useQuery(['economia', cantiereId], () => api.get(`/cantieri/${cantiereId}/economia`).then(r => r.data), { staleTime: 0 })
  const { data: preventivi = [] } = useQuery(['preventivi', cantiereId], () => api.get(`/cantieri/${cantiereId}/preventivi`).then(r => r.data), { staleTime: 0 })
  if (isLoading) return <div className="text-center py-8 text-gray-400">Caricamento...</div>
  if (!rv) return null

  const prevOk = preventivi.find(p => p.stato === 'accettato')
  const percSpeso = rv.budget_preventivo > 0 ? Math.min((rv.totale_speso / rv.budget_preventivo) * 100, 100) : 0
  const marginePositivo = rv.margine_atteso >= 0

  return (
    <div className="space-y-3">
      {!prevOk && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-xs text-yellow-700">
          ⚠️ Nessun computo accettato — vai su <strong>Computo</strong> per creare il preventivo cliente.
        </div>
      )}
      {prevOk && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-xs text-green-700 flex justify-between items-center">
          <div>✅ <strong>Computo #{prevOk.numero || prevOk.id}</strong> accettato</div>
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
        <div className="card">
          <p className="text-xs text-gray-400 mb-1">Totale speso</p>
          <p className="text-lg font-bold text-gray-900">{fmt(rv.totale_speso)}</p>
          <p className="text-xs text-gray-400">{Math.round(percSpeso)}% del budget</p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-400 mb-1">Margine atteso</p>
          <p className={`text-lg font-bold ${marginePositivo ? 'text-green-600' : 'text-red-600'}`}>{fmt(rv.margine_atteso)}</p>
          <p className="text-xs text-gray-400">{rv.budget_preventivo > 0 ? Math.round((rv.margine_atteso / rv.budget_preventivo)*100) : 0}%</p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-400 mb-1">Da incassare</p>
          <p className="text-lg font-bold text-blue-600">{fmt(rv.da_incassare)}</p>
          <p className="text-xs text-gray-400">Incassato: {fmt(rv.totale_sal_pagati)}</p>
        </div>
      </div>

      {/* Barra budget */}
      {rv.budget_preventivo > 0 && (
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

      {/* Spese per categoria */}
      {Object.keys(rv.spese_per_categoria || {}).length > 0 && (
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

function ComputoSection({ cantiereId, canWrite }) {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [voci, setVoci] = useState([])
  const [base, setBase] = useState({ numero: '', data_preventivo: '', iva_perc: 22, acconto_perc: 30, note: '' })
  const setB = (k,v) => setBase(f => ({...f,[k]:v}))
  const [uploadingFor, setUploadingFor] = useState(null)

  const { data: preventivi = [], isLoading } = useQuery(['preventivi', cantiereId], () => api.get(`/cantieri/${cantiereId}/preventivi`).then(r => r.data), { staleTime: 0 })

  const chiudi = () => { setShowForm(false); setEditId(null); setVoci([]); setBase({ numero:'',data_preventivo:'',iva_perc:22,acconto_perc:30,note:'' }) }

  const apriModifica = (p) => {
    setEditId(p.id)
    setVoci(p.voci || [])
    setBase({ numero: p.numero||'', data_preventivo: p.data||'', iva_perc: p.iva_perc, acconto_perc: p.acconto_perc, note: p.note||'' })
    setShowForm(true)
  }

  const aggiungiVoce = () => setVoci(v => [...v, { id: Date.now(), descrizione:'', categoria:'Materiali', qt:1, um:'fornitura', costo_unitario:0, ricarico_perc:30, prezzo_unitario:0, totale_costo:0, totale_cliente:0 }])

  const aggiornaVoce = (id, k, val) => setVoci(vv => vv.map(v => {
    if (v.id !== id) return v
    const up = { ...v, [k]: val }
    if (['costo_unitario','ricarico_perc','qt'].includes(k)) {
      const costo = k==='costo_unitario' ? parseFloat(val)||0 : up.costo_unitario
      const ric   = k==='ricarico_perc'  ? parseFloat(val)||0 : up.ricarico_perc
      const qt    = k==='qt'             ? parseFloat(val)||1 : up.qt
      up.prezzo_unitario = parseFloat((costo*(1+ric/100)).toFixed(2))
      up.totale_costo    = parseFloat((costo*qt).toFixed(2))
      up.totale_cliente  = parseFloat((up.prezzo_unitario*qt).toFixed(2))
    }
    return up
  }))

  const subtotale = voci.reduce((s,v) => s+(v.totale_cliente||0), 0)
  const costoTot  = voci.reduce((s,v) => s+(v.totale_costo||0), 0)
  const totale    = subtotale * (1 + (parseFloat(base.iva_perc)||22)/100)
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

  return (
    <div className="space-y-3">
      {canWrite && !showForm && (
        <button onClick={() => setShowForm(true)} className="btn-primary w-full flex items-center justify-center gap-2">
          <Plus size={16} /> Nuovo Computo
        </button>
      )}

      {showForm && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold">{editId ? 'Modifica Computo' : 'Nuovo Computo'}</h3>
            <button onClick={chiudi}><X size={16} /></button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input className="input-field" placeholder="N° Preventivo" value={base.numero} onChange={e => setB('numero',e.target.value)} />
            <input type="date" className="input-field" value={base.data_preventivo} onChange={e => setB('data_preventivo',e.target.value)} />
            <div><label className="text-xs text-gray-500 block mb-1">IVA %</label>
              <input type="number" className="input-field" value={base.iva_perc} onChange={e => setB('iva_perc',e.target.value)} /></div>
            <div><label className="text-xs text-gray-500 block mb-1">Acconto %</label>
              <input type="number" className="input-field" value={base.acconto_perc} onChange={e => setB('acconto_perc',e.target.value)} /></div>
          </div>

          {/* Voci */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Voci</p>
              <button onClick={aggiungiVoce} className="text-xs text-steelex-orange hover:underline flex items-center gap-1"><Plus size={12} /> Aggiungi voce</button>
            </div>
            {voci.length === 0 && <p className="text-xs text-gray-400 italic text-center py-4">Nessuna voce — clicca "+ Aggiungi voce"</p>}
            {voci.map((v) => (
              <div key={v.id} className="bg-gray-50 rounded-xl p-3 space-y-2">
                <div className="flex gap-2">
                  <input className="input-field flex-1 text-sm" placeholder="Descrizione *" value={v.descrizione} onChange={e => aggiornaVoce(v.id,'descrizione',e.target.value)} />
                  <select className="input-field w-28 text-xs" value={v.categoria} onChange={e => aggiornaVoce(v.id,'categoria',e.target.value)}>
                    {CATEGORIE_VOCE.map(c => <option key={c}>{c}</option>)}
                  </select>
                  <button onClick={() => setVoci(vv => vv.filter(x=>x.id!==v.id))} className="text-gray-300 hover:text-red-500"><Trash2 size={14} /></button>
                </div>
                <div className="grid grid-cols-4 gap-2 text-xs">
                  <div><label className="text-gray-400 block mb-0.5">Qt</label><input type="number" className="input-field py-1 text-xs" value={v.qt} onChange={e=>aggiornaVoce(v.id,'qt',e.target.value)} /></div>
                  <div><label className="text-gray-400 block mb-0.5">Costo €</label><input type="number" className="input-field py-1 text-xs" value={v.costo_unitario} onChange={e=>aggiornaVoce(v.id,'costo_unitario',e.target.value)} /></div>
                  <div><label className="text-gray-400 block mb-0.5">Ricarico %</label><input type="number" className="input-field py-1 text-xs" value={v.ricarico_perc} onChange={e=>aggiornaVoce(v.id,'ricarico_perc',e.target.value)} /></div>
                  <div><label className="text-gray-400 block mb-0.5">Prezzo cliente</label><p className="text-sm font-bold text-steelex-orange pt-1">{(v.prezzo_unitario||0).toFixed(2)}</p></div>
                </div>
                <div className="flex justify-end gap-4 text-xs text-gray-400">
                  <span>Costo: {fmt(v.totale_costo)}</span>
                  <span className="font-medium text-gray-700">Cliente: {fmt(v.totale_cliente)}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Riepilogo */}
          {voci.length > 0 && (
            <div className="bg-gray-50 rounded-xl p-3 space-y-1 text-sm border-t">
              <div className="flex justify-between text-gray-500"><span>Costo totale (riservato)</span><span>{fmt(costoTot)}</span></div>
              <div className="flex justify-between"><span>Margine</span><span className={margine>=0?'text-green-600 font-medium':'text-red-600'}>{fmt(margine)} ({costoTot>0?Math.round((margine/costoTot)*100):0}%)</span></div>
              <div className="flex justify-between border-t pt-1"><span>Subtotale cliente</span><span className="font-semibold">{fmt(subtotale)}</span></div>
              <div className="flex justify-between text-gray-500"><span>IVA {base.iva_perc}%</span><span>{fmt(subtotale*base.iva_perc/100)}</span></div>
              <div className="flex justify-between text-steelex-orange font-bold text-base"><span>TOTALE</span><span>{fmt(totale)}</span></div>
              <div className="flex justify-between text-blue-600"><span>Acconto {base.acconto_perc}%</span><span>{fmt(acconto)}</span></div>
            </div>
          )}

          <textarea className="input-field h-12 resize-none text-sm" placeholder="Note..." value={base.note} onChange={e => setB('note',e.target.value)} />
          <div className="flex gap-2">
            <button onClick={chiudi} className="btn-secondary flex-1">Annulla</button>
            <button onClick={() => saveMutation.mutate({ ...base, voci, iva_perc:parseFloat(base.iva_perc)||22, acconto_perc:parseFloat(base.acconto_perc)||30 })}
              disabled={voci.length===0||saveMutation.isLoading} className="btn-primary flex-1">
              {saveMutation.isLoading ? 'Salvataggio...' : editId ? 'Aggiorna' : 'Crea Computo'}
            </button>
          </div>
        </div>
      )}

      {preventivi.length === 0 && !showForm ? (
        <div className="card text-center py-8 text-gray-400"><ClipboardList size={32} className="mx-auto mb-2 opacity-30" /><p>Nessun computo</p><p className="text-xs mt-1">Inserisci le voci di costo con il tuo ricarico per creare il preventivo cliente</p></div>
      ) : preventivi.map(p => (
        <div key={p.id} className="card space-y-2">
          <div className="flex items-start justify-between">
            <div><p className="font-bold">Computo {p.numero||`#${p.id}`}</p>{p.data && <p className="text-xs text-gray-400">{fmtD(p.data)}</p>}</div>
            <div className="text-right"><p className="text-xl font-bold text-steelex-orange">{fmt(p.totale)}</p><p className="text-xs text-gray-400">Acconto: {fmt(p.acconto_importo)}</p></div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div><span className="text-gray-400 block">Costo base</span><span className="font-medium">{fmt(p.costo_totale)}</span></div>
            <div><span className="text-gray-400 block">Margine</span><span className={`font-medium ${(p.subtotale-p.costo_totale)>=0?'text-green-600':'text-red-600'}`}>{fmt(p.subtotale-p.costo_totale)}</span></div>
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
  const [uploadingFor, setUploadingFor] = useState(null)
  const [form, setForm] = useState({ descrizione:'', fornitore:'', categoria:'materiali', importo:'', data:'', note:'' })
  const set = (k,v) => setForm(f => ({...f,[k]:v}))

  const { data: spese = [], isLoading } = useQuery(['spese', cantiereId], () => api.get(`/cantieri/${cantiereId}/spese`).then(r => r.data), { staleTime: 0 })

  const totale = spese.reduce((s,sp) => s+sp.importo, 0)

  const createMutation = useMutation(
    d => api.post(`/cantieri/${cantiereId}/spese`, d),
    { onSuccess: () => { qc.invalidateQueries(['spese',cantiereId]); qc.invalidateQueries(['economia',cantiereId]); setShowForm(false); setForm({descrizione:'',fornitore:'',categoria:'materiali',importo:'',data:'',note:''}); toast.success('Spesa registrata!') },
      onError: e => toast.error(e.response?.data?.detail||'Errore') }
  )
  const deleteMutation = useMutation(
    id => api.delete(`/cantieri/${cantiereId}/spese/${id}`),
    { onSuccess: () => { qc.invalidateQueries(['spese',cantiereId]); qc.invalidateQueries(['economia',cantiereId]); toast.success('Eliminata') } }
  )
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
      {spese.length > 0 && (
        <div className="card flex items-center justify-between">
          <div><p className="text-xs text-gray-400">Totale spese registrate</p><p className="text-xl font-bold text-gray-900">{fmt(totale)}</p></div>
          <Receipt size={24} className="text-gray-300" />
        </div>
      )}

      {canWrite && (
        <button onClick={() => setShowForm(!showForm)} className="btn-primary w-full flex items-center justify-center gap-2">
          <Plus size={16} /> Registra Spesa
        </button>
      )}

      {showForm && (
        <div className="card space-y-3">
          <div className="flex items-center justify-between"><h3 className="font-bold">Nuova Spesa</h3><button onClick={() => setShowForm(false)}><X size={16} /></button></div>
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
            <button onClick={() => setShowForm(false)} className="btn-secondary flex-1">Annulla</button>
            <button onClick={() => createMutation.mutate({...form, importo:parseFloat(form.importo)||0, data:form.data||null})}
              disabled={!form.descrizione||!form.importo||createMutation.isLoading} className="btn-primary flex-1">
              {createMutation.isLoading ? 'Salvataggio...' : 'Registra'}
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
                  <input type="file" accept="image/*,.pdf" capture="environment" className="hidden"
                    onChange={e => e.target.files[0] && uploadAllegato(s.id, e.target.files[0])} disabled={uploadingFor===s.id} />
                </label>
                <label className="p-1 text-gray-400 hover:text-steelex-orange cursor-pointer" title="Allega PDF">
                  <FileText size={14} />
                  <input type="file" accept=".pdf" className="hidden" onChange={e => e.target.files[0] && uploadAllegato(s.id, e.target.files[0])} />
                </label>
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
function SALSection({ cantiereId, canWrite }) {
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
