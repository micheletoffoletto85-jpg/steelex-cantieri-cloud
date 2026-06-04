import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { ArrowLeft, Edit2, Save, X, MapPin, Calendar, TrendingUp, Euro } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../lib/api'
import dayjs from 'dayjs'

const STATO_STYLE = {
  preventivo: 'bg-gray-100 text-gray-700', in_corso: 'bg-blue-100 text-blue-700',
  sospeso: 'bg-yellow-100 text-yellow-700', completato: 'bg-green-100 text-green-700',
  annullato: 'bg-red-100 text-red-700',
}
const STATO_LABEL = {
  preventivo: 'Preventivo', in_corso: 'In Corso', sospeso: 'Sospeso',
  completato: 'Completato', annullato: 'Annullato',
}

export default function CantierePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(null)

  const { data: cantiere, isLoading } = useQuery(['cantiere', id], () => api.get(`/cantieri/${id}`).then(r => r.data), {
    onSuccess: (data) => { if (!form) setForm(data) }
  })

  const updateMutation = useMutation(
    data => api.put(`/cantieri/${id}`, data),
    {
      onSuccess: (r) => { qc.setQueryData(['cantiere', id], r.data); qc.invalidateQueries('cantieri'); setEditing(false); toast.success('Salvato!') },
      onError: err => toast.error(err.response?.data?.detail || 'Errore salvataggio'),
    }
  )

  if (isLoading) return <div className="text-center py-8 text-gray-400">Caricamento...</div>
  if (!cantiere) return <div className="text-center py-8 text-red-400">Cantiere non trovato</div>

  const data = editing ? form : cantiere
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/cantieri')} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          {editing ? (
            <input className="input-field text-xl font-bold" value={form.nome} onChange={e => set('nome', e.target.value)} />
          ) : (
            <h1 className="text-xl font-bold">{cantiere.nome}</h1>
          )}
        </div>
        {editing ? (
          <div className="flex gap-2">
            <button onClick={() => { setForm(cantiere); setEditing(false) }} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500"><X size={20} /></button>
            <button onClick={() => updateMutation.mutate(form)} className="btn-primary flex items-center gap-1 py-2"><Save size={16} /> Salva</button>
          </div>
        ) : (
          <button onClick={() => setEditing(true)} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500"><Edit2 size={20} /></button>
        )}
      </div>

      {/* Info cantiere */}
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          {editing ? (
            <select className="input-field w-40" value={form.stato} onChange={e => set('stato', e.target.value)}>
              {Object.keys(STATO_LABEL).map(s => <option key={s} value={s}>{STATO_LABEL[s]}</option>)}
            </select>
          ) : (
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${STATO_STYLE[cantiere.stato]}`}>{STATO_LABEL[cantiere.stato]}</span>
          )}
          <span className="text-2xl font-bold text-steelex-orange">{data.avanzamento}%</span>
        </div>

        {/* Barra avanzamento */}
        {editing ? (
          <div>
            <label className="text-sm text-gray-500 mb-1 block">Avanzamento: {form.avanzamento}%</label>
            <input type="range" min="0" max="100" step="5" value={form.avanzamento} onChange={e => set('avanzamento', Number(e.target.value))} className="w-full accent-steelex-orange" />
          </div>
        ) : (
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div className="bg-steelex-orange h-3 rounded-full transition-all" style={{ width: `${cantiere.avanzamento}%` }} />
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 pt-2">
          <InfoField icon={<span className="text-sm">👷</span>} label="Cliente" editing={editing}
            value={data.cliente} onChange={v => set('cliente', v)} />
          <InfoField icon={<MapPin size={14} />} label="Città" editing={editing}
            value={data.citta || ''} onChange={v => set('citta', v)} />
          <InfoField icon={<Calendar size={14} />} label="Inizio" editing={editing} type="date"
            value={data.data_inizio || ''} onChange={v => set('data_inizio', v)} />
          <InfoField icon={<Calendar size={14} />} label="Fine Prevista" editing={editing} type="date"
            value={data.data_fine_prevista || ''} onChange={v => set('data_fine_prevista', v)} />
          <InfoField icon={<Euro size={14} />} label="Budget" editing={editing} type="number"
            value={data.budget || 0} onChange={v => set('budget', Number(v))}
            display={`€${(data.budget || 0).toLocaleString('it-IT')}`} />
        </div>

        {(editing || cantiere.note) && (
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Note</label>
            {editing ? (
              <textarea className="input-field h-20 resize-none" value={form.note || ''} onChange={e => set('note', e.target.value)} placeholder="Note sul cantiere..." />
            ) : (
              <p className="text-sm text-gray-700">{cantiere.note}</p>
            )}
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400 text-right">
        Creato il {dayjs(cantiere.creato_il).format('DD/MM/YYYY')}
      </p>
    </div>
  )
}

function InfoField({ icon, label, value, editing, onChange, type = 'text', display }) {
  return (
    <div>
      <label className="text-xs text-gray-500 flex items-center gap-1 mb-1">{icon} {label}</label>
      {editing ? (
        <input className="input-field py-2 text-sm" type={type} value={value} onChange={e => onChange(e.target.value)} />
      ) : (
        <p className="text-sm font-medium text-gray-900">{display || value || '—'}</p>
      )}
    </div>
  )
}
