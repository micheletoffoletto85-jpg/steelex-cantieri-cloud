import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { UserPlus, Shield, HardHat, User, ToggleLeft, ToggleRight } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../lib/api'

const RUOLO_LABEL = { admin: 'Admin', capo_cantiere: 'Capo Cantiere', fornitore: 'Fornitore', cliente: 'Cliente' }
const RUOLO_ICON = { admin: Shield, capo_cantiere: HardHat, fornitore: User, cliente: User }
const RUOLO_COLOR = { admin: 'text-red-600 bg-red-50', capo_cantiere: 'text-blue-600 bg-blue-50', fornitore: 'text-purple-600 bg-purple-50', cliente: 'text-gray-600 bg-gray-50' }

export default function UtentiPage() {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ nome: '', cognome: '', email: '', password: '', ruolo: 'capo_cantiere' })
  const qc = useQueryClient()

  const { data: utenti = [], isLoading } = useQuery('utenti', () => api.get('/utenti').then(r => r.data))

  const createMutation = useMutation(
    data => api.post('/utenti', data),
    {
      onSuccess: () => { qc.invalidateQueries('utenti'); setShowForm(false); setForm({ nome: '', cognome: '', email: '', password: '', ruolo: 'capo_cantiere' }); toast.success('Utente creato!') },
      onError: err => toast.error(err.response?.data?.detail || 'Errore creazione')
    }
  )

  const toggleMutation = useMutation(
    ({ id, attivo }) => api.put(`/utenti/${id}`, { attivo }),
    { onSuccess: () => qc.invalidateQueries('utenti') }
  )

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Utenti</h1>
        <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2">
          <UserPlus size={18} /> Aggiungi
        </button>
      </div>

      {showForm && (
        <div className="card space-y-3">
          <h2 className="font-bold text-lg">Nuovo Utente</h2>
          <div className="grid grid-cols-2 gap-2">
            <input className="input-field" placeholder="Nome *" value={form.nome} onChange={e => set('nome', e.target.value)} />
            <input className="input-field" placeholder="Cognome *" value={form.cognome} onChange={e => set('cognome', e.target.value)} />
          </div>
          <input className="input-field" type="email" placeholder="Email *" value={form.email} onChange={e => set('email', e.target.value)} />
          <input className="input-field" type="password" placeholder="Password *" value={form.password} onChange={e => set('password', e.target.value)} />
          <select className="input-field" value={form.ruolo} onChange={e => set('ruolo', e.target.value)}>
            <option value="capo_cantiere">Capo Cantiere</option>
            <option value="fornitore">Fornitore</option>
            <option value="cliente">Cliente</option>
            <option value="admin">Admin</option>
          </select>
          <div className="flex gap-2 pt-1">
            <button onClick={() => setShowForm(false)} className="btn-secondary flex-1">Annulla</button>
            <button onClick={() => createMutation.mutate(form)} className="btn-primary flex-1"
              disabled={createMutation.isLoading || !form.nome || !form.email || !form.password}>
              {createMutation.isLoading ? 'Creazione...' : 'Crea Utente'}
            </button>
          </div>
        </div>
      )}

      {isLoading
        ? <div className="text-center py-8 text-gray-400">Caricamento...</div>
        : (
          <div className="space-y-2">
            {utenti.map(u => {
              const Icon = RUOLO_ICON[u.ruolo] || User
              return (
                <div key={u.id} className={`card flex items-center gap-3 ${!u.attivo ? 'opacity-50' : ''}`}>
                  <div className={`p-2 rounded-lg ${RUOLO_COLOR[u.ruolo]}`}>
                    <Icon size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900">{u.nome} {u.cognome}</p>
                    <p className="text-sm text-gray-500">{u.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${RUOLO_COLOR[u.ruolo]}`}>{RUOLO_LABEL[u.ruolo]}</span>
                    <button onClick={() => toggleMutation.mutate({ id: u.id, attivo: !u.attivo })}
                      className="text-gray-400 hover:text-steelex-orange transition-colors">
                      {u.attivo ? <ToggleRight size={24} className="text-green-500" /> : <ToggleLeft size={24} />}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
    </div>
  )
}
