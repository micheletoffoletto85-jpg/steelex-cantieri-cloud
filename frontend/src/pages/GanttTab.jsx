/**
 * Diagramma di Gantt + Cronoprogramma
 * Collega le fasi di lavoro ai SAL (Stato Avanzamento Lavori)
 */
import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { Plus, Trash2, X, Edit2, Save, AlertTriangle, CheckCircle2, Clock, PauseCircle, Calendar, Sparkles, Loader2 } from 'lucide-react'
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
  const canWrite = ['admin','capo_cantiere'].includes(utente?.ruolo)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [vista, setVista] = useState('gantt') // gantt | lista
  const [form, setForm] = useState({ nome:'', categoria:'lavorazione', colore:'#FF6B00', data_inizio:'', data_fine_prevista:'', sal_id:'', percentuale:0, stato:'pianificata', note:'' })
  const setF = (k,v) => setForm(f => ({...f, [k]:v}))
  const [importando, setImportando] = useState(false)
  const [fasiImportate, setFasiImportate] = useState(null)

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
    { onSuccess: () => { qc.invalidateQueries(['fasi', cantiereId]); chiudiForm(); toast.success('Fase aggiunta!') },
      onError: e => toast.error(e.response?.data?.detail || 'Errore') }
  )
  const updateMutation = useMutation(
    ({ id, data }) => api.put(`/cantieri/${cantiereId}/fasi/${id}`, data),
    { onSuccess: () => { qc.invalidateQueries(['fasi', cantiereId]); chiudiForm(); toast.success('Aggiornato') },
      onError: e => toast.error(e.response?.data?.detail || 'Errore') }
  )
  const deleteMutation = useMutation(
    id => api.delete(`/cantieri/${cantiereId}/fasi/${id}`),
    { onSuccess: () => { qc.invalidateQueries(['fasi', cantiereId]); toast.success('Eliminata') } }
  )

  const chiudiForm = () => { setShowForm(false); setEditId(null); setForm({ nome:'',categoria:'lavorazione',colore:'#FF6B00',data_inizio:'',data_fine_prevista:'',sal_id:'',percentuale:0,stato:'pianificata',note:'' }) }

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
    setForm({ nome:f.nome, categoria:f.categoria||'lavorazione', colore:f.colore||'#FF6B00', data_inizio:f.data_inizio||'', data_fine_prevista:f.data_fine_prevista||'', sal_id:f.sal_id||'', percentuale:f.percentuale||0, stato:f.stato||'pianificata', note:f.note||'' })
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
          <div className="flex gap-2">
            <button onClick={chiudiForm} className="btn-secondary flex-1">Annulla</button>
            <button onClick={salva} disabled={!form.nome || createMutation.isLoading || updateMutation.isLoading} className="btn-primary flex-1">
              {createMutation.isLoading || updateMutation.isLoading ? 'Salvataggio...' : editId ? 'Aggiorna' : 'Aggiungi'}
            </button>
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
        <GanttChart fasi={fasi} salList={salList} canWrite={canWrite} onEdit={apriModifica} onDelete={id => confirm('Eliminare fase?') && deleteMutation.mutate(id)} onUpdate={(id, data) => updateMutation.mutate({id, data})} />
      ) : (
        <ListaFasi fasi={fasi} salList={salList} canWrite={canWrite} onEdit={apriModifica} onDelete={id => confirm('Eliminare fase?') && deleteMutation.mutate(id)} onUpdate={(id, data) => updateMutation.mutate({id, data})} />
      )}
    </div>
  )
}

