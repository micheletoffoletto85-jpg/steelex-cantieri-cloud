import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { UserPlus, Shield, HardHat, User, ToggleLeft, ToggleRight, Edit2, Trash2, X, Save, Briefcase, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../lib/api'
import { useAuth } from '../lib/auth'

const RUOLO_LABEL = {
  admin: 'Admin',
  capo_cantiere: 'Capo Cantiere',
  capo_cantiere_sub: 'Capo Cantiere Sub',
  direzione_lavori: 'Direzione Lavori',
  architetto: 'Architetto',
  responsabile_sicurezza: 'Resp. Sicurezza',
  amministrazione: 'Amministrazione',
  artigiano: 'Artigiano',
  operativo: 'Operativo Interno',
  fornitore: 'Fornitore',
  cliente: 'Cliente',
}
const RUOLO_DESC = {
  admin: 'Accesso completo a tutto',
  capo_cantiere: 'Staff STEELEX — accesso completo',
  capo_cantiere_sub: 'Subappaltato — no economia, può aggiungere lavori',
  direzione_lavori: 'DL esterno — no economia',
  architetto: 'Solo lettura — no economia',
  responsabile_sicurezza: 'Solo lettura — no economia',
  amministrazione: 'Lettura + scrittura, sempre presente su tutti i cantieri',
  artigiano: 'Subappaltatore esterno — inserisce note campo, vede sue attività',
  operativo: 'Dipendente interno — solo rapportini vocali, dashboard semplificata',
  fornitore: 'Inserisce note campo, upload documenti assegnati',
  cliente: 'Solo avanzamento lavori',
}
const RUOLO_ICON = {
  admin: Shield,
  capo_cantiere: HardHat,
  capo_cantiere_sub: HardHat,
  direzione_lavori: Briefcase,
  architetto: Briefcase,
  responsabile_sicurezza: Shield,
  amministrazione: Briefcase,
  artigiano: HardHat,
  operativo: HardHat,
  fornitore: User,
  cliente: User,
}
const RUOLO_COLOR = {
  admin: 'text-red-600 bg-red-50',
  capo_cantiere: 'text-blue-600 bg-blue-50',
  capo_cantiere_sub: 'text-cyan-600 bg-cyan-50',
  direzione_lavori: 'text-indigo-600 bg-indigo-50',
  architetto: 'text-violet-600 bg-violet-50',
  responsabile_sicurezza: 'text-rose-600 bg-rose-50',
  amministrazione: 'text-emerald-600 bg-emerald-50',
  artigiano: 'text-orange-600 bg-orange-50',
  operativo: 'text-teal-600 bg-teal-50',
  fornitore: 'text-purple-600 bg-purple-50',
  cliente: 'text-gray-600 bg-gray-50',
}

const PROFESSIONI = [
  'Muratore', 'Carpentiere in legno', 'Carpentiere metallico',
  'Elettricista', 'Idraulico / Termoidraulico', 'Installatore serramenti',
  'Tinteggiatore / Decoratore', 'Piastrellista', 'Pavimentatore',
  'Saldatore', 'Ponteggiatore', 'Trasportatore', 'Noleggio attrezzature',
  'Geometra', 'Ingegnere / Architetto', 'Altro',
]

const RUOLI_CON_PROFESSIONE = ['fornitore', 'artigiano']

const FORM_VUOTO = { nome: '', cognome: '', email: '', password: '', ruolo: 'capo_cantiere', tipo_professione: '' }

export default function UtentiPage() {
  const { utente: me } = useAuth()
  const [showCreate, setShowCreate] = useState(false)
  const [editando, setEditando] = useState(null)
  const [form, setForm] = useState(FORM_VUOTO)
  const [editForm, setEditForm] = useState({})
  const [confirmElimina, setConfirmElimina] = useState(null) // utente da eliminare
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
    setEditForm({ nome: u.nome, cognome: u.cognome, ruolo: u.ruolo, password: '', tipo_professione: u.tipo_professione || '' })
  }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const setE = (k, v) => setEditForm(f => ({ ...f, [k]: v }))

  const salvaModifica = () => {
    const payload = { ...editForm }
    if (!payload.password) delete payload.password
    if (!payload.tipo_professione) payload.tipo_professione = null
    updateMutation.mutate({ id: editando.id, data: payload })
  }

  const creaUtente = () => {
    const payload = { ...form }
    if (!payload.tipo_professione) delete payload.tipo_professione
    createMutation.mutate(payload)
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
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Ruolo</label>
            <select className="input-field" value={form.ruolo} onChange={e => set('ruolo', e.target.value)}>
              <option value="capo_cantiere">Capo Cantiere (interno STEELEX)</option>
              <option value="capo_cantiere_sub">Capo Cantiere Subappaltato</option>
              <option value="direzione_lavori">Direzione Lavori</option>
              <option value="architetto">Architetto</option>
              <option value="responsabile_sicurezza">Resp. Sicurezza</option>
              <option value="amministrazione">Amministrazione</option>
              <option value="artigiano">Artigiano (subappaltatore esterno)</option>
              <option value="operativo">Operativo Interno (dipendente)</option>
              <option value="fornitore">Fornitore</option>
              <option value="cliente">Cliente</option>
              <option value="admin">Admin</option>
            </select>
            {form.ruolo && <p className="text-xs text-gray-400 mt-1">{RUOLO_DESC[form.ruolo]}</p>}
          </div>
          {RUOLI_CON_PROFESSIONE.includes(form.ruolo) && (
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Tipo professione</label>
              <select className="input-field" value={form.tipo_professione} onChange={e => set('tipo_professione', e.target.value)}>
                <option value="">— seleziona —</option>
                {PROFESSIONI.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <button onClick={() => setShowCreate(false)} className="btn-secondary flex-1">Annulla</button>
            <button onClick={creaUtente} className="btn-primary flex-1"
              disabled={createMutation.isLoading || !form.nome || !form.email || !form.password}>
              {createMutation.isLoading ? 'Creazione...' : 'Crea Utente'}
            </button>
          </div>
        </div>
      )}

      {/* Form modifica */}
      {editando && (
        <div className="card space-y-3 border-2 border-fr-charcoal">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-lg">Modifica: {editando.nome} {editando.cognome}</h2>
            <button onClick={() => setEditando(null)} className="p-1 text-gray-400 hover:text-gray-600"><X size={18} /></button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input className="input-field" placeholder="Nome *" value={editForm.nome} onChange={e => setE('nome', e.target.value)} />
            <input className="input-field" placeholder="Cognome" value={editForm.cognome} onChange={e => setE('cognome', e.target.value)} />
          </div>
          <input className="input-field" type="password" placeholder="Nuova password (lascia vuoto per non cambiare)" value={editForm.password} onChange={e => setE('password', e.target.value)} />
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Ruolo</label>
            <select className="input-field" value={editForm.ruolo} onChange={e => setE('ruolo', e.target.value)}>
              <option value="capo_cantiere">Capo Cantiere (interno STEELEX)</option>
              <option value="capo_cantiere_sub">Capo Cantiere Subappaltato</option>
              <option value="direzione_lavori">Direzione Lavori</option>
              <option value="architetto">Architetto</option>
              <option value="responsabile_sicurezza">Resp. Sicurezza</option>
              <option value="amministrazione">Amministrazione</option>
              <option value="artigiano">Artigiano (subappaltatore esterno)</option>
              <option value="operativo">Operativo Interno (dipendente)</option>
              <option value="fornitore">Fornitore</option>
              <option value="cliente">Cliente</option>
              <option value="admin">Admin</option>
            </select>
            {editForm.ruolo && <p className="text-xs text-gray-400 mt-1">{RUOLO_DESC[editForm.ruolo]}</p>}
          </div>
          {RUOLI_CON_PROFESSIONE.includes(editForm.ruolo) && (
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Tipo professione</label>
              <select className="input-field" value={editForm.tipo_professione} onChange={e => setE('tipo_professione', e.target.value)}>
                <option value="">— seleziona —</option>
                {PROFESSIONI.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <button onClick={() => setEditando(null)} className="btn-secondary flex-1">Annulla</button>
            <button onClick={salvaModifica} disabled={updateMutation.isLoading} className="btn-primary flex-1 flex items-center justify-center gap-2">
              <Save size={16} /> {updateMutation.isLoading ? 'Salvataggio...' : 'Salva'}
            </button>
          </div>
        </div>
      )}

      {/* Dialogo conferma eliminazione */}
      {confirmElimina && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4 bg-black/50" onClick={() => setConfirmElimina(null)}>
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
                <AlertTriangle size={18} className="text-red-500" />
              </div>
              <p className="font-semibold text-gray-900">Eliminare {confirmElimina.nome} {confirmElimina.cognome}?</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setConfirmElimina(null)} className="btn-secondary flex-1">Annulla</button>
              <button onClick={() => { deleteMutation.mutate(confirmElimina.id); setConfirmElimina(null) }}
                className="flex-1 py-2.5 px-4 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-xl transition-colors">
                Elimina
              </button>
            </div>
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
                  <div className={`p-2 rounded-lg ${RUOLO_COLOR[u.ruolo] || 'text-gray-600 bg-gray-50'}`}>
                    <Icon size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900">{u.nome} {u.cognome} {isSelf && <span className="text-xs text-gray-400">(tu)</span>}</p>
                    <p className="text-sm text-gray-500">{u.email}</p>
                    {u.tipo_professione && (
                      <p className="text-xs text-purple-600 font-medium mt-0.5">{u.tipo_professione}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${RUOLO_COLOR[u.ruolo] || 'text-gray-600 bg-gray-50'}`}>
                      {RUOLO_LABEL[u.ruolo] || u.ruolo}
                    </span>
                    <button onClick={() => apriModifica(u)} className="p-1.5 text-gray-400 hover:text-fr-charcoal transition-colors" title="Modifica">
                      <Edit2 size={16} />
                    </button>
                    <button onClick={() => toggleMutation.mutate({ id: u.id, attivo: !u.attivo })}
                      className="text-gray-400 hover:text-fr-charcoal transition-colors" title={u.attivo ? 'Disattiva' : 'Attiva'}>
                      {u.attivo ? <ToggleRight size={24} className="text-green-500" /> : <ToggleLeft size={24} />}
                    </button>
                    {!isSelf && (
                      <button onClick={() => setConfirmElimina(u)}
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
