import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { ChevronLeft, ChevronRight, Save, Trash2, Calendar, Upload, CheckCircle, Bell, AlertTriangle, X, FileText } from 'lucide-react'
import api from '../lib/api'
import { useAuth } from '../lib/auth'
import dayjs from 'dayjs'
import isoWeek from 'dayjs/plugin/isoWeek'
dayjs.extend(isoWeek)

const GIORNI = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab']
const GIORNI_LABEL = { lun:'Lunedì', mar:'Martedì', mer:'Mercoledì', gio:'Giovedì', ven:'Venerdì', sab:'Sabato' }

function settimanaLabel(anno, sett) {
  const inizio = dayjs().year(anno).isoWeek(sett).isoWeekday(1)
  const fine = inizio.add(5, 'day')
  return `${inizio.format('DD/MM')} – ${fine.format('DD/MM/YYYY')} (sett. ${sett})`
}

// ── Preview import PDF ────────────────────────────────────────────────────────
function PreviewImport({ preview, cantieri, operativi, onConferma, onAnnulla }) {
  const [righe, setRighe] = useState(preview)

  const aggiorna = (i, campo, valore) => {
    setRighe(prev => prev.map((r, j) => j === i ? { ...r, [campo]: valore } : r))
  }

  // Raggruppa per operativo per mostrare la tabella
  const perOp = {}
  righe.forEach((r, i) => {
    const key = r.operativo_id || r.nome_rilevato || 'sconosciuto'
    if (!perOp[key]) perOp[key] = { nome: r.operativo_nome || r.nome_rilevato || 'Sconosciuto', righe: [] }
    perOp[key].righe.push({ ...r, _idx: i })
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center">
          <FileText size={18} className="text-blue-600" />
        </div>
        <div>
          <p className="font-bold text-gray-900">Anteprima import PDF</p>
          <p className="text-sm text-gray-500">{righe.length} righe estratte — verifica e correggi se necessario</p>
        </div>
      </div>

      {Object.entries(perOp).map(([key, { nome, righe: rrr }]) => (
        <div key={key} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-2.5 bg-gray-50 border-b flex items-center justify-between">
            <p className="font-semibold text-gray-900 text-sm">{nome}</p>
            {!rrr[0]?.operativo_id && (
              <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                <AlertTriangle size={10} /> non abbinato
              </span>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500 uppercase">
                  <th className="px-3 py-2 text-left w-16">Giorno</th>
                  <th className="px-3 py-2 text-left">Dove</th>
                  <th className="px-3 py-2 text-left">Lavorazione</th>
                  <th className="px-2 py-2 w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rrr.map((r) => (
                  <tr key={r._idx}>
                    <td className="px-3 py-1.5">
                      <select
                        value={r.giorno || ''}
                        onChange={e => aggiorna(r._idx, 'giorno', e.target.value)}
                        className="border border-gray-200 rounded px-1.5 py-1 text-xs w-16 focus:outline-none focus:ring-1 focus:ring-steelex-orange">
                        <option value="">—</option>
                        {GIORNI.map(g => <option key={g} value={g}>{GIORNI_LABEL[g].slice(0,3)}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-1.5">
                      <select
                        value={r.cantiere_id || ''}
                        onChange={e => aggiorna(r._idx, 'cantiere_id', e.target.value ? parseInt(e.target.value) : null)}
                        className="border border-gray-200 rounded px-1.5 py-1 text-xs w-full max-w-[180px] focus:outline-none focus:ring-1 focus:ring-steelex-orange">
                        <option value="">{r.cantiere_rilevato || '— scegli —'}</option>
                        {cantieri.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        type="text"
                        value={r.lavorazione || ''}
                        onChange={e => aggiorna(r._idx, 'lavorazione', e.target.value)}
                        className="border border-gray-200 rounded px-1.5 py-1 text-xs w-full focus:outline-none focus:ring-1 focus:ring-steelex-orange"
                        placeholder="Lavorazione..."
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <button onClick={() => setRighe(prev => prev.filter((_, j) => j !== r._idx))}
                        className="text-gray-300 hover:text-red-400 transition-colors">
                        <X size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      <div className="flex gap-3">
        <button onClick={() => onConferma(righe)}
          className="flex-1 flex items-center justify-center gap-2 py-3 bg-steelex-orange text-white rounded-xl font-semibold text-sm hover:bg-orange-600 transition-colors">
          <CheckCircle size={16} /> Conferma e salva
        </button>
        <button onClick={onAnnulla}
          className="px-4 py-3 border border-gray-200 text-gray-600 rounded-xl font-semibold text-sm hover:bg-gray-50 transition-colors">
          Annulla
        </button>
      </div>
    </div>
  )
}

// ── Pagina principale ─────────────────────────────────────────────────────────
export default function ProgrammazioneAdminPage() {
  const qc = useQueryClient()
  const { utente } = useAuth()
  const puoModificare = ['admin', 'amministrazione'].includes(utente?.ruolo)
  const oggi = dayjs()
  const [anno, setAnno] = useState(oggi.year())
  const [sett, setSett] = useState(oggi.isoWeek())
  const [draftPerOp, setDraftPerOp] = useState({})
  const [salvato, setSalvato] = useState({})
  const [preview, setPreview] = useState(null)   // null | array righe
  const [importando, setImportando] = useState(false)
  const [importErr, setImportErr] = useState(null)
  const [pubblicato, setPubblicato] = useState(false)
  const fileInputRef = useRef(null)

  const { data: utenti = [] } = useQuery('utenti-operativi', () =>
    api.get('/programmazione/operativi').then(r => r.data))

  const { data: cantieri = [] } = useQuery('cantieri-attivi', () =>
    api.get('/cantieri').then(r => r.data.filter(c =>
      ['attivo', 'in_corso', 'preventivo'].includes(c.stato)
    )))

  const { data: programmazione = [] } = useQuery(
    ['programmazione', anno, sett],
    () => api.get('/programmazione', { params: { anno, settimana: sett } }).then(r => r.data),
    {
      onSuccess: (data) => {
        const init = {}
        data.forEach(p => { init[p.operativo_id] = p.giorni })
        setDraftPerOp(init)
      }
    }
  )

  const salvaMutation = useMutation(
    ({ operativo_id, giorni }) =>
      api.post('/programmazione', { operativo_id, anno, settimana: sett, giorni }),
    {
      onSuccess: (_, { operativo_id }) => {
        setSalvato(s => ({ ...s, [operativo_id]: true }))
        setTimeout(() => setSalvato(s => ({ ...s, [operativo_id]: false })), 2000)
        qc.invalidateQueries(['programmazione', anno, sett])
      }
    }
  )

  const pubblicaMutation = useMutation(
    () => api.post('/programmazione/pubblica-settimana', { anno, settimana: sett }),
    {
      onSuccess: () => {
        setPubblicato(true)
        setTimeout(() => setPubblicato(false), 4000)
      }
    }
  )

  const setPrevSett = () => {
    const d = dayjs().year(anno).isoWeek(sett).subtract(1, 'week')
    setAnno(d.year()); setSett(d.isoWeek()); setPreview(null)
  }
  const setNextSett = () => {
    const d = dayjs().year(anno).isoWeek(sett).add(1, 'week')
    setAnno(d.year()); setSett(d.isoWeek()); setPreview(null)
  }

  const setGiorno = (opId, giorno, field, value) => {
    setDraftPerOp(prev => ({
      ...prev,
      [opId]: {
        ...(prev[opId] || {}),
        [giorno]: {
          ...(prev[opId]?.[giorno] || {}),
          [field]: value || undefined,
        }
      }
    }))
  }

  const salva = (opId) => {
    const giorni = {}
    Object.entries(draftPerOp[opId] || {}).forEach(([g, v]) => {
      if (v.cantiere_id || v.note || v.lavorazione) giorni[g] = v
    })
    salvaMutation.mutate({ operativo_id: opId, giorni })
  }

  const onFileSelected = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImportando(true)
    setImportErr(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await api.post('/programmazione/importa-pdf', fd, { timeout: 180000 })
      setPreview(res.data.preview)
    } catch (err) {
      setImportErr(err?.response?.data?.detail || 'Errore import PDF')
    } finally {
      setImportando(false)
      e.target.value = ''
    }
  }

  const onConfermaPreview = async (righe) => {
    // Raggruppa per operativo e salva
    const perOp = {}
    for (const r of righe) {
      if (!r.operativo_id || !r.giorno) continue
      if (!perOp[r.operativo_id]) perOp[r.operativo_id] = {}
      perOp[r.operativo_id][r.giorno] = {
        cantiere_id: r.cantiere_id || undefined,
        cantiere_nome: !r.cantiere_id ? r.cantiere_rilevato : undefined,
        lavorazione: r.lavorazione || undefined,
      }
    }
    for (const [opId, giorni] of Object.entries(perOp)) {
      await api.post('/programmazione', { operativo_id: parseInt(opId), anno, settimana: sett, giorni })
    }
    setPreview(null)
    qc.invalidateQueries(['programmazione', anno, sett])
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Calendar size={22} className="text-steelex-orange" />
          <h1 className="text-xl font-bold text-gray-900">Programmazione settimana</h1>
        </div>
        {puoModificare && (
          <div className="flex items-center gap-2">
            {/* Import PDF */}
            <input ref={fileInputRef} type="file" accept="image/*,.pdf" className="hidden" onChange={onFileSelected} />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={importando}
              className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors">
              <Upload size={15} />
              {importando ? 'Analisi in corso...' : 'Importa tabella / foto'}
            </button>
            {/* Pubblica e notifica */}
            {programmazione.length > 0 && (
              <button
                onClick={() => pubblicaMutation.mutate()}
                disabled={pubblicaMutation.isLoading}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-colors ${
                  pubblicato ? 'bg-green-100 text-green-700' : 'bg-steelex-orange text-white hover:bg-orange-600'
                }`}>
                {pubblicato ? <><CheckCircle size={15}/> Notifiche inviate!</> : <><Bell size={15}/> Pubblica e notifica</>}
              </button>
            )}
          </div>
        )}
      </div>

      {importErr && (
        <div className="bg-red-50 text-red-700 p-3 rounded-xl text-sm flex items-center gap-2">
          <AlertTriangle size={15} /> {importErr}
        </div>
      )}

      {/* Navigazione settimana */}
      <div className="flex items-center gap-3 bg-white rounded-xl border border-gray-100 shadow-sm p-3">
        <button onClick={setPrevSett} className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors">
          <ChevronLeft size={18} />
        </button>
        <div className="flex-1 text-center">
          <p className="font-semibold text-gray-900 text-sm">{settimanaLabel(anno, sett)}</p>
          {anno === oggi.year() && sett === oggi.isoWeek() && (
            <span className="text-xs text-steelex-orange font-semibold">Settimana corrente</span>
          )}
        </div>
        <button onClick={setNextSett} className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors">
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Preview import */}
      {preview && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
          <PreviewImport
            preview={preview}
            cantieri={cantieri}
            operativi={utenti}
            onConferma={onConfermaPreview}
            onAnnulla={() => setPreview(null)}
          />
        </div>
      )}

      {/* Card per ogni operativo */}
      {!preview && (
        <>
          {utenti.length === 0 && (
            <p className="text-center text-gray-400 text-sm py-8">Nessun operativo registrato</p>
          )}

          {utenti.map(u => (
            <div key={u.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-gray-900">{u.nome} {u.cognome}</p>
                  <p className="text-xs text-gray-400 capitalize">{u.ruolo?.replace(/_/g, ' ')}</p>
                </div>
                {puoModificare && (
                  <button
                    onClick={() => salva(u.id)}
                    disabled={salvaMutation.isLoading}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                      salvato[u.id] ? 'bg-green-100 text-green-700' : 'bg-steelex-orange text-white hover:bg-orange-600'
                    }`}>
                    <Save size={14} />
                    {salvato[u.id] ? 'Salvato!' : 'Salva'}
                  </button>
                )}
              </div>

              <div className="p-3 space-y-2">
                {/* Header colonne */}
                <div className="hidden sm:grid grid-cols-[2rem_1fr_1fr_10rem] gap-2 px-1 pb-1">
                  <span className="text-xs font-semibold text-gray-400"></span>
                  <span className="text-xs font-semibold text-gray-400 uppercase">Dove</span>
                  <span className="text-xs font-semibold text-gray-400 uppercase">Lavorazione</span>
                  <span className="text-xs font-semibold text-gray-400 uppercase">Note</span>
                </div>
                {GIORNI.map(g => {
                  const val = draftPerOp[u.id]?.[g] || {}
                  return (
                    <div key={g} className="grid grid-cols-1 sm:grid-cols-[2rem_1fr_1fr_10rem] gap-2 items-center">
                      <span className="text-xs font-bold text-gray-500 shrink-0">
                        {GIORNI_LABEL[g].slice(0, 3)}
                      </span>
                      <select
                        value={val.cantiere_id || ''}
                        onChange={e => setGiorno(u.id, g, 'cantiere_id', e.target.value ? parseInt(e.target.value) : null)}
                        className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-steelex-orange">
                        <option value="">— nessun cantiere —</option>
                        {cantieri.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                      </select>
                      <input
                        type="text"
                        placeholder="Lavorazione..."
                        value={val.lavorazione || ''}
                        onChange={e => setGiorno(u.id, g, 'lavorazione', e.target.value)}
                        className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-steelex-orange"
                      />
                      <input
                        type="text"
                        placeholder="Note..."
                        value={val.note || ''}
                        onChange={e => setGiorno(u.id, g, 'note', e.target.value)}
                        className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-steelex-orange"
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