/* ─── DIAGRAMMA DI GANTT ─── */
function GanttChart({ fasi, salList, canWrite, onEdit, onDelete, onUpdate }) {
  const oggi = dayjs()

  // Calcola range date totale
  const { minData, maxData, totalDays } = useMemo(() => {
    const date = fasi.flatMap(f => [f.data_inizio, f.data_fine_prevista, f.data_fine_reale].filter(Boolean).map(d => dayjs(d)))
    if (date.length === 0) return { minData: oggi.subtract(7,'day'), maxData: oggi.add(60,'day'), totalDays: 67 }
    const min = date.reduce((a,b) => a.isBefore(b)?a:b).subtract(3,'day')
    const max = date.reduce((a,b) => a.isAfter(b)?a:b).add(7,'day')
    return { minData: min, maxData: max, totalDays: max.diff(min,'day') + 1 }
  }, [fasi])

  const toPercent = d => d ? Math.max(0, Math.min(100, (dayjs(d).diff(minData,'day') / totalDays) * 100)) : null
  const todayPct = Math.max(0, Math.min(100, (oggi.diff(minData,'day') / totalDays) * 100))

  // Genera etichette mesi sull'asse X
  const mesiLabels = useMemo(() => {
    const labels = []
    let cur = minData.startOf('month')
    while (cur.isBefore(maxData)) {
      const pct = toPercent(cur.format('YYYY-MM-DD'))
      if (pct !== null && pct >= 0 && pct <= 100)
        labels.push({ label: cur.format('MMM YY'), pct })
      cur = cur.add(1,'month')
    }
    return labels
  }, [minData, maxData, totalDays])

  // Raggruppa fasi per SAL
  const salMap = Object.fromEntries(salList.map(s => [s.id, s]))

  return (
    <div className="card overflow-hidden p-0">
      <div className="overflow-x-auto">
        <div style={{ minWidth: 600 }}>
          {/* Header: asse X (mesi) */}
          <div className="relative bg-gray-50 border-b border-gray-200 h-8 flex items-end pb-1 px-[160px]">
            {mesiLabels.map((m, i) => (
              <div key={i} className="absolute text-xs text-gray-400 font-medium" style={{ left: `calc(160px + ${m.pct}%)` }}>
                {m.label}
              </div>
            ))}
            {/* Linea oggi */}
            <div className="absolute top-0 bottom-0 w-px bg-steelex-orange" style={{ left: `calc(160px + ${todayPct}%)` }}>
              <div className="absolute -top-0 left-1 text-xs text-steelex-orange font-bold whitespace-nowrap">oggi</div>
            </div>
          </div>

          {/* Righe fasi */}
          {fasi.map(f => {
            const startPct = toPercent(f.data_inizio)
            const endPct = toPercent(f.data_fine_prevista || f.data_fine_reale)
            const width = startPct !== null && endPct !== null ? Math.max(endPct - startPct, 1) : null
            const statoInfo = STATO_FASE[f.stato] || STATO_FASE.pianificata
            const sal = f.sal_id ? salMap[f.sal_id] : null

            return (
              <div key={f.id} className="relative flex items-center border-b border-gray-100 hover:bg-gray-50 group" style={{ height: 44 }}>
                {/* Label sinistra */}
                <div className="w-40 flex-shrink-0 px-2 flex items-center gap-1.5 overflow-hidden">
                  <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: f.colore || '#ccc' }} />
                  <span className="text-xs font-medium text-gray-800 truncate">{f.nome}</span>
                  {canWrite && (
                    <button onClick={() => onEdit(f)} className="hidden group-hover:block ml-auto text-gray-400 hover:text-steelex-orange flex-shrink-0">
                      <Edit2 size={11} />
                    </button>
                  )}
                </div>

                {/* Area Gantt */}
                <div className="flex-1 relative h-full">
                  {/* Griglia verticale mesi */}
                  {mesiLabels.map((m, i) => (
                    <div key={i} className="absolute top-0 bottom-0 w-px bg-gray-100" style={{ left: `${m.pct}%` }} />
                  ))}
                  {/* Linea oggi */}
                  <div className="absolute top-0 bottom-0 w-px bg-steelex-orange opacity-40" style={{ left: `${todayPct}%` }} />

                  {/* Barra fase */}
                  {width !== null && startPct !== null && (
                    <div className="absolute top-2 h-7 rounded-md flex items-center overflow-hidden cursor-pointer group/bar"
                      style={{ left: `${startPct}%`, width: `${width}%`, background: f.colore || '#ccc', opacity: f.stato === 'sospesa' ? 0.5 : 1 }}
                      onClick={() => canWrite && onEdit(f)}
                      title={`${f.nome}\n${fmtDFull(f.data_inizio)} → ${fmtDFull(f.data_fine_prevista)}\n${f.percentuale}%`}>
                      {/* Barra avanzamento */}
                      <div className="h-full bg-black/20" style={{ width: `${f.percentuale}%` }} />
                      {/* Testo */}
                      <span className="absolute inset-0 flex items-center px-2 text-white text-xs font-medium truncate drop-shadow">
                        {width > 8 ? `${f.percentuale}%` : ''}
                      </span>
                    </div>
                  )}

                  {/* Milestone SAL — linea verticale con diamante */}
                  {sal && sal.data && (() => {
                    const salPct = toPercent(sal.data)
                    return salPct !== null ? (
                      <div className="absolute top-0 bottom-0 flex flex-col items-center" style={{ left: `${salPct}%` }}>
                        <div className="w-px h-full bg-blue-500 opacity-60" />
                        <div className="absolute top-1 w-3 h-3 bg-blue-500 rotate-45 -translate-x-1.5 rounded-sm" title={`SAL #${sal.numero}: ${sal.titolo}`} />
                      </div>
                    ) : null
                  })()}
                </div>

                {/* Info destra */}
                <div className="w-16 flex-shrink-0 px-2 text-right">
                  <span className={`text-xs px-1 py-0.5 rounded-full ${statoInfo.bg}`}>{f.percentuale}%</span>
                </div>
              </div>
            )
          })}

          {/* Legenda SAL in fondo */}
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
            <div className="w-3 h-3 rounded-sm" style={{background: v.color}} />
            {v.label}
          </div>
        ))}
      </div>
    </div>
  )
}

