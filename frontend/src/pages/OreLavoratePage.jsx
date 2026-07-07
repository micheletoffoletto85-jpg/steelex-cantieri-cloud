import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { Clock, Plus, Trash2, Check, X, Pencil, ChevronLeft, ChevronRight } from 'lucide-react'
import api from '../lib/api'
import dayjs from 'dayjs'
import 'dayjs/locale/it'
import { useAuth } from '../lib/auth'

dayjs.locale('it')

const FORM_VUOTO = () => ({ data: dayjs().format('YYYY-MM-DD'), ore: '', descrizione: '' })

export default function OreLavoratePage() {
  const qc = useQueryClient()
  const { utente } = useAuth()
  // admin e amministrazione vedono le ore di tutti; gli operativi solo le proprie
  const isAdmin = ['admin', 'amministrazione'].includes(utente?.ruolo)

  const [mese, setMese] = useState(dayjs().format('YYYY-MM'))
  const [filtroUtente, setFiltroUtente] = useState('')  // '' = tutti (solo admin)
  const [nuovo, setNuovo] = useState(false)
  const [form, setForm] = useState(FORM_VUOTO())
  const [editing, setEditing] = useState(null)  // {id, data, ore, descrizione}

  const chiaveLista = ['ore-lavorate', mese, filtroUtente]
  const { data: righe = [], isLoading } = useQuery(
    chiaveLista,
    () => api.get('/ore-lavorate', { params: { mese, ...(filtroUtente ? { utente_id: filtroUtente } : {}) } }).then(r => r.data),
    { staleTime: 15000 }
  )

  const { data: utenti = [] } = useQuery(
    'ore-lavorate-utenti',
    () => api.get('/ore-lavorate/utenti').then(r => r.data),
    { enabled: isAdmin, staleTime: 300000 }
  )

  const invalida = () => qc.invalidateQueries('ore-lavorate')

  const crea = useMutation(
    () => api.post('/ore-lavorate', { ...form, ore: parseFloat(String(form.ore).replace(',', '.')) }),
    { onSuccess: () => { invalida(); setNuovo(false); setForm(FORM_VUOTO()) } }
  )

  const aggiorna = useMutation(
    (e) => api.put(`/ore-lavorate/${e.id}`, { data: e.data, ore: parseFloat(String(e.ore).replace(',', '.')), descrizione: e.descrizione }),
    { onSuccess: () => { invalida(); setEditing(null) } }
  )

  const elimina = useMutation(
    (id) => api.delete(`/ore-lavorate/${id}`),
    { onSuccess: invalida }
  )

  const oreValide = (v) => {
    const n = parseFloat(String(v).replace(',', '.'))
    return !isNaN(n) && n > 0 && n <= 24
  }
  const formOk = form.data && oreValide(form.ore) && form.descrizione.trim()

  // Totali del mese visualizzato
  const totaleOre = righe.reduce((s, r) => s + (parseFloat(r.ore) || 0), 0)
  const giorni = new Set(righe.map(r => `${r.utente_id}-${r.data}`)).size

  // Riepilogo per utente (utile ad admin quando vede tutti)
  const perUtente = Object.values(righe.reduce((acc, r) => {
    const k = r.utente_id
    if (!acc[k]) acc[k] = { nome: `${r.nome || ''} ${r.cognome || ''}`.trim(), ore: 0 }
    acc[k].ore += parseFloat(r.ore) || 0
    return acc
  }, {}))

  const puoModificare = (r) => isAdmin || r.utente_id === utente?.id

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <Clock size={20} className="text-steelex-orange" />
            Ore lavorate
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">{isAdmin ? 'Registro ore di tutti gli utenti — con dettaglio operazioni' : 'Le tue ore giornaliere — visibili solo all\'amministrazione'}</p>
        </div>
        <button onClick={() => { setNuovo(true); setForm(FORM_VUOTO()) }}
          className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-xl bg-steelex-orange text-white font-medium hover:opacity-90 transition-opacity">
          <Plus size={16} /> Registra ore
        </button>
      </div>

      {/* Selettore mese + filtro utente */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1 bg-white rounded-xl border border-gray-200 px-1 py-1">
          <button onClick={() => setMese(dayjs(mese + '-01').subtract(1, 'month').format('YYYY-MM'))}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><ChevronLeft size={16} /></button>
          <span className="text-sm font-semibold text-gray-700 min-w-[130px] text-center capitalize">
            {dayjs(mese + '-01').format('MMMM YYYY')}
          </span>
          <button onClick={() => setMese(dayjs(mese + '-01').add(1, 'month').format('YYYY-MM'))}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><ChevronRight size={16} /></button>
        </div>
        {isAdmin && (
          <select value={filtroUtente} onChange={e => setFiltroUtente(e.target.value)}
            className="text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-steelex-orange">
            <option value="">Tutti gli utenti</option>
            {utenti.map(u => <option key={u.id} value={u.id}>{u.nome} {u.cognome}</option>)}
          </select>
        )}
        <div className="flex-1" />
        <div className="flex items-center gap-2 text-sm">
          <span className="px-3 py-1.5 rounded-xl bg-steelex-orange/10 text-steelex-orange font-semibold">
            Totale: {totaleOre.toLocaleString('it-IT', { maximumFractionDigits: 2 })} h
          </span>
          <span className="px-3 py-1.5 rounded-xl bg-gray-100 text-gray-600 font-medium">
            {giorni} {giorni === 1 ? 'giornata' : 'giornate'}
          </span>
        </div>
      </div>

      {/* Riepilogo per utente (admin, vista "tutti") */}
      {isAdmin && !filtroUtente && perUtente.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap">
          {perUtente.map((u, i) => (
            <span key={i} className="text-xs px-2.5 py-1 rounded-lg bg-white border border-gray-200 text-gray-600">
              <b>{u.nome}</b> · {u.ore.toLocaleString('it-IT', { maximumFractionDigits: 2 })} h
            </span>
          ))}
        </div>
      )}

      {/* Form nuova registrazione */}
      {nuovo && (
        <div className="card space-y-3 border-2 border-steelex-orange/30">
          <div className="grid grid-cols-1 sm:grid-cols-[160px_110px_1fr] gap-3">
            <div>
              <label className="text-xs text-gray-500 font-medium block mb-1">Data</label>
              <input type="date" value={form.data}
                onChange={e => setForm(f => ({ ...f, data: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-steelex-orange" />
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium block mb-1">Ore</label>
              <input type="number" min="0.5" max="24" step="0.5" placeholder="8"
                value={form.ore}
                onChange={e => setForm(f => ({ ...f, ore: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-steelex-orange" />
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium block mb-1">Dettaglio operazioni svolte</label>
              <textarea rows={2} autoFocus placeholder="Es. fatturazione fornitori, preparazione SAL cantiere Rossi, telefonate clienti..."
                value={form.descrizione}
                onChange={e => setForm(f => ({ ...f, descrizione: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-steelex-orange resize-none" />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2">
            <button onClick={() => { setNuovo(false); setForm(FORM_VUOTO()) }}
              className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-100">
              Annulla
            </button>
            <button onClick={() => formOk && crea.mutate()}
              disabled={!formOk || crea.isLoading}
              className="flex items-center gap-1.5 text-sm px-4 py-1.5 rounded-xl bg-steelex-orange text-white font-medium hover:opacity-90 disabled:opacity-50">
              <Check size={14} /> Salva
            </button>
          </div>
        </div>
      )}

      {/* Tabella registrazioni */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-400">Caricamento...</div>
      ) : righe.length === 0 && !nuovo ? (
        <div className="card text-center py-12 text-gray-400">
          <Clock size={36} className="mx-auto mb-3 opacity-20" />
          <p className="font-medium">Nessuna registrazione per {dayjs(mese + '-01').format('MMMM YYYY')}</p>
          <p className="text-xs mt-1">Usa "Registra ore" per inserire le ore lavorate con il dettaglio delle operazioni</p>
        </div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs text-gray-400 uppercase tracking-wide">
                <th className="px-4 py-3 font-semibold whitespace-nowrap">Data</th>
                {isAdmin && !filtroUtente && <th className="px-4 py-3 font-semibold whitespace-nowrap">Utente</th>}
                <th className="px-4 py-3 font-semibold whitespace-nowrap text-right">Ore</th>
                <th className="px-4 py-3 font-semibold w-full">Dettaglio operazioni</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {righe.map(r => {
                const isEdit = editing?.id === r.id
                return (
                  <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50/60 align-top">
                    {isEdit ? (
                      <>
                        <td className="px-4 py-2">
                          <input type="date" value={editing.data}
                            onChange={e => setEditing(ed => ({ ...ed, data: e.target.value }))}
                            className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-steelex-orange" />
                        </td>
                        {isAdmin && !filtroUtente && (
                          <td className="px-4 py-2 whitespace-nowrap text-gray-600">{r.nome} {r.cognome}</td>
                        )}
                        <td className="px-4 py-2 text-right">
                          <input type="number" min="0.5" max="24" step="0.5" value={editing.ore}
                            onChange={e => setEditing(ed => ({ ...ed, ore: e.target.value }))}
                            className="w-20 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-steelex-orange" />
                        </td>
                        <td className="px-4 py-2">
                          <textarea rows={2} value={editing.descrizione}
                            onChange={e => setEditing(ed => ({ ...ed, descrizione: e.target.value }))}
                            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-steelex-orange resize-none" />
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap">
                          <div className="flex gap-1 justify-end">
                            <button onClick={() => setEditing(null)}
                              className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500"><X size={14} /></button>
                            <button onClick={() => oreValide(editing.ore) && editing.descrizione.trim() && aggiorna.mutate(editing)}
                              disabled={!oreValide(editing.ore) || !editing.descrizione.trim() || aggiorna.isLoading}
                              className="p-1.5 hover:bg-green-50 rounded-lg text-green-600 disabled:opacity-40"><Check size={14} /></button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3 whitespace-nowrap font-medium text-gray-700">
                          {dayjs(r.data).format('DD/MM/YYYY')}
                          <span className="block text-[10px] text-gray-400 capitalize">{dayjs(r.data).format('dddd')}</span>
                        </td>
                        {isAdmin && !filtroUtente && (
                          <td className="px-4 py-3 whitespace-nowrap text-gray-600">{r.nome} {r.cognome}</td>
                        )}
                        <td className="px-4 py-3 whitespace-nowrap text-right font-semibold text-steelex-orange">
                          {parseFloat(r.ore).toLocaleString('it-IT', { maximumFractionDigits: 2 })} h
                        </td>
                        <td className="px-4 py-3 text-gray-700 whitespace-pre-wrap leading-relaxed">{r.descrizione}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {puoModificare(r) && (
                            <div className="flex gap-1 justify-end">
                              <button onClick={() => setEditing({ id: r.id, data: r.data, ore: r.ore, descrizione: r.descrizione })}
                                className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition-colors"><Pencil size={13} /></button>
                              <button onClick={() => window.confirm('Eliminare questa registrazione?') && elimina.mutate(r.id)}
                                className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-600 transition-colors"><Trash2 size={13} /></button>
                            </div>
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
