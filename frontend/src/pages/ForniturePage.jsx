import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { Star, ThumbsUp, ThumbsDown, Plus, X, ChevronDown, ChevronUp, User, HardHat, Search, Filter } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../lib/api'
import { useAuth } from '../lib/auth'

const CATEGORIE_RATING = [
  { value: 'puntualita', label: 'Puntualità' },
  { value: 'qualita', label: 'Qualità' },
  { value: 'prezzo', label: 'Prezzo' },
  { value: 'comunicazione', label: 'Comunicazione' },
  { value: 'sicurezza', label: 'Sicurezza' },
]

const PROFESSIONI_LABEL = {
  'Muratore': '🧱', 'Carpentiere in legno': '🪵', 'Carpentiere metallico': '⚙️',
  'Elettricista': '⚡', 'Idraulico / Termoidraulico': '🔧', 'Installatore serramenti': '🚪',
  'Tinteggiatore / Decoratore': '🎨', 'Piastrellista': '🏠', 'Pavimentatore': '🏗️',
  'Saldatore': '🔥', 'Ponteggiatore': '🏗️', 'Trasportatore': '🚚',
  'Noleggio attrezzature': '🔨', 'Geometra': '📐', 'Ingegnere / Architetto': '🏛️', 'Altro': '👷',
}

function StarsDisplay({ value, max = 5, size = 14 }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: max }).map((_, i) => (
        <Star key={i} size={size} className={i < Math.round(value) ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200 fill-gray-200'} />
      ))}
    </div>
  )
}

function StarsInput({ value, onChange }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} type="button" onClick={() => onChange(n)}>
          <Star size={22} className={n <= value ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300 fill-gray-300'} />
        </button>
      ))}
    </div>
  )
}

