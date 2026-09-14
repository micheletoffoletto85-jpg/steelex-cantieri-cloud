/**
 * Tab "Contabilità misure" — libretto delle misure di cantiere.
 * Capocantiere e admin registrano le misure prese in cantiere, agganciate alle
 * voci del computo. Il riepilogo (qt computo vs qt misurata) confluisce nel
 * verbale di chiusura; il dettaglio si scarica come "Libretto delle misure" PDF.
 */
import { useState, useEffect, useMemo, useRef, Fragment } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { PencilRuler, Plus, Trash2, Pencil, FileText, Loader2, Camera, X, AlertTriangle, ChevronDown } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../lib/api'
import dayjs from 'dayjs'

const RUOLI_MISURE = ['admin', 'amministrazione', 'capo_cantiere']
const nf = (x) => (x === null || x === undefined || x === '' ? '—'
  : Number(x).toLocaleString('it-IT', { maximumFractionDigits: 3 }))

const vuoto = () => ({
  voce_id: '', descrizione: '', parti: 1, lunghezza: '', larghezza: '', altezza: '',
  quantita: '', quantita_manuale: false, data_misura: dayjs().format('YYYY-MM-DD'), note: '',
})

function calcAuto(f) {
  let q = parseFloat(f.parti) || 1
  for (const d of [f.lunghezza, f.larghezza, f.altezza]) {
    const n = parseFloat(d)
    if (n) q *= n
  }
  return Math.round(q * 1000) / 1000
}

