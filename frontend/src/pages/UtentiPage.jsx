import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { UserPlus, Shield, HardHat, User, ToggleLeft, ToggleRight, Edit2, Trash2, X, Save, Briefcase, AlertTriangle, KeyRound, Copy } from 'lucide-react'
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
  artigiano: 'Artigiano/operativo — se tipo professione = "Operativo Interno" ha dashboard semplificata',
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
  'Operativo Interno',
  'Muratore', 'Carpentiere in legno', 'Carpentiere metallico',
  'Elettricista', 'Idraulico / Termoidraulico', 'Installatore serramenti',
  'Tinteggiatore / Decoratore', 'Piastrellista', 'Pavimentatore',
  'Saldatore', 'Ponteggiatore', 'Trasportatore', 'Noleggio attrezzature',
  'Geometra', 'Ingegnere / Architetto', 'Altro',
]

const RUOLI_CON_PROFESSIONE = ['fornitore', 'artigiano']
const RUOLI_CON_COSTO = ['artigiano', 'operativo', 'capo_cantiere', 'capo_cantiere_sub']

const FORM_VUOTO = { nome: '', cognome: '', email: '', telefono: '', password: '', ruolo: 'capo_cantiere', tipo_professione: '', costo_orario: '' }

// Messaggio leggibile anche quando FastAPI risponde con la lista di errori di validazione (422):
// passare l'array a toast faceva sparire il messaggio o rompere la pagina
const msgErrore = (err, fallback) => {
  const d = err?.response?.data?.detail
  if (Array.isArray(d)) return d.map(e => (e.msg || '').replace(/^Value error, /, '') || JSON.stringify(e)).join(', ')
  return typeof d === 'string' ? d : fallback
}