export default function ForniturePage() {
  const { utente } = useAuth()
  const qc = useQueryClient()
  const [filtroRuolo, setFiltroRuolo] = useState('tutti')
  const [filtroProfessione, setFiltroProfessione] = useState('')
  const [ricerca, setRicerca] = useState('')
  const [espanso, setEspanso] = useState(null)
  const [showRatingForm, setShowRatingForm] = useState(null)

  const puoScrivere = ['admin', 'capo_cantiere', 'amministrazione'].includes(utente?.ruolo)

  const { data: fornitori = [], isLoading } = useQuery(
    ['fornitori', filtroRuolo, filtroProfessione],
    () => api.get(`/fornitori?ruolo=${filtroRuolo}${filtroProfessione ? `&professione=${encodeURIComponent(filtroProfessione)}` : ''}`).then(r => r.data),
  )

  const filtrati = fornitori.filter(f =>
    !ricerca || `${f.nome} ${f.cognome} ${f.tipo_professione || ''}`.toLowerCase().includes(ricerca.toLowerCase())
  )

  const professioniUniche = [...new Set(fornitori.map(f => f.tipo_professione).filter(Boolean))].sort()

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Fornitori & Artigiani</h1>
        <span className="text-sm text-gray-500">{filtrati.length} contatti</span>
      </div>

      {/* Filtri */}
      <div className="flex gap-2 flex-wrap">
        {['tutti', 'fornitore', 'artigiano'].map(r => (
          <button key={r} onClick={() => setFiltroRuolo(r)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${filtroRuolo === r ? 'bg-steelex-orange text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>
            {r === 'tutti' ? 'Tutti' : r === 'fornitore' ? 'Fornitori' : 'Artigiani'}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input-field pl-8 text-sm" placeholder="Cerca nome, cognome, professione..."
            value={ricerca} onChange={e => setRicerca(e.target.value)} />
        </div>
        {professioniUniche.length > 0 && (
          <select className="input-field text-sm w-44" value={filtroProfessione} onChange={e => setFiltroProfessione(e.target.value)}>
            <option value="">Tutte le professioni</option>
            {professioniUniche.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        )}
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-gray-400">Caricamento...</div>
      ) : filtrati.length === 0 ? (
        <div className="card text-center py-10 text-gray-400">
          <User size={40} className="mx-auto mb-2 opacity-30" />
          <p>Nessun fornitore trovato</p>
          <p className="text-xs mt-1">Aggiungi fornitori dalla sezione Utenti</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtrati.map(f => (
            <FornitoreCard
              key={f.id}
              fornitore={f}
              espanso={espanso === f.id}
              onEspandi={() => setEspanso(espanso === f.id ? null : f.id)}
              puoScrivere={puoScrivere}
              showRatingForm={showRatingForm === f.id}
              onShowRatingForm={() => setShowRatingForm(showRatingForm === f.id ? null : f.id)}
              cantiereId={null}
              qc={qc}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function FornitoreCard({ fornitore: f, espanso, onEspandi, puoScrivere, showRatingForm, onShowRatingForm, qc }) {
  const [ratingForm, setRatingForm] = useState({ tipo: 'positivo', categoria: 'qualita', punteggio: 4, testo: '' })

  const { data: ratings = [] } = useQuery(
    ['ratings', f.id],
    () => api.get(`/fornitori/${f.id}/rating`).then(r => r.data),
    { enabled: espanso }
  )

  const addRatingMutation = useMutation(
    body => api.post(`/fornitori/${f.id}/rating`, body),
    {
      onSuccess: () => {
        qc.invalidateQueries(['ratings', f.id])
        qc.invalidateQueries(['fornitori'])
        onShowRatingForm()
        toast.success('Feedback aggiunto!')
      },
      onError: err => toast.error(err.response?.data?.detail || 'Errore'),
    }
  )

  const deleteRatingMutation = useMutation(
    ratingId => api.delete(`/fornitori/${f.id}/rating/${ratingId}`),
    { onSuccess: () => { qc.invalidateQueries(['ratings', f.id]); qc.invalidateQueries(['fornitori']) } }
  )

  const emoji = PROFESSIONI_LABEL[f.tipo_professione] || '👷'
  const badge = f.media_punteggio
    ? f.media_punteggio >= 4 ? 'bg-green-100 text-green-700' : f.media_punteggio >= 3 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
    : 'bg-gray-100 text-gray-500'

  return (
    <div className="card">
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className="w-10 h-10 rounded-full bg-steelex-orange/10 flex items-center justify-center text-lg flex-shrink-0">
          {emoji}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-gray-900">{f.nome} {f.cognome}</p>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${f.ruolo === 'fornitore' ? 'bg-purple-100 text-purple-700' : 'bg-orange-100 text-orange-700'}`}>
              {f.ruolo === 'fornitore' ? 'Fornitore' : 'Artigiano'}
            </span>
          </div>
          {f.tipo_professione && <p className="text-xs text-gray-500 mt-0.5">{f.tipo_professione}</p>}

          {/* Rating summary */}
          <div className="flex items-center gap-3 mt-1">
            {f.media_punteggio ? (
              <>
                <StarsDisplay value={f.media_punteggio} size={12} />
                <span className={`text-xs px-1.5 py-0.5 rounded font-bold ${badge}`}>
                  {f.media_punteggio.toFixed(1)}
                </span>
              </>
            ) : (
              <span className="text-xs text-gray-400">Nessun feedback</span>
            )}
            {f.totale_feedback > 0 && (
              <span className="text-xs text-gray-400">
                {f.feedback_positivi > 0 && <span className="text-green-600">+{f.feedback_positivi}</span>}
                {f.feedback_negativi > 0 && <span className="text-red-500 ml-1">−{f.feedback_negativi}</span>}
                {' '}({f.totale_feedback} tot.)
              </span>
            )}
          </div>
        </div>

        {/* Expand */}
        <button onClick={onEspandi} className="p-1 text-gray-400 hover:text-gray-600">
          {espanso ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
      </div>

      {/* Dettaglio espanso */}
      {espanso && (
        <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
          {/* Form nuovo feedback */}
          {puoScrivere && (
            <div>
              {showRatingForm ? (
                <div className="bg-gray-50 rounded-xl p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold">Aggiungi feedback</h4>
                    <button onClick={onShowRatingForm}><X size={16} className="text-gray-400" /></button>
                  </div>
                  <div className="flex gap-2">
                    {[['positivo','Positivo','text-green-600'],['neutro','Neutro','text-gray-500'],['negativo','Negativo','text-red-500']].map(([v,l,cls]) => (
                      <button key={v} onClick={() => setRatingForm(f => ({...f, tipo: v}))}
                        className={`flex-1 py-1.5 text-xs rounded-lg font-medium border transition-colors ${ratingForm.tipo === v ? 'border-current ' + cls + ' bg-white shadow-sm' : 'border-gray-200 text-gray-400'}`}>
                        {l}
                      </button>
                    ))}
                  </div>
                  <select className="input-field text-sm" value={ratingForm.categoria} onChange={e => setRatingForm(f => ({...f, categoria: e.target.value}))}>
                    {CATEGORIE_RATING.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Punteggio</p>
                    <StarsInput value={ratingForm.punteggio} onChange={v => setRatingForm(f => ({...f, punteggio: v}))} />
                  </div>
                  <textarea className="input-field text-sm h-16 resize-none" placeholder="Note (opzionale)..."
                    value={ratingForm.testo} onChange={e => setRatingForm(f => ({...f, testo: e.target.value}))} />
                  <button
                    onClick={() => addRatingMutation.mutate({ ...ratingForm, fornitore_id: f.id })}
                    disabled={addRatingMutation.isLoading}
                    className="btn-primary w-full text-sm py-2"
                  >
                    {addRatingMutation.isLoading ? 'Salvataggio...' : 'Salva feedback'}
                  </button>
                </div>
              ) : (
                <button onClick={onShowRatingForm} className="w-full py-2 text-sm font-medium rounded-xl border border-dashed border-steelex-orange text-steelex-orange hover:bg-orange-50 flex items-center justify-center gap-2">
                  <Plus size={14} /> Aggiungi feedback
                </button>
              )}
            </div>
          )}

          {/* Lista feedback */}
          {ratings.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-2">Nessun feedback ancora</p>
          ) : (
            <div className="space-y-2">
              {ratings.map(r => (
                <div key={r.id} className="flex items-start gap-2 p-2 rounded-lg bg-gray-50">
                  <div className={`mt-0.5 flex-shrink-0 ${r.tipo === 'positivo' ? 'text-green-500' : r.tipo === 'negativo' ? 'text-red-400' : 'text-gray-400'}`}>
                    {r.tipo === 'positivo' ? <ThumbsUp size={13} /> : r.tipo === 'negativo' ? <ThumbsDown size={13} /> : <Star size={13} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-gray-600">{CATEGORIE_RATING.find(c => c.value === r.categoria)?.label || r.categoria}</span>
                      <StarsDisplay value={r.punteggio} size={10} />
                    </div>
                    {r.testo && <p className="text-xs text-gray-600 mt-0.5">{r.testo}</p>}
                    <p className="text-[10px] text-gray-400 mt-0.5">{r.creato_il ? new Date(r.creato_il).toLocaleDateString('it-IT') : ''}</p>
                  </div>
                  {puoScrivere && (
                    <button onClick={() => deleteRatingMutation.mutate(r.id)} className="p-1 text-gray-300 hover:text-red-400">
                      <X size={12} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
