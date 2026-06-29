import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { StickyNote, Plus, Trash2, Check, X, Pencil } from 'lucide-react'
import api from '../lib/api'
import dayjs from 'dayjs'

const COLORI = {
  giallo: { bg: 'bg-yellow-50',  border: 'border-yellow-200', header: 'bg-yellow-100', dot: 'bg-yellow-400' },
  verde:  { bg: 'bg-green-50',   border: 'border-green-200',  header: 'bg-green-100',  dot: 'bg-green-400' },
  rosso:  { bg: 'bg-red-50',     border: 'border-red-200',    header: 'bg-red-100',    dot: 'bg-red-400' },
  blu:    { bg: 'bg-blue-50',    border: 'border-blue-200',   header: 'bg-blue-100',   dot: 'bg-blue-400' },
}

export default function AppuntiPage() {
  const qc = useQueryClient()
  const [nuovo, setNuovo] = useState(false)
  const [form, setForm] = useState({ testo: '', colore: 'giallo' })
  const [editing, setEditing] = useState(null) // {id, testo, colore}

  const { data: appunti = [], isLoading } = useQuery(
    'appunti',
    () => api.get('/appunti').then(r => r.data),
    { staleTime: 30000 }
  )

  const crea = useMutation(
    () => api.post('/appunti', form),
    { onSuccess: () => { qc.invalidateQueries('appunti'); setNuovo(false); setForm({ testo: '', colore: 'giallo' }) } }
  )

  const aggiorna = useMutation(
    ({ id, testo, colore }) => api.put(`/appunti/${id}`, { testo, colore }),
    { onSuccess: () => { qc.invalidateQueries('appunti'); setEditing(null) } }
  )

  const elimina = useMutation(
    (id) => api.delete(`/appunti/${id}`),
    { onSuccess: () => qc.invalidateQueries('appunti') }
  )

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <StickyNote size={20} className="text-steelex-orange" />
            Appunti condivisi
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">Visibili solo ad admin e amministrazione</p>
        </div>
        <button onClick={() => setNuovo(true)}
          className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-xl bg-steelex-orange text-white font-medium hover:opacity-90 transition-opacity">
          <Plus size={16} /> Nuovo appunto
        </button>
      </div>

      {/* Form nuovo */}
      {nuovo && (
        <div className="card space-y-3 border-2 border-steelex-orange/30">
          <textarea
            autoFocus
            rows={4}
            placeholder="Scrivi l'appunto..."
            value={form.testo}
            onChange={e => setForm(f => ({ ...f, testo: e.target.value }))}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-steelex-orange resize-none"
          />
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500 font-medium">Colore:</span>
            {Object.entries(COLORI).map(([k, v]) => (
              <button key={k} onClick={() => setForm(f => ({ ...f, colore: k }))}
                className={`w-6 h-6 rounded-full ${v.dot} ring-2 transition-all ${form.colore === k ? 'ring-steelex-orange ring-offset-1' : 'ring-transparent'}`} />
            ))}
            <div className="flex-1" />
            <button onClick={() => { setNuovo(false); setForm({ testo: '', colore: 'giallo' }) }}
              className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-100">
              Annulla
            </button>
            <button onClick={() => form.testo.trim() && crea.mutate()}
              disabled={!form.testo.trim() || crea.isLoading}
              className="flex items-center gap-1.5 text-sm px-4 py-1.5 rounded-xl bg-steelex-orange text-white font-medium hover:opacity-90 disabled:opacity-50">
              <Check size={14} /> Salva
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-12 text-gray-400">Caricamento...</div>
      ) : appunti.length === 0 && !nuovo ? (
        <div className="card text-center py-12 text-gray-400">
          <StickyNote size={36} className="mx-auto mb-3 opacity-20" />
          <p className="font-medium">Nessun appunto ancora</p>
          <p className="text-xs mt-1">Usa gli appunti per annotare modifiche da fare all'app o promemoria di team</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {appunti.map(a => {
            const c = COLORI[a.colore] || COLORI.giallo
            const isEdit = editing?.id === a.id
            return (
              <div key={a.id} className={`rounded-2xl border-2 ${c.border} ${c.bg} overflow-hidden shadow-sm`}>
                <div className={`${c.header} px-4 py-2 flex items-center justify-between`}>
                  <span className="text-xs font-medium text-gray-600">
                    {a.nome} {a.cognome}
                    {a.aggiornato_il
                      ? ` · mod. ${dayjs(a.aggiornato_il).format('DD/MM/YY HH:mm')}`
                      : ` · ${dayjs(a.creato_il).format('DD/MM/YY HH:mm')}`}
                  </span>
                  <div className="flex gap-1">
                    <button onClick={() => setEditing({ id: a.id, testo: a.testo, colore: a.colore })}
                      className="p-1 hover:bg-white/60 rounded-lg text-gray-500 hover:text-gray-700 transition-colors">
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => elimina.mutate(a.id)}
                      className="p-1 hover:bg-white/60 rounded-lg text-gray-500 hover:text-red-600 transition-colors">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
                <div className="px-4 py-3">
                  {isEdit ? (
                    <div className="space-y-2">
                      <textarea
                        autoFocus
                        rows={4}
                        value={editing.testo}
                        onChange={e => setEditing(ed => ({ ...ed, testo: e.target.value }))}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-steelex-orange resize-none bg-white/80"
                      />
                      <div className="flex items-center gap-2">
                        {Object.entries(COLORI).map(([k, v]) => (
                          <button key={k} onClick={() => setEditing(ed => ({ ...ed, colore: k }))}
                            className={`w-5 h-5 rounded-full ${v.dot} ring-2 transition-all ${editing.colore === k ? 'ring-steelex-orange ring-offset-1' : 'ring-transparent'}`} />
                        ))}
                        <div className="flex-1" />
                        <button onClick={() => setEditing(null)}
                          className="p-1 hover:bg-white/60 rounded-lg text-gray-500 transition-colors">
                          <X size={14} />
                        </button>
                        <button onClick={() => aggiorna.mutate(editing)}
                          className="p-1 hover:bg-white/60 rounded-lg text-green-600 transition-colors">
                          <Check size={14} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{a.testo}</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
