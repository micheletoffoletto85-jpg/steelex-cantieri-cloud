import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { UserPlus, Shield, HardHat, User, ToggleLeft, ToggleRight, Edit2, Trash2, X, Save } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../lib/api'
import { useAuth } from '../lib/auth'

const RUOLO_LABEL = { admin: 'Admin', capo_cantiere: 'Capo Cantiere', fornitore: 'Fornitore', cliente: 'Cliente' }
const RUOLO_ICON = { admin: Shield, capo_cantiere: HardHat, fornitore: User, cliente: User }
const RUOLO_COLOR = { admin: 'text-red-600 bg-red-50', capo_cantiere: 'text-blue-600 bg-blue-50', fornitore: 'text-purple-600 bg-purple-50', cliente: 'text-gray-600 bg-gray-50' }

const FORM_VUOTO = { nome: '', cognome: '', email: '', password: '', ruolo: 'capo_cantiere' }

export default function UtentiPage() {
  const { utente: me } = useAuth()
  const [showCreate, setShowCreate] = useState(false)
  const [editando, setEditando] = useState(null) // utente in modifica
  const [form, setForm] = useState(FORM_VUOTO)
  const [editForm, setEditForm] = useState({})
  const qc = useQueryClient()

  const { data: utenti = [], isLoading } = useQuery('utenti', () => api.get('/utenti').then(r => r.data))

  const createMutation = useMutation(
    data => api.post('/utenti', data),
    {
      onSuccess: () => {
        qc.invalidateQueries('utenti')
        setShowCreate(false)
        setForm(FORM_VUOTO)
        toast.success('Utente creato!')
      },
      onError: err => {
        const d = err.response?.data?.detail
        const msg = Array.isArray(d) ? d.map(e => e.msg || JSON.stringify(e)).join(', ') : (d || 'Errore creazione')
        toast.error(msg)
      }
    }
  )

  const updateMutation = useMutation(
    ({ id, data }) => api.put(`/utenti/${id}`, data),
    {
      onSuccess: () => {
        qc.invalidateQueries('utenti')
        setEditando(null)
        toast.success('Utente aggiornato!')
      },
      onError: err => toast.error(err.response?.data?.detail || 'Errore aggiornamento')
    }
  )

  const deleteMutation = useMutation(
    id => api.delete(`/utenti/${id}`),
    {
      onSuccess: () => { qc.invalidateQueries('utenti'); toast.success('Utente eliminato') },
      onError: err => toast.error(err.response?.data?.detail || 'Errore eliminazione')
    }
  )

  const toggleMutation = useMutation(
    ({ id, attivo }) => api.put(`/utenti/${id}`, { attivo }),
    { onSuccess: () => qc.invalidateQueries('utenti') }
  )

  const apriModifica = (u) => {
    setEditando(u)
    setEditForm({ nome: u.nome, cognome: u.cognome, ruolo: u.ruolo, password: '' })
  }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const setE = (k, v) => setEditForm(f => ({ ...f, [k]: v }))

  const salvaModifica = () => {
    const payload = { ...editForm }
    if (!payload.password) delete payload.password
    updateMutation.mutate({ id: editando.id, data: payload })
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Utenti</h1>
        <button onClick={() => { setShowCreate(true); setEditando(null) }} className="btn-primary flex items-center gap-2">
          <UserPlus size={18} /> Aggiungi
        </button>
      </div>

      {/* Form creazione */}
      {showCreate && (
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-lg">Nuovo Utente</h2>
            <button onClick={() => setShowCreate(false)} className="p-1 text-gray-400 hover:text-gray-600"><X size={18} /></button>
          </div>
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
            <button onClick={() => setShowCreate(false)} className="btn-secondary flex-1">Annulla</button>
            <button onClick={() => createMutation.mutate(form)} className="btn-primary flex-1"
              disabled={createMutation.isLoading || !form.nome || !form.email || !form.password}>
              {createMutation.isLoading ? 'Creazione...' : 'Crea Utente'}
            </button>
          </div>
        </div>
      )}

      {/* Form modifica */}
      {editando && (
        <div className="card space-y-3 border-2 border-steelex-orange">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-lg">Modifica: {editando.nome} {editando.cognome}</h2>
            <button onClick={() => setEditando(null)} className="p-1 text-gray-400 hover:text-gray-600"><X size={18} /></button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input className="input-field" placeholder="Nome *" value={editForm.nome} onChange={e => setE('nome', e.target.value)} />
            <input className="input-field" placeholder="Cognome" value={editForm.cognome} onChange={e => setE('cognome', e.target.value)} />
          </div>
          <input className="input-field" type="password" placeholder="Nuova password (lascia vuoto per non cambiare)" value={editForm.password} onChange={e => setE('password', e.target.value)} />
          <select className="input-field" value={editForm.ruolo} onChange={e => setE('ruolo', e.target.value)}>
            <option value="capo_cantiere">Capo Cantiere</option>
            <option value="fornitore">Fornitore</option>
            <option value="cliente">Cliente</option>
            <option value="admin">Admin</option>
          </select>
          <div className="flex gap-2 pt-1">
            <button onClick={() => setEditando(null)} className="btn-secondary flex-1">Annulla</button>
            <button onClick={salvaModifica} disabled={updateMutation.isLoading} className="btn-primary flex-1 flex items-center justify-center gap-2">
              <Save size={16} /> {updateMutation.isLoading ? 'Salvataggio...' : 'Salva'}
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
              const isSelf = u.id === me?.id
              return (
                <div key={u.id} className={`card flex items-center gap-3 ${!u.attivo ? 'opacity-50' : ''}`}>
                  <div className={`p-2 rounded-lg ${RUOLO_COLOR[u.ruolo]}`}>
                    <Icon size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900">{u.nome} {u.cognome} {isSelf && <span className="text-xs text-gray-400">(tu)</span>}</p>
                    <p className="text-sm text-gray-500">{u.email}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${RUOLO_COLOR[u.ruolo]}`}>{RUOLO_LABEL[u.ruolo]}</span>
                    <button onClick={() => apriModifica(u)} className="p-1.5 text-gray-400 hover:text-steelex-orange transition-colors" title="Modifica">
                      <Edit2 size={16} />
                    </button>
                    <button onClick={() => toggleMutation.mutate({ id: u.id, attivo: !u.attivo })}
                      className="text-gray-400 hover:text-steelex-orange transition-colors" title={u.attivo ? 'Disattiva' : 'Attiva'}>
                      {u.attivo ? <ToggleRight size={24} className="text-green-500" /> : <ToggleLeft size={24} />}
                    </button>
                    {!isSelf && (
                      <button onClick={() => { if (confirm(`Eliminare ${u.nome} ${u.cognome}?`)) deleteMutation.mutate(u.id) }}
                        className="p-1.5 text-gray-300 hover:text-red-500 transition-colors" title="Elimina">
                        <Trash2 size={16} />
                      </button>
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