/* ─── VISTA LISTA ─── */
function ListaFasi({ fasi, salList, canWrite, onEdit, onDelete, onUpdate }) {
  const salMap = Object.fromEntries(salList.map(s => [s.id, s]))
  const oggi = dayjs()

  return (
    <div className="space-y-2">
      {fasi.map(f => {
        const sal = f.sal_id ? salMap[f.sal_id] : null
        const statoInfo = STATO_FASE[f.stato] || STATO_FASE.pianificata
        const ritardo = f.data_fine_prevista && dayjs(f.data_fine_prevista).isBefore(oggi) && f.percentuale < 100

        return (
          <div key={f.id} className="card space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <div className="w-4 h-4 rounded-sm flex-shrink-0 mt-0.5" style={{ background: f.colore || '#ccc' }} />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 truncate">{f.nome}</p>
                  <p className="text-xs text-gray-400">{f.categoria} {sal ? `• SAL #${sal.numero}` : ''}</p>
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statoInfo.bg}`}>{statoInfo.label}</span>
                {canWrite && <>
                  <button onClick={() => onEdit(f)} className="p-1 text-gray-400 hover:text-steelex-orange"><Edit2 size={14} /></button>
                  <button onClick={() => onDelete(f.id)} className="p-1 text-gray-300 hover:text-red-500"><Trash2 size={14} /></button>
                </>}
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
              {ritardo && <p className="text-xs text-red-500">⚠️ In ritardo di {oggi.diff(dayjs(f.data_fine_prevista),'day')} giorni</p>}
            </div>

            {/* Aggiorna % rapido */}
            {canWrite && f.percentuale < 100 && (
              <div className="flex gap-1 flex-wrap">
                {[25,50,75,100].filter(p => p > f.percentuale).map(p => (
                  <button key={p} onClick={() => onUpdate(f.id, { percentuale: p })}
                    className="text-xs px-2 py-1 bg-gray-100 hover:bg-steelex-orange hover:text-white rounded-lg transition-colors">
                    → {p}%
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