// Password attualmente impostata (solo admin): si legge su richiesta
function PasswordAttuale({ utenteId, compatta = false }) {
  const [stato, setStato] = useState(null) // null | 'carico' | { password, nota }
  const leggi = async () => {
    if (stato && stato !== 'carico') { setStato(null); return }
    setStato('carico')
    try { setStato((await api.post(`/utenti/${utenteId}/mostra-password`)).data) }
    catch (e) { setStato(null); toast.error(msgErrore(e, 'Password non leggibile')) }
  }
  const copia = () => { navigator.clipboard?.writeText(stato.password).then(() => toast.success('Password copiata')) }
  const aperta = stato && stato !== 'carico'
  return (
    <div className={`flex items-center gap-1.5 flex-wrap ${compatta ? 'mt-1' : ''}`}>
      <button type="button" onClick={leggi}
        className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-steelex-orange px-2 py-1 rounded-md bg-gray-50 hover:bg-gray-100">
        <KeyRound size={13} /> {aperta ? 'Nascondi password' : stato === 'carico' ? 'Leggo…' : 'Vedi password'}
      </button>
      {aperta && (stato.password
        ? <>
            <code className="text-sm font-mono bg-yellow-50 border border-yellow-200 text-gray-900 px-2 py-0.5 rounded select-all">{stato.password}</code>
            <button type="button" onClick={copia} className="p-1 text-gray-400 hover:text-steelex-orange" title="Copia"><Copy size={14} /></button>
          </>
        : <span className="text-xs text-amber-600">{stato.nota}</span>)}
    </div>
  )
}

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
      onError: err => toast.error(msgErrore(err, 'Errore creazione'))
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
      onError: err => toast.error(msgErrore(err, 'Errore aggiornamento'))
    }
  )

  const deleteMutation = useMutation(
    id => api.delete(`/utenti/${id}`),
    {
      onSuccess: () => { qc.invalidateQueries('utenti'); toast.success('Utente eliminato') },
      onError: err => toast.error(msgErrore(err, 'Errore eliminazione'))
    }
  )

  const toggleMutation = useMutation(
    ({ id, attivo }) => api.put(`/utenti/${id}`, { attivo }),
    { onSuccess: () => qc.invalidateQueries('utenti'), onError: err => toast.error(msgErrore(err, 'Errore aggiornamento')) }
  )

  const apriModifica = (u) => {
    setEditando(u)
    setEditForm({ nome: u.nome, cognome: u.cognome, telefono: u.telefono || '', ruolo: u.ruolo, password: '', tipo_professione: u.tipo_professione || '', costo_orario: u.costo_orario ?? '' })
  }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const setE = (k, v) => setEditForm(f => ({ ...f, [k]: v }))

  const salvaModifica = () => {
    const payload = { ...editForm }
    if (!payload.password) delete payload.password
    if (!payload.tipo_professione) payload.tipo_professione = null
    payload.costo_orario = payload.costo_orario === '' || payload.costo_orario == null ? null : parseFloat(payload.costo_orario)
    updateMutation.mutate({ id: editando.id, data: payload })
  }

  const creaUtente = () => {
    const payload = { ...form }
    if (!payload.tipo_professione) delete payload.tipo_professione
    payload.costo_orario = payload.costo_orario === '' ? null : parseFloat(payload.costo_orario)
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
          <input className="input-field" type="tel" placeholder="Telefono" value={form.telefono} onChange={e => set('telefono', e.target.value)} />
          <div>
            <input className="input-field" type="text" autoComplete="off" placeholder="Password *" value={form.password} onChange={e => set('password', e.target.value)} />
            <p className="text-xs text-gray-400 mt-1">Almeno 8 caratteri, una maiuscola e un numero</p>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Ruolo</label>
            <select className="input-field" value={form.ruolo} onChange={e => set('ruolo', e.target.value)}>
              <option value="capo_cantiere">Capo Cantiere (interno STEELEX)</option>
              <option value="capo_cantiere_sub">Capo Cantiere Subappaltato</option>
              <option value="direzione_lavori">Direzione Lavori</option>
              <option value="architetto">Architetto</option>
              <option value="responsabile_sicurezza">Resp. Sicurezza</option>
              <option value="amministrazione">Amministrazione</option>
              <option value="artigiano">Artigiano / Operativo</option>
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
          {RUOLI_CON_COSTO.includes(form.ruolo) && (
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Costo orario manodopera (€/h)</label>
              <input className="input-field" type="number" step="0.5" min="0" placeholder="es. 28"
                value={form.costo_orario} onChange={e => set('costo_orario', e.target.value)} />
              <p className="text-xs text-gray-400 mt-1">Usato per valorizzare le ore di questo operatore nei costi cantiere</p>
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
        <div className="card space-y-3 border-2 border-steelex-orange">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-lg">Modifica: {editando.nome} {editando.cognome}</h2>
            <button onClick={() => setEditando(null)} className="p-1 text-gray-400 hover:text-gray-600"><X size={18} /></button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input className="input-field" placeholder="Nome *" value={editForm.nome} onChange={e => setE('nome', e.target.value)} />
            <input className="input-field" placeholder="Cognome" value={editForm.cognome} onChange={e => setE('cognome', e.target.value)} />
          </div>
          <input className="input-field" type="tel" placeholder="Telefono" value={editForm.telefono} onChange={e => setE('telefono', e.target.value)} />
          <div className="space-y-2">
            <PasswordAttuale utenteId={editando.id} />
            <input className="input-field" type="text" autoComplete="off" placeholder="Nuova password (lascia vuoto per non cambiare)" value={editForm.password} onChange={e => setE('password', e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Ruolo</label>
            <select className="input-field" value={editForm.ruolo} onChange={e => setE('ruolo', e.target.value)}>
              <option value="capo_cantiere">Capo Cantiere (interno STEELEX)</option>
              <option value="capo_cantiere_sub">Capo Cantiere Subappaltato</option>
              <option value="direzione_lavori">Direzione Lavori</option>
              <option value="architetto">Architetto</option>
              <option value="responsabile_sicurezza">Resp. Sicurezza</option>
              <option value="amministrazione">Amministrazione</option>
              <option value="artigiano">Artigiano / Operativo</option>
              {editando.ruolo === 'operativo' && <option value="operativo">Operativo Interno (solo rapportini)</option>}
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
          {RUOLI_CON_COSTO.includes(editForm.ruolo) && (
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Costo orario manodopera (€/h)</label>
              <input className="input-field" type="number" step="0.5" min="0" placeholder="es. 28"
                value={editForm.costo_orario ?? ''} onChange={e => setE('costo_orario', e.target.value)} />
              <p className="text-xs text-gray-400 mt-1">Usato per valorizzare le ore di questo operatore nei costi cantiere</p>
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
                    <p className="text-sm text-gray-500">{u.email}{u.telefono ? ` · ${u.telefono}` : ''}</p>
                    {u.tipo_professione && (
                      <p className="text-xs text-purple-600 font-medium mt-0.5">{u.tipo_professione}</p>
                    )}
                    <PasswordAttuale key={u.id} utenteId={u.id} compatta />
                  </div>
                  <div className="flex items-center gap-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${RUOLO_COLOR[u.ruolo] || 'text-gray-600 bg-gray-50'}`}>
                      {RUOLO_LABEL[u.ruolo] || u.ruolo}
                    </span>
                    <button onClick={() => apriModifica(u)} className="p-1.5 text-gray-400 hover:text-steelex-orange transition-colors" title="Modifica">
                      <Edit2 size={16} />
                    </button>
                    <button onClick={() => toggleMutation.mutate({ id: u.id, attivo: !u.attivo })}
                      className="text-gray-400 hover:text-steelex-orange transition-colors" title={u.attivo ? 'Disattiva' : 'Attiva'}>
                      {u.attivo ? <ToggleRight size={24} className="text-green-500" /> : <ToggleLeft size={24} />}
                    </button>
                    {!isSelf && (
                      <button onClick={() => setConfirmElimina(u)}
                        className="p-1.5 text-gray-400 hover:text-red-500 transition-colors" title="Elimina">
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