export default function MisureTab({ cantiereId, utente }) {
  const qc = useQueryClient()
  const abilitato = RUOLI_MISURE.includes(utente?.ruolo)

  const { data, isLoading } = useQuery(
    ['misure', cantiereId],
    () => api.get(`/cantieri/${cantiereId}/misure`).then(r => r.data),
    { enabled: abilitato, staleTime: 0 },
  )

  const [form, setForm] = useState(null)      // form aperto (create/edit)
  const [editId, setEditId] = useState(null)
  const [apri, setApri] = useState({})        // voce_id → dettaglio aperto
  const [scaricando, setScaricando] = useState(false)

  const voci = data?.voci || []
  const misure = data?.misure || []
  const riep = data?.riepilogo || []

  const misurePerVoce = useMemo(() => {
    const m = {}
    for (const x of misure) (m[x.voce_id || ''] ||= []).push(x)
    return m
  }, [misure])

  const salva = useMutation(
    (body) => editId
      ? api.put(`/cantieri/${cantiereId}/misure/${editId}`, body)
      : api.post(`/cantieri/${cantiereId}/misure`, body),
    {
      onSuccess: () => {
        qc.invalidateQueries(['misure', cantiereId])
        qc.invalidateQueries(['chiusura', cantiereId])
        toast.success(editId ? 'Misura aggiornata' : 'Misura registrata')
        setForm(null); setEditId(null)
      },
      onError: (e) => toast.error(e.response?.data?.detail || 'Errore nel salvataggio'),
    },
  )

  const elimina = useMutation(
    (id) => api.delete(`/cantieri/${cantiereId}/misure/${id}`),
    {
      onSuccess: () => {
        qc.invalidateQueries(['misure', cantiereId])
        qc.invalidateQueries(['chiusura', cantiereId])
        toast.success('Misura eliminata')
      },
      onError: () => toast.error('Errore'),
    },
  )

  const apriNuova = () => { setEditId(null); setForm(vuoto()) }
  const apriModifica = (m) => {
    setEditId(m.id)
    setForm({
      voce_id: m.voce_id || '', descrizione: m.descrizione || '', parti: m.parti ?? 1,
      lunghezza: m.lunghezza ?? '', larghezza: m.larghezza ?? '', altezza: m.altezza ?? '',
      quantita: m.quantita ?? '', quantita_manuale: !!m.quantita_manuale,
      data_misura: m.data_misura || dayjs().format('YYYY-MM-DD'), note: m.note || '',
    })
  }

  const submit = () => {
    if (!form.descrizione.trim()) { toast.error('Scrivi dove/cosa hai misurato'); return }
    salva.mutate({
      voce_id: form.voce_id || null,
      descrizione: form.descrizione.trim(),
      parti: parseFloat(form.parti) || 1,
      lunghezza: form.lunghezza === '' ? null : parseFloat(form.lunghezza),
      larghezza: form.larghezza === '' ? null : parseFloat(form.larghezza),
      altezza: form.altezza === '' ? null : parseFloat(form.altezza),
      quantita: form.quantita_manuale ? (parseFloat(form.quantita) || 0) : null,
      quantita_manuale: form.quantita_manuale,
      data_misura: form.data_misura || null,
      note: form.note.trim() || null,
    })
  }

  const scaricaPdf = async () => {
    setScaricando(true)
    try {
      const resp = await api.get(`/cantieri/${cantiereId}/misure/report.pdf`, { responseType: 'blob', timeout: 90000 })
      const url = URL.createObjectURL(resp.data)
      const a = document.createElement('a')
      a.href = url
      a.download = resp.headers['content-disposition']?.match(/filename="(.+)"/)?.[1] || 'libretto_misure.pdf'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Errore generazione PDF')
    } finally {
      setScaricando(false)
    }
  }

  if (!abilitato) return <div className="card text-center py-10 text-gray-400">Sezione riservata ad admin e capocantiere.</div>
  if (isLoading) return <div className="text-center py-10 text-gray-400">Caricamento...</div>

  return (
    <div className="space-y-4">
      {/* Intestazione */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <PencilRuler size={16} className="text-steelex-orange" /> Contabilità misure
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">Libretto delle misure prese in cantiere — confluisce nel verbale di chiusura</p>
        </div>
        <button onClick={scaricaPdf} disabled={scaricando || misure.length === 0}
          className="btn-secondary text-sm py-2 px-3 flex items-center gap-1.5 shrink-0 disabled:opacity-50">
          {scaricando ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
          Libretto PDF
        </button>
      </div>

      {!data?.computo_presente && (
        <div className="card bg-amber-50 border-amber-200 text-amber-800 text-sm flex items-start gap-2">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>Nessun computo accettato su questo cantiere. Puoi comunque registrare misure "senza voce", ma il confronto con le quantità di computo non sarà disponibile.</span>
        </div>
      )}

      {/* Riepilogo per voce */}
      <div className="card space-y-2">
        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Riepilogo — computo vs misurato</p>
        {riep.length === 0 ? (
          <p className="text-sm text-gray-400 py-3 text-center">Nessuna misura registrata.</p>
        ) : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-sm min-w-[520px]">
              <thead>
                <tr className="text-[11px] uppercase text-gray-400 text-left">
                  <th className="py-1.5 px-1 font-semibold">Voce</th>
                  <th className="py-1.5 px-1 font-semibold">U.M.</th>
                  <th className="py-1.5 px-1 font-semibold text-right">Qt computo</th>
                  <th className="py-1.5 px-1 font-semibold text-right">Qt misurata</th>
                  <th className="py-1.5 px-1 font-semibold text-right">Scostam.</th>
                  <th className="py-1.5 px-1 font-semibold text-right">N.</th>
                  <th className="w-6" />
                </tr>
              </thead>
              <tbody>
                {riep.map((r) => {
                  const key = r.voce_id || ''
                  const dett = misurePerVoce[key] || []
                  const sc = r.scostamento
                  const scColor = sc == null ? 'text-gray-400'
                    : Math.abs(r.scostamento_perc ?? 0) < 2 ? 'text-gray-600'
                    : sc > 0 ? 'text-red-600' : 'text-amber-600'
                  return (
                    <Fragment key={key}>
                      <tr className="border-t border-steelex-border cursor-pointer hover:bg-gray-50"
                        onClick={() => setApri(a => ({ ...a, [key]: !a[key] }))}>
                        <td className="py-2 px-1">
                          <span className="font-medium text-gray-800">{r.descrizione}</span>
                          {!r.nel_computo && <span className="ml-1 text-[10px] text-amber-600" title="Voce non nel computo">⚠</span>}
                        </td>
                        <td className="py-2 px-1 text-gray-500">{r.um || '—'}</td>
                        <td className="py-2 px-1 text-right tabular-nums">{nf(r.qt_computo)}</td>
                        <td className="py-2 px-1 text-right tabular-nums font-semibold">{nf(r.qt_misurata)}</td>
                        <td className={`py-2 px-1 text-right tabular-nums ${scColor}`}>
                          {sc == null ? '—' : `${sc > 0 ? '+' : ''}${nf(sc)}`}
                          {r.scostamento_perc != null && <span className="text-[10px] ml-1">({r.scostamento_perc > 0 ? '+' : ''}{r.scostamento_perc}%)</span>}
                        </td>
                        <td className="py-2 px-1 text-right text-gray-500">{r.n_misure}</td>
                        <td className="py-2 text-gray-300">
                          <ChevronDown size={14} className={`transition-transform ${apri[key] ? 'rotate-180' : ''}`} />
                        </td>
                      </tr>
                      {apri[key] && dett.map((m) => (
                        <tr key={`d${m.id}`} className="bg-gray-50 text-[13px] border-t border-steelex-border/50">
                          <td className="py-1.5 px-1 pl-3 text-gray-600" colSpan={2}>
                            {m.descrizione}
                            {m.note && <span className="block text-[11px] text-gray-400 italic">{m.note}</span>}
                          </td>
                          <td className="py-1.5 px-1 text-right text-[11px] text-gray-400" colSpan={1}>
                            {[m.parti && `${nf(m.parti)}×`, m.lunghezza, m.larghezza, m.altezza].filter(Boolean).map(nf).join(' · ')}
                          </td>
                          <td className="py-1.5 px-1 text-right tabular-nums font-medium">{nf(m.quantita)}{m.quantita_manuale && <span className="text-[10px] text-amber-600 ml-0.5" title="Quantità forzata">✎</span>}</td>
                          <td className="py-1.5 px-1 text-right text-[11px] text-gray-400">{m.data_misura ? dayjs(m.data_misura).format('DD/MM/YY') : '—'}</td>
                          <td className="py-1.5 px-1 text-right" colSpan={2}>
                            <div className="flex items-center justify-end gap-1.5">
                              {(m.foto_urls || []).length > 0 && <span className="text-[10px] text-gray-400 flex items-center gap-0.5"><Camera size={11} />{m.foto_urls.length}</span>}
                              <button onClick={() => apriModifica(m)} className="text-gray-400 hover:text-steelex-orange p-0.5"><Pencil size={13} /></button>
                              <button onClick={() => { if (confirm('Eliminare questa misura?')) elimina.mutate(m.id) }} className="text-gray-400 hover:text-red-600 p-0.5"><Trash2 size={13} /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <button onClick={apriNuova} className="btn-primary w-full flex items-center justify-center gap-2 py-2.5">
        <Plus size={16} /> Aggiungi misura
      </button>

      {form && (
        <FormMisura
          form={form} setForm={setForm} voci={voci} editId={editId}
          misuraEdit={editId ? misure.find(m => m.id === editId) : null}
          onClose={() => { setForm(null); setEditId(null) }}
          onSubmit={submit} salvando={salva.isLoading}
          cantiereId={cantiereId} qc={qc}
        />
      )}
    </div>
  )
}

function FormMisura({ form, setForm, voci, editId, misuraEdit, onClose, onSubmit, salvando, cantiereId, qc }) {
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const auto = calcAuto(form)
  const fileRef = useRef()
  const [caricando, setCaricando] = useState(false)
  const foto = misuraEdit?.foto_urls || []

  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])

  const caricaFoto = async (file) => {
    if (!file || !editId) return
    setCaricando(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      await api.post(`/cantieri/${cantiereId}/misure/${editId}/foto`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' }, timeout: 90000,
      })
      qc.invalidateQueries(['misure', cantiereId])
      toast.success('Foto aggiunta')
    } catch {
      toast.error('Errore caricamento foto')
    } finally {
      setCaricando(false)
    }
  }

  const rimuoviFoto = async (url) => {
    try {
      await api.delete(`/cantieri/${cantiereId}/misure/${editId}/foto`, { data: { url } })
      qc.invalidateQueries(['misure', cantiereId])
    } catch {
      toast.error('Errore')
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl p-4 sm:p-5 w-full sm:max-w-lg max-h-[92vh] overflow-y-auto space-y-3"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h4 className="font-semibold text-gray-900">{editId ? 'Modifica misura' : 'Nuova misura'}</h4>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <label className="block">
          <span className="text-xs text-gray-500">Voce di computo</span>
          <select className="input-field mt-1 text-sm" value={form.voce_id} onChange={e => set('voce_id', e.target.value)}>
            <option value="">— Senza voce —</option>
            {voci.map(v => (
              <option key={v.voce_id} value={v.voce_id}>{v.descrizione} ({v.um || 's.u.m.'} · computo {nf(v.qt_computo)})</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-xs text-gray-500">Dove / cosa hai misurato *</span>
          <input className="input-field mt-1 text-sm" autoFocus placeholder="Es. Parete Nord, piano primo"
            value={form.descrizione} onChange={e => set('descrizione', e.target.value)} />
        </label>

        <div className="grid grid-cols-4 gap-2">
          {[['parti', 'Parti'], ['lunghezza', 'Lungh.'], ['larghezza', 'Largh.'], ['altezza', 'H / sp.']].map(([k, label]) => (
            <label key={k} className="block">
              <span className="text-[11px] text-gray-500">{label}</span>
              <input type="number" inputMode="decimal" step="any" className="input-field mt-1 text-sm px-2"
                value={form[k]} onChange={e => set(k, e.target.value)} />
            </label>
          ))}
        </div>

        <div className="bg-gray-50 rounded-lg p-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] text-gray-500 uppercase tracking-wide font-semibold">Quantità</p>
            {form.quantita_manuale ? (
              <input type="number" inputMode="decimal" step="any" className="input-field mt-1 text-sm w-32"
                value={form.quantita} onChange={e => set('quantita', e.target.value)} placeholder="0" />
            ) : (
              <p className="text-lg font-bold text-gray-800 tabular-nums">{nf(auto)}</p>
            )}
          </div>
          <label className="flex items-center gap-1.5 text-xs text-gray-600">
            <input type="checkbox" checked={form.quantita_manuale}
              onChange={e => set('quantita_manuale', e.target.checked)} />
            Forza a mano
          </label>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-xs text-gray-500">Data misura</span>
            <input type="date" className="input-field mt-1 text-sm" value={form.data_misura}
              onChange={e => set('data_misura', e.target.value)} />
          </label>
        </div>

        <label className="block">
          <span className="text-xs text-gray-500">Note</span>
          <textarea rows={2} className="input-field mt-1 text-sm" placeholder="Riferimenti, tavola di progetto, chi era presente…"
            value={form.note} onChange={e => set('note', e.target.value)} />
        </label>

        {/* Foto — solo in modifica (serve l'id) */}
        <div>
          <span className="text-xs text-gray-500">Foto di riscontro</span>
          {!editId ? (
            <p className="text-[11px] text-gray-400 mt-1">Salva la misura, poi riaprila per allegare le foto.</p>
          ) : (
            <div className="mt-1 flex flex-wrap gap-2">
              {foto.map(u => (
                <div key={u} className="relative">
                  <img src={u} alt="" className="w-16 h-16 object-cover rounded-lg border border-steelex-border" />
                  <button onClick={() => rimuoviFoto(u)}
                    className="absolute -top-1.5 -right-1.5 bg-white rounded-full border border-gray-300 text-gray-500 hover:text-red-600">
                    <X size={13} />
                  </button>
                </div>
              ))}
              <button onClick={() => fileRef.current?.click()} disabled={caricando}
                className="w-16 h-16 rounded-lg border-2 border-dashed border-gray-300 text-gray-400 flex items-center justify-center hover:border-steelex-orange hover:text-steelex-orange">
                {caricando ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
              </button>
              <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden"
                onChange={e => { caricaFoto(e.target.files?.[0]); e.target.value = '' }} />
            </div>
          )}
        </div>

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="btn-secondary flex-1">Annulla</button>
          <button onClick={onSubmit} disabled={salvando} className="btn-primary flex-1 disabled:opacity-50">
            {salvando ? 'Salvo…' : editId ? 'Salva modifiche' : 'Registra misura'}
          </button>
        </div>
      </div>
    </div>
  )
}
