/**
 * Diagramma di Gantt + Cronoprogramma
 * Collega le fasi di lavoro ai SAL (Stato Avanzamento Lavori)
 */
import { useState, useMemo, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { Plus, Trash2, X, Edit2, Save, AlertTriangle, CheckCircle2, Clock, PauseCircle, Calendar, Sparkles, Loader2, Eye, EyeOff, Users } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../lib/api'
import { useAuth } from '../lib/auth'
import dayjs from 'dayjs'
import 'dayjs/locale/it'
dayjs.locale('it')

const STATO_FASE = {
  pianificata:  { label: 'Pianificata',  color: '#94a3b8', bg: 'bg-gray-100 text-gray-600',   icon: Clock       },
  in_corso:     { label: 'In Corso',     color: '#3b82f6', bg: 'bg-blue-100 text-blue-700',   icon: Clock       },
  completata:   { label: 'Completata',   color: '#22c55e', bg: 'bg-green-100 text-green-700', icon: CheckCircle2},
  in_ritardo:   { label: 'In Ritardo',   color: '#ef4444', bg: 'bg-red-100 text-red-700',     icon: AlertTriangle},
  sospesa:      { label: 'Sospesa',      color: '#f59e0b', bg: 'bg-yellow-100 text-yellow-700',icon: PauseCircle },
}

const COLORI_PRESET = ['#FF6B00','#3b82f6','#22c55e','#ef4444','#8b5cf6','#f59e0b','#06b6d4','#ec4899','#6b7280']
const CATEGORIE = ['lavorazione','fornitura','collaudo','amministrativo','impianti','struttura','finiture']

const fmtD = d => d ? dayjs(d).format('DD/MM') : '—'
const fmtDFull = d => d ? dayjs(d).format('DD/MM/YYYY') : '—'

export default function GanttTab({ cantiereId }) {
  const { utente } = useAuth()
  const qc = useQueryClient()
  const canWrite = ['admin','capo_cantiere','capo_cantiere_sub','direzione_lavori'].includes(utente?.ruolo)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [vista, setVista] = useState(() => window.innerWidth < 640 ? 'lista' : 'gantt')
  const [tooltipFase, setTooltipFase] = useState(null) // fase selezionata nel Gantt
  const [form, setForm] = useState({ nome:'', categoria:'lavorazione', colore:'#FF6B00', data_inizio:'', data_fine_prevista:'', sal_id:'', percentuale:0, stato:'pianificata', note:'', visibile_cliente: false })
  const setF = (k,v) => setForm(f => ({...f, [k]:v}))
  const [importando, setImportando] = useState(false)
  const [fasiImportate, setFasiImportate] = useState(null)
  // Conferma eliminazione (no confirm() nativo — non funziona su iOS PWA)
  const [confirmDialog, setConfirmDialog] = useState(null) // { ids: [], testo: '' }

  const { data: fasi = [], isLoading, isError, error } = useQuery(
    ['fasi', cantiereId],
    () => api.get(`/cantieri/${cantiereId}/fasi`).then(r => r.data),
    { staleTime: 0, retry: 1 }
  )
  const { data: salList = [] } = useQuery(
    ['sal', cantiereId],
    () => api.get(`/cantieri/${cantiereId}/sal`).then(r => r.data),
    { staleTime: 0, retry: 1 }
  )

  const createMutation = useMutation(
    d => api.post(`/cantieri/${cantiereId}/fasi`, d),
    { onSuccess: () => { qc.invalidateQueries(['fasi', cantiereId]); qc.invalidateQueries(['aggiornamenti-cliente', cantiereId]); chiudiForm(); toast.success('Fase aggiunta!') },
      onError: e => toast.error(e.response?.data?.detail || 'Errore') }
  )
  const updateMutation = useMutation(
    ({ id, data }) => api.put(`/cantieri/${cantiereId}/fasi/${id}`, data),
    { onSuccess: (_, variables) => {
        qc.invalidateQueries(['fasi', cantiereId])
        qc.invalidateQueries(['aggiornamenti-cliente', cantiereId])
        chiudiForm()
        if (variables.data?.visibile_cliente === true) toast.success('👁 Fase condivisa con il cliente')
        else if (variables.data?.visibile_cliente === false && Object.keys(variables.data).length === 1) toast.success('Fase nascosta al cliente')
        else toast.success('Aggiornato')
      },
      onError: e => toast.error(e.response?.data?.detail || 'Errore') }
  )
  const deleteMutation = useMutation(
    id => api.delete(`/cantieri/${cantiereId}/fasi/${id}`),
    { onSuccess: () => { qc.invalidateQueries(['fasi', cantiereId]); toast.success('Eliminata') } }
  )

  const chiudiForm = () => { setShowForm(false); setEditId(null); setForm({ nome:'',categoria:'lavorazione',colore:'#FF6B00',data_inizio:'',data_fine_prevista:'',sal_id:'',percentuale:0,stato:'pianificata',note:'',visibile_cliente:false }) }

  // Elimina con dialogo React (no confirm() nativo — bloccato su iOS PWA)
  const richiediElimina = (ids, testo) => setConfirmDialog({ ids: Array.isArray(ids) ? ids : [ids], testo: testo || 'Eliminare questa fase?' })
  const confermaCancella = () => {
    if (!confirmDialog) return
    confirmDialog.ids.forEach(id => deleteMutation.mutate(id))
    setConfirmDialog(null)
  }

  const importaGanttAI = async (file) => {
    setImportando(true)
    try {
      const fd = new FormData(); fd.append('file', file)
      const r = await api.post(`/cantieri/${cantiereId}/fasi/import-gantt`, fd, { headers: {'Content-Type':'multipart/form-data'} })
      setFasiImportate(r.data.fasi)
      toast.success(`${r.data.totale_fasi} fasi trovate — rivedi e conferma`)
    } catch(e) {
      toast.error(e.response?.data?.detail || 'Errore import')
    } finally { setImportando(false) }
  }

  const confermaImportGantt = async () => {
    let ok = 0
    for (const f of fasiImportate) {
      try {
        await api.post(`/cantieri/${cantiereId}/fasi`, {
          nome: f.nome,
          categoria: f.categoria || 'lavorazione',
          colore: f.colore || '#FF6B00',
          ordine: f.ordine || 0,
          data_inizio: f.data_inizio || null,
          data_fine_prevista: f.data_fine_prevista || null,
          percentuale: f.percentuale || 0,
          stato: f.stato || 'pianificata',
          note: f.note || null,
        })
        ok++
      } catch { /* continua con le altre */ }
    }
    qc.invalidateQueries(['fasi', cantiereId])
    setFasiImportate(null)
    toast.success(`${ok} fasi importate nel Gantt!`)
  }

  const apriModifica = (f) => {
    setEditId(f.id)
    setForm({ nome:f.nome, categoria:f.categoria||'lavorazione', colore:f.colore||'#FF6B00', data_inizio:f.data_inizio||'', data_fine_prevista:f.data_fine_prevista||'', sal_id:f.sal_id||'', percentuale:f.percentuale||0, stato:f.stato||'pianificata', note:f.note||'', visibile_cliente: f.visibile_cliente || false })
    setShowForm(true)
  }

  const salva = () => {
    const payload = { ...form, percentuale: parseFloat(form.percentuale)||0, sal_id: form.sal_id ? parseInt(form.sal_id) : null, data_inizio: form.data_inizio||null, data_fine_prevista: form.data_fine_prevista||null }
    if (editId) updateMutation.mutate({ id: editId, data: payload })
    else createMutation.mutate(payload)
  }

  if (isLoading) return <div className="text-center py-8 text-gray-400">Caricamento...</div>
  if (isError) return <div className="card text-center py-8 text-red-500">⚠️ Errore caricamento fasi: {error?.response?.data?.detail || error?.message || 'Errore sconosciuto'}</div>

  return (
    <div className="space-y-3">
      {/* Header con vista toggle */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          <button onClick={() => setVista('gantt')} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${vista==='gantt' ? 'bg-white shadow text-steelex-orange' : 'text-gray-500'}`}>
            📊 Gantt
          </button>
          <button onClick={() => setVista('lista')} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${vista==='lista' ? 'bg-white shadow text-steelex-orange' : 'text-gray-500'}`}>
            📋 Lista
          </button>
        </div>
        {canWrite && (
          <div className="flex gap-2">
            <label className={`flex items-center gap-1.5 py-2 px-3 rounded-xl text-sm font-medium cursor-pointer transition-colors ${importando ? 'bg-purple-100 text-purple-400' : 'bg-purple-600 text-white hover:bg-purple-700'}`}
              title="Importa Gantt da Excel, CSV, PDF o foto — Claude interpreta le fasi automaticamente">
              {importando ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              {importando ? '...' : 'Importa AI'}
              <input type="file" accept=".xlsx,.xls,.csv,.pdf,.png,.jpg,.jpeg,.webp" className="hidden"
                disabled={importando}
                onChange={e => e.target.files[0] && importaGanttAI(e.target.files[0])} />
            </label>
            <button onClick={() => { setShowForm(true); setEditId(null) }} className="btn-primary flex items-center gap-1.5 py-2 px-3 text-sm">
              <Plus size={16} /> Fase
            </button>
          </div>
        )}
      </div>

      {/* Modale anteprima fasi importate */}
      {fasiImportate && (
        <div className="card border-2 border-purple-300 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-purple-600" />
              <h3 className="font-bold text-purple-900">Claude ha trovato {fasiImportate.length} fasi</h3>
            </div>
            <button onClick={() => setFasiImportate(null)} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
          </div>
          <p className="text-xs text-purple-600 bg-purple-50 rounded-lg p-2">
            Rivedi le fasi estratte. Verranno aggiunte al Gantt esistente — puoi modificarle dopo la conferma.
          </p>
          <div className="max-h-72 overflow-y-auto space-y-1.5">
            {fasiImportate.map((f, i) => (
              <div key={i} className="flex items-center gap-2 py-1.5 border-b border-gray-100">
                <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: f.colore || '#ccc' }} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-900 truncate">{f.nome}</p>
                  <p className="text-xs text-gray-400">{f.categoria} · {f.data_inizio || '?'} → {f.data_fine_prevista || '?'}</p>
                </div>
                <div className="flex-shrink-0 text-right">
                  <span className="text-xs font-semibold text-steelex-orange">{f.percentuale}%</span>
                  {f.stato && f.stato !== 'pianificata' && (
                    <p className="text-xs text-gray-400">{f.stato}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="pt-1 border-t border-purple-100 flex justify-between items-center">
            <p className="text-xs text-gray-500">
              Range: {fasiImportate.filter(f=>f.data_inizio).map(f=>f.data_inizio).sort()[0] || '?'}
              {' → '}
              {fasiImportate.filter(f=>f.data_fine_prevista).map(f=>f.data_fine_prevista).sort().at(-1) || '?'}
            </p>
            <div className="flex gap-2">
              <button onClick={() => setFasiImportate(null)} className="btn-secondary text-sm py-1.5 px-3">Scarta</button>
              <button onClick={confermaImportGantt} className="btn-primary text-sm py-1.5 px-3 flex items-center gap-1">
                <CheckCircle2 size={14} /> Importa fasi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Form fase */}
      {showForm && (
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold">{editId ? 'Modifica Fase' : 'Nuova Fase'}</h3>
            <button onClick={chiudiForm}><X size={16} /></button>
          </div>
          <input className="input-field" placeholder="Nome fase *" value={form.nome} onChange={e => setF('nome', e.target.value)} autoFocus />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Categoria</label>
              <select className="input-field" value={form.categoria} onChange={e => setF('categoria', e.target.value)}>
                {CATEGORIE.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase()+c.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Colore</label>
              <div className="flex gap-1 flex-wrap">
                {COLORI_PRESET.map(c => (
                  <button key={c} onClick={() => setF('colore', c)}
                    style={{ background: c, width: 24, height: 24, borderRadius: 6, border: form.colore===c ? '3px solid #1a1a2e' : '2px solid transparent' }} />
                ))}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Data inizio</label>
              <input type="date" className="input-field" value={form.data_inizio} onChange={e => setF('data_inizio', e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Data fine prevista</label>
              <input type="date" className="input-field" value={form.data_fine_prevista} onChange={e => setF('data_fine_prevista', e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Avanzamento %</label>
              <div className="flex items-center gap-2">
                <input type="range" min="0" max="100" step="5" value={form.percentuale} onChange={e => setF('percentuale', e.target.value)} className="flex-1 accent-steelex-orange" />
                <span className="text-sm font-bold text-steelex-orange w-10">{form.percentuale}%</span>
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Collega a SAL</label>
              <select className="input-field" value={form.sal_id} onChange={e => setF('sal_id', e.target.value)}>
                <option value="">— nessuno —</option>
                {salList.map(s => <option key={s.id} value={s.id}>SAL #{s.numero} — {s.titolo}</option>)}
              </select>
            </div>
          </div>
          {/* Visibilità cliente */}
          <label className="flex items-center gap-2 cursor-pointer select-none py-1">
            <input type="checkbox" checked={!!form.visibile_cliente} onChange={e => setF('visibile_cliente', e.target.checked)}
              className="w-4 h-4 accent-steelex-orange" />
            <span className="text-sm text-gray-600">Mostra questa fase al cliente</span>
          </label>

          <div className="flex gap-2">
            <button onClick={chiudiForm} className="btn-secondary flex-1">Annulla</button>
            <button onClick={salva} disabled={!form.nome || createMutation.isLoading || updateMutation.isLoading} className="btn-primary flex-1">
              {createMutation.isLoading || updateMutation.isLoading ? 'Salvataggio...' : editId ? 'Aggiorna' : 'Aggiungi'}
            </button>
          </div>
        </div>
      )}

      {/* ── Dialogo conferma eliminazione (sostituisce confirm() nativo) ── */}
      {confirmDialog && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4 bg-black/50" onClick={() => setConfirmDialog(null)}>
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
                <Trash2 size={18} className="text-red-500" />
              </div>
              <p className="font-semibold text-gray-900">{confirmDialog.testo}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDialog(null)} className="btn-secondary flex-1">Annulla</button>
              <button onClick={confermaCancella} className="flex-1 py-2.5 px-4 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-xl transition-colors">
                Elimina
              </button>
            </div>
          </div>
        </div>
      )}

      {fasi.length === 0 ? (
        <div className="card text-center py-10 text-gray-400">
          <Calendar size={36} className="mx-auto mb-2 opacity-30" />
          <p className="font-medium">Nessuna fase pianificata</p>
          <p className="text-xs mt-1">Aggiungi le fasi di lavoro per costruire il cronoprogramma</p>
        </div>
      ) : vista === 'gantt' ? (
        <>
          {window.innerWidth < 640 && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-2.5 text-xs text-blue-700 flex items-center justify-between">
              <span>💡 Vista Lista più comoda su smartphone</span>
              <button onClick={() => setVista('lista')} className="font-semibold underline">Passa alla lista</button>
            </div>
          )}
          <GanttChart fasi={fasi} salList={salList} canWrite={canWrite}
            onEdit={apriModifica}
            onDelete={id => richiediElimina(id)}
            onUpdate={(id, data) => updateMutation.mutate({id, data})}
            onToggleCliente={(id, val) => updateMutation.mutate({ id, data: { visibile_cliente: val } })}
            tooltipFase={tooltipFase} setTooltipFase={setTooltipFase} />
        </>
      ) : (
        <ListaFasi fasi={fasi} salList={salList} canWrite={canWrite} onEdit={apriModifica}
          onDelete={id => richiediElimina(id)}
          onDeleteMultiple={(ids) => richiediElimina(ids, `Eliminare ${ids.length} fasi selezionate?`)}
          onUpdate={(id, data) => updateMutation.mutate({id, data})}
          onToggleCliente={(id, val) => updateMutation.mutate({ id, data: { visibile_cliente: val } })} />
      )}
    </div>
  )
}

/* ─── DIAGRAMMA DI GANTT ─── */
function GanttChart({ fasi, salList, canWrite, onEdit, onDelete, onUpdate, onToggleCliente, tooltipFase, setTooltipFase }) {
  const oggi = dayjs()
  const [zoom, setZoom] = useState('auto') // 'mesi' | 'settimane' | 'giorni' | 'auto'

  // Calcola range date totale
  const { minData, maxData, totalDays } = useMemo(() => {
    const date = fasi.flatMap(f => [f.data_inizio, f.data_fine_prevista, f.data_fine_reale].filter(Boolean).map(d => dayjs(d)))
    if (date.length === 0) return { minData: oggi.subtract(7,'day'), maxData: oggi.add(60,'day'), totalDays: 67 }
    const min = date.reduce((a,b) => a.isBefore(b)?a:b).subtract(3,'day')
    const max = date.reduce((a,b) => a.isAfter(b)?a:b).add(7,'day')
    return { minData: min, maxData: max, totalDays: max.diff(min,'day') + 1 }
  }, [fasi])

  // Zoom effettivo: auto sceglie in base alla durata totale
  const zoomEff = zoom === 'auto'
    ? (totalDays <= 45 ? 'giorni' : totalDays <= 150 ? 'settimane' : 'mesi')
    : zoom

  const toPercent = d => d ? Math.max(0, Math.min(100, (dayjs(d).diff(minData,'day') / totalDays) * 100)) : null
  const todayPct = Math.max(0, Math.min(100, (oggi.diff(minData,'day') / totalDays) * 100))

  // Bande dei mesi (riga 1 header)
  const mesiLabels = useMemo(() => {
    const labels = []
    let cur = minData.startOf('month')
    while (cur.isBefore(maxData) || cur.isSame(maxData, 'month')) {
      const startPct = Math.max(0, (cur.diff(minData,'day') / totalDays) * 100)
      const endPct = Math.min(100, (cur.add(1,'month').diff(minData,'day') / totalDays) * 100)
      if (endPct > 0 && startPct < 100)
        labels.push({ label: cur.format('MMM YYYY'), pct: startPct, widthPct: endPct - startPct })
      cur = cur.add(1,'month')
    }
    return labels
  }, [minData, maxData, totalDays])

  // Bande delle settimane (riga 2 header per zoom 'mesi' e 'settimane')
  const settimaneLabels = useMemo(() => {
    const labels = []
    // Inizia dal lunedì della settimana che contiene minData
    let cur = minData.startOf('week')
    let settN = 1
    let lastMonth = -1
    while (cur.isBefore(maxData)) {
      const startPct = Math.max(0, (cur.diff(minData,'day') / totalDays) * 100)
      const endPct = Math.min(100, (cur.add(7,'day').diff(minData,'day') / totalDays) * 100)
      if (endPct > 0 && startPct < 100) {
        // reset contatore settimane ad ogni nuovo mese
        if (cur.month() !== lastMonth) { settN = 1; lastMonth = cur.month() }
        labels.push({
          shortLabel: `S${settN}`,
          dateLabel: cur.format('D/M'),
          fullLabel: cur.format('D MMM'),
          pct: startPct,
          widthPct: endPct - startPct,
          isNewMonth: cur.date() <= 7,
        })
        settN++
      }
      cur = cur.add(7,'day')
    }
    return labels
  }, [minData, maxData, totalDays])

  // Singoli giorni (riga 2 header per zoom 'giorni', max 60 giorni visibili)
  const giorniLabels = useMemo(() => {
    if (zoomEff !== 'giorni') return []
    const labels = []
    for (let i = 0; i < totalDays; i++) {
      const d = minData.add(i, 'day')
      const pct = (i / totalDays) * 100
      const isWeekend = d.day() === 0 || d.day() === 6
      labels.push({ label: d.format('D'), dayOfWeek: d.format('dd')[0], pct, isWeekend, isMonday: d.day() === 1 })
    }
    return labels
  }, [minData, totalDays, zoomEff])

  const salMap = Object.fromEntries(salList.map(s => [s.id, s]))
  const LABEL_W = 180

  // Griglia verticale nel body: settimane o mesi
  const gridLines = zoomEff === 'giorni' ? settimaneLabels : (zoomEff === 'settimane' ? settimaneLabels : mesiLabels)

  return (
    <div className="card overflow-hidden p-0">
      {/* Tooltip nome completo al tap (mobile) */}
      {tooltipFase && (
        <div className="mx-3 mt-3 mb-0 bg-steelex-dark text-white rounded-xl p-3 flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-3 h-3 rounded-sm flex-shrink-0 mt-0.5" style={{ background: tooltipFase.colore || '#ccc' }} />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm leading-tight">{tooltipFase.nome}</p>
              <p className="text-xs text-gray-300 mt-0.5">{tooltipFase.categoria} · {fmtDFull(tooltipFase.data_inizio)} → {fmtDFull(tooltipFase.data_fine_prevista)}</p>
              {tooltipFase.note && <p className="text-xs text-gray-400 mt-0.5 italic">{tooltipFase.note}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {canWrite && (
              <button onClick={() => onToggleCliente(tooltipFase.id, !tooltipFase.visibile_cliente)}
                title={tooltipFase.visibile_cliente ? 'Visibile al cliente — nascondi' : 'Nascosto al cliente — condividi'}
                className={`p-1 rounded transition-colors ${tooltipFase.visibile_cliente ? 'text-blue-300 hover:text-blue-100' : 'text-gray-500 hover:text-blue-300'}`}>
                {tooltipFase.visibile_cliente ? <Eye size={15} /> : <EyeOff size={15} />}
              </button>
            )}
            {canWrite && <button onClick={() => { onEdit(tooltipFase); setTooltipFase(null) }} className="text-xs bg-steelex-orange px-2 py-1 rounded-lg font-medium">Modifica</button>}
            <button onClick={() => setTooltipFase(null)} className="text-gray-400 hover:text-white"><X size={16} /></button>
          </div>
        </div>
      )}

      {/* Zoom selector */}
      <div className="flex items-center gap-1.5 px-3 py-2 bg-gray-50 border-b border-gray-200">
        <span className="text-xs text-gray-400 mr-1">Scala:</span>
        {['giorni','settimane','mesi'].map(z => (
          <button key={z} onClick={() => setZoom(zoom === z ? 'auto' : z)}
            className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-colors border ${
              zoomEff === z ? 'bg-steelex-orange text-white border-steelex-orange' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:bg-gray-100'
            }`}>
            {z.charAt(0).toUpperCase() + z.slice(1)}
          </button>
        ))}
        <span className="ml-auto text-xs text-gray-400">{totalDays} giorni tot.</span>
      </div>

      <div className="overflow-x-auto">
        <div style={{ minWidth: 500 }}>

          {/* ── RIGA 1: MESI — sfondo scuro, testo bianco ───────────────── */}
          <div className="relative border-b-2 border-gray-400 h-8 flex" style={{ background: '#1e293b' }}>
            {/* Label colonna sinistra */}
            <div className="flex-shrink-0 flex items-center px-3 border-r-2 border-gray-600 z-10" style={{ width: LABEL_W }}>
              <span className="text-xs font-bold text-gray-300 uppercase tracking-widest">Fase</span>
            </div>
            <div className="relative flex-1">
              {mesiLabels.map((m, i) => (
                <div key={i} className="absolute inset-y-0 flex items-center overflow-hidden border-r border-gray-600"
                  style={{ left: `${m.pct}%`, width: `${m.widthPct}%` }}>
                  <span className="text-xs font-bold text-white px-2 truncate uppercase tracking-wider">{m.label}</span>
                </div>
              ))}
              {/* Linea oggi */}
              <div className="absolute top-0 bottom-0 w-0.5 bg-steelex-orange z-10" style={{ left: `${todayPct}%` }} />
            </div>
          </div>

          {/* ── RIGA 2: SETTIMANE / GIORNI ───────────────────────────────── */}
          <div className="relative border-b-2 border-gray-300 h-7 flex" style={{ background: '#f1f5f9' }}>
            <div className="flex-shrink-0 border-r-2 border-gray-300" style={{ width: LABEL_W, background: '#f1f5f9' }} />
            <div className="relative flex-1">
              {zoomEff === 'giorni'
                /* ── Giorni: un box per giorno, weekend evidenziato ── */
                ? giorniLabels.map((g, i) => (
                  <div key={i}
                    className={`absolute inset-y-0 flex items-center justify-center
                      ${g.isMonday ? 'border-l-2 border-gray-400' : 'border-l border-gray-200'}
                      ${g.isWeekend ? 'bg-orange-100' : ''}`}
                    style={{ left: `${g.pct}%`, width: `${100/totalDays}%` }}>
                    <span className={`font-semibold leading-none select-none
                      ${g.isWeekend ? 'text-orange-500' : 'text-gray-600'}`}
                      style={{ fontSize: 10 }}>
                      {g.label}
                    </span>
                  </div>
                ))
                /* ── Settimane/Mesi: una banda per settimana ── */
                : settimaneLabels.map((s, i) => (
                  <div key={i}
                    className={`absolute inset-y-0 flex items-center overflow-hidden
                      ${s.isNewMonth ? 'border-l-2 border-gray-500' : 'border-l border-gray-300'}`}
                    style={{ left: `${s.pct}%`, width: `${s.widthPct}%` }}>
                    <span className="font-medium text-gray-600 px-1.5 truncate" style={{ fontSize: 11 }}>
                      {zoomEff === 'mesi' ? s.shortLabel : s.fullLabel}
                    </span>
                  </div>
                ))
              }
              {/* Linea oggi con etichetta */}
              <div className="absolute top-0 bottom-0 w-0.5 bg-steelex-orange z-10" style={{ left: `${todayPct}%` }}>
                <div className="absolute top-0.5 left-1 text-steelex-orange font-bold whitespace-nowrap" style={{ fontSize: 9 }}>oggi</div>
              </div>
            </div>
          </div>

          {/* ── RIGHE FASI ───────────────────────────────────────────────── */}
          {fasi.map(f => {
            const startPct = toPercent(f.data_inizio)
            const endPct   = toPercent(f.data_fine_prevista || f.data_fine_reale)
            const width    = startPct !== null && endPct !== null ? Math.max(endPct - startPct, 0.8) : null
            const statoInfo = STATO_FASE[f.stato] || STATO_FASE.pianificata
            const sal = f.sal_id ? salMap[f.sal_id] : null
            const isSelected = tooltipFase?.id === f.id

            return (
              <div key={f.id}
                className={`relative flex items-center border-b border-gray-100 group cursor-pointer transition-colors ${isSelected ? 'bg-orange-50' : 'hover:bg-gray-50'}`}
                style={{ height: 48 }}
                onClick={() => setTooltipFase(isSelected ? null : f)}>

                {/* Label sinistra */}
                <div style={{ width: LABEL_W, background: isSelected ? '#fff7ed' : undefined }}
                  className="flex-shrink-0 px-2 flex items-center gap-1.5 overflow-hidden border-r-2 border-gray-200">
                  <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: f.colore || '#ccc' }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-800 leading-tight"
                      style={{ display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>
                      {f.nome}
                    </p>
                  </div>
                  {canWrite && (
                    <button onClick={e => { e.stopPropagation(); onEdit(f) }}
                      className="hidden group-hover:block ml-auto text-gray-400 hover:text-steelex-orange flex-shrink-0">
                      <Edit2 size={11} />
                    </button>
                  )}
                </div>

                {/* Area Gantt */}
                <div className="flex-1 relative h-full overflow-hidden">
                  {/* 1. Bande weekend (sotto tutto) */}
                  {zoomEff === 'giorni' && giorniLabels.filter(g => g.isWeekend).map((g, i) => (
                    <div key={i} className="absolute top-0 bottom-0"
                      style={{ left:`${g.pct}%`, width:`${100/totalDays}%`, background:'rgba(251,146,60,0.08)' }} />
                  ))}
                  {/* 2. Linee griglia: settimanali più spesse, giornaliere sottili */}
                  {zoomEff === 'giorni'
                    ? giorniLabels.map((g, i) => (
                      <div key={i} className="absolute top-0 bottom-0"
                        style={{ left:`${g.pct}%`, width: g.isMonday ? 1.5 : 1, background: g.isMonday ? '#94a3b8' : '#e2e8f0' }} />
                    ))
                    : gridLines.map((g, i) => (
                      <div key={i} className="absolute top-0 bottom-0"
                        style={{ left:`${g.pct}%`, width: g.isNewMonth ? 2 : 1, background: g.isNewMonth ? '#64748b' : '#cbd5e1' }} />
                    ))
                  }
                  {/* 3. Linea oggi — arancione piena */}
                  <div className="absolute top-0 bottom-0 z-10"
                    style={{ left:`${todayPct}%`, width:2, background:'#FF6B00' }} />

                  {/* Barra fase */}
                  {width !== null && startPct !== null && (
                    <div className="absolute top-2.5 h-7 rounded-md flex items-center overflow-hidden shadow-sm"
                      style={{ left:`${startPct}%`, width:`${width}%`, background: f.colore||'#ccc', opacity: f.stato==='sospesa' ? 0.55 : 1 }}>
                      <div className="h-full bg-black/20" style={{ width:`${f.percentuale}%` }} />
                      <span className="absolute inset-0 flex items-center px-2 text-white text-xs font-bold drop-shadow">
                        {width > 5 ? `${f.percentuale}%` : ''}
                      </span>
                    </div>
                  )}

                  {/* Milestone SAL */}
                  {sal && sal.data && (() => {
                    const salPct = toPercent(sal.data)
                    return salPct !== null ? (
                      <div className="absolute top-0 bottom-0 flex flex-col items-center z-10" style={{ left:`${salPct}%` }}>
                        <div className="w-px h-full bg-blue-500 opacity-70" />
                        <div className="absolute top-1 w-3 h-3 bg-blue-500 rotate-45 -translate-x-1.5 rounded-sm"
                          title={`SAL #${sal.numero}: ${sal.titolo}`} />
                      </div>
                    ) : null
                  })()}
                </div>

                {/* % destra */}
                <div className="w-14 flex-shrink-0 px-1 text-right">
                  <span className={`text-xs px-1 py-0.5 rounded-full ${statoInfo.bg}`}>{f.percentuale}%</span>
                </div>
              </div>
            )
          })}

          {/* Legenda SAL */}
          {salList.filter(s => s.data).length > 0 && (
            <div className="px-4 py-2 bg-gray-50 border-t flex gap-4 flex-wrap">
              <span className="text-xs text-gray-400 font-medium">Milestone SAL:</span>
              {salList.filter(s => s.data).map(s => (
                <div key={s.id} className="flex items-center gap-1 text-xs text-blue-600">
                  <div className="w-2.5 h-2.5 bg-blue-500 rotate-45 rounded-sm" />
                  SAL #{s.numero} {fmtD(s.data)}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Legenda stati */}
      <div className="px-4 py-2 border-t flex gap-3 flex-wrap">
        {Object.entries(STATO_FASE).map(([k,v]) => (
          <div key={k} className="flex items-center gap-1 text-xs text-gray-500">
            <div className="w-3 h-3 rounded-sm" style={{ background: v.color }} />
            {v.label}
          </div>
        ))}
      </div>
    </div>
  )
}


/* ─── VISTA LISTA — card singola con swipe-to-delete ─── */
function FaseCard({ f, sal, canWrite, onEdit, onDelete, onUpdate, onSelect, selezionato, modalitaSelect, onToggleCliente }) {
  const oggi = dayjs()
  const statoInfo = STATO_FASE[f.stato] || STATO_FASE.pianificata
  const ritardo = f.data_fine_prevista && dayjs(f.data_fine_prevista).isBefore(oggi) && f.percentuale < 100
  const touchStartX = useRef(0)
  const [swiped, setSwiped] = useState(false)

  const handleTouchStart = (e) => { touchStartX.current = e.touches[0].clientX }
  const handleTouchEnd = (e) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current
    if (dx < -55) setSwiped(true)
    else if (dx > 20) setSwiped(false)
  }

  return (
    <div className="relative overflow-hidden rounded-2xl" style={{ background: '#ef4444' }}>
      {/* Pannello elimina (rivelato dallo swipe) */}
      <div className="absolute right-0 top-0 bottom-0 w-20 flex items-center justify-center">
        <button
          onClick={() => onDelete(f.id)}
          className="flex flex-col items-center text-white gap-1"
        >
          <Trash2 size={20} />
          <span className="text-xs font-medium">Elimina</span>
        </button>
      </div>

      {/* Card principale */}
      <div
        className={`bg-white rounded-2xl space-y-2 select-none p-4 transition-transform duration-200 ${swiped ? '-translate-x-20' : 'translate-x-0'} ${selezionato ? 'ring-2 ring-steelex-orange' : ''}`}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onClick={() => { if (modalitaSelect) onSelect(f.id) }}
      >
        <div className="flex items-start justify-between gap-2">
          {/* Checkbox selezione multipla */}
          {modalitaSelect && canWrite && (
            <input type="checkbox" checked={!!selezionato} onChange={() => onSelect(f.id)}
              className="w-5 h-5 accent-steelex-orange flex-shrink-0 mt-0.5" onClick={e => e.stopPropagation()} />
          )}

          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-4 h-4 rounded-sm flex-shrink-0 mt-0.5" style={{ background: f.colore || '#ccc' }} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="font-semibold text-gray-900 truncate">{f.nome}</p>
                {canWrite && (
                  <button
                    onClick={e => { e.stopPropagation(); onToggleCliente(f.id, !f.visibile_cliente) }}
                    title={f.visibile_cliente ? 'Visibile al cliente — clicca per nascondere' : 'Nascosto al cliente — clicca per condividere'}
                    className={`flex-shrink-0 p-0.5 rounded transition-colors ${f.visibile_cliente ? 'text-blue-500 hover:text-blue-700' : 'text-gray-300 hover:text-blue-400'}`}
                  >
                    {f.visibile_cliente ? <Eye size={14} /> : <EyeOff size={14} />}
                  </button>
                )}
              </div>
              <p className="text-xs text-gray-400">{f.categoria} {sal ? `• SAL #${sal.numero}` : ''}</p>
            </div>
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statoInfo.bg}`}>{statoInfo.label}</span>
            {canWrite && !modalitaSelect && (
              <>
                <button
                  onClick={e => { e.stopPropagation(); onEdit(f) }}
                  className="p-1.5 text-gray-400 hover:text-steelex-orange hover:bg-orange-50 rounded-lg transition-colors"
                >
                  <Edit2 size={15} />
                </button>
                <button
                  onClick={e => { e.stopPropagation(); onDelete(f.id) }}
                  className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 size={15} />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Barra avanzamento */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-gray-500">
            <span>{fmtD(f.data_inizio)} → {fmtD(f.data_fine_prevista)}</span>
            <span className={`font-medium ${ritardo ? 'text-red-500' : 'text-steelex-orange'}`}>{f.percentuale}%</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div className="h-2 rounded-full transition-all" style={{ width: `${f.percentuale}%`, background: f.colore || '#FF6B00' }} />
          </div>
          {ritardo && <p className="text-xs text-red-500">⚠️ In ritardo di {oggi.diff(dayjs(f.data_fine_prevista), 'day')} giorni</p>}
        </div>

        {/* Aggiorna % rapido */}
        {canWrite && !modalitaSelect && f.percentuale < 100 && (
          <div className="flex gap-1 flex-wrap">
            {[25, 50, 75, 100].filter(p => p > f.percentuale).map(p => (
              <button key={p}
                onClick={e => { e.stopPropagation(); onUpdate(f.id, { percentuale: p }) }}
                className="text-xs px-2 py-1 bg-gray-100 hover:bg-steelex-orange hover:text-white rounded-lg transition-colors">
                → {p}%
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── VISTA LISTA ─── */
function ListaFasi({ fasi, salList, canWrite, onEdit, onDelete, onDeleteMultiple, onUpdate, onToggleCliente }) {
  const salMap = Object.fromEntries(salList.map(s => [s.id, s]))
  const [modalitaSelect, setModalitaSelect] = useState(false)
  const [selezionati, setSelezionati] = useState(new Set())

  const toggleSelect = (id) => {
    setSelezionati(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  const eliminaSelezionati = () => {
    const ids = Array.from(selezionati)
    onDeleteMultiple(ids)
    setSelezionati(new Set())
    setModalitaSelect(false)
  }

  return (
    <div className="space-y-2">
      {/* Toolbar selezione multipla */}
      {canWrite && (
        <div className="flex items-center justify-between">
          {modalitaSelect ? (
            <>
              <p className="text-sm text-gray-600 font-medium">
                {selezionati.size > 0 ? `${selezionati.size} selezionate` : 'Tocca per selezionare'}
              </p>
              <div className="flex gap-2">
                {selezionati.size > 0 && (
                  <button onClick={eliminaSelezionati}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500 text-white rounded-xl text-sm font-medium">
                    <Trash2 size={14} /> Elimina ({selezionati.size})
                  </button>
                )}
                <button onClick={() => { setModalitaSelect(false); setSelezionati(new Set()) }}
                  className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium">
                  Annulla
                </button>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2 ml-auto">
              <p className="text-xs text-gray-400 hidden sm:block">← Scorri per eliminare</p>
              <button onClick={() => setModalitaSelect(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors">
                <Users size={13} /> Seleziona
              </button>
            </div>
          )}
        </div>
      )}

      {fasi.map(f => (
        <FaseCard
          key={f.id}
          f={f}
          sal={f.sal_id ? salMap[f.sal_id] : null}
          canWrite={canWrite}
          onEdit={onEdit}
          onDelete={onDelete}
          onUpdate={onUpdate}
          onToggleCliente={onToggleCliente}
          onSelect={toggleSelect}
          selezionato={selezionati.has(f.id)}
          modalitaSelect={modalitaSelect}
        />
      ))}
    </div>
  )
}
