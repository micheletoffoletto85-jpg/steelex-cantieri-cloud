import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { useNavigate } from 'react-router-dom'
import { Clock, Package, AlertTriangle, Euro, CheckCircle, XCircle, FileText, ChevronDown, ChevronUp, MapPin, Trash2 } from 'lucide-react'
import api from '../lib/api'
import { useAuth } from '../lib/auth'

const RUOLI_ADMIN = ['admin', 'capo_cantiere', 'capo_cantiere_sub', 'direzione_lavori', 'amministrazione']

// ── Chip colorati ─────────────────────────────────────────────────────────────
function Chips({ rapportino }) {
  const chips = []
  if (rapportino.ore_lavorate)
    chips.push({ icon: Clock, label: `${rapportino.ore_lavorate}h`, color: 'bg-blue-100 text-blue-700' })
  if (rapportino.materiali?.length)
    chips.push({ icon: Package, label: `${rapportino.materiali.length} mat.`, color: 'bg-green-100 text-green-700' })
  if (rapportino.criticita)
    chips.push({ icon: AlertTriangle, label: 'Criticità', color: 'bg-red-100 text-red-700' })
  if (rapportino.spese_extra?.length)
    chips.push({ icon: Euro, label: `${rapportino.spese_extra.length} extra`, color: 'bg-yellow-100 text-yellow-700' })
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {chips.map(({ icon: Icon, label, color }, i) => (
        <span key={i} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${color}`}>
          <Icon size={10} /> {label}
        </span>
      ))}
    </div>
  )
}

// ── Card rapportino ───────────────────────────────────────────────────────────
function RapportinoCard({ r, isAdmin, onValida, onElimina, cantieri = [] }) {
  const [aperto, setAperto] = useState(false)
  const [noteAdmin, setNoteAdmin] = useState('')
  const [cantiereAssegnato, setCantiereAssegnato] = useState('')
  const [confermaElimina, setConfermaElimina] = useState(false)

  const suggerito = cantieri.find(c =>
    r.cantiere_rilevato && c.nome?.toLowerCase().includes(r.cantiere_rilevato.toLowerCase())
  )

  const statoColor = {
    inviato: 'bg-yellow-100 text-yellow-700',
    validato: 'bg-green-100 text-green-700',
    rifiutato: 'bg-red-100 text-red-700',
  }[r.stato] || 'bg-gray-100 text-gray-600'

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            {isAdmin && (
              <p className="text-xs text-gray-500 mb-0.5">{r.operativo_nome}</p>
            )}
            <p className="font-semibold text-gray-900 text-sm leading-snug">{r.riassunto}</p>
            {r.cantiere_nome ? (
              <p className="text-xs text-steelex-orange font-medium mt-0.5">{r.cantiere_nome}</p>
            ) : r.cantiere_rilevato ? (
              <p className="text-xs text-gray-400 mt-0.5">"{r.cantiere_rilevato}" — non abbinato</p>
            ) : null}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statoColor}`}>
              {r.stato}
            </span>
            {isAdmin && (
              confermaElimina ? (
                <div className="flex items-center gap-1">
                  <button onClick={() => onElimina(r.id)}
                    className="text-xs bg-red-600 text-white px-2 py-0.5 rounded font-semibold hover:bg-red-700">
                    Conferma
                  </button>
                  <button onClick={() => setConfermaElimina(false)}
                    className="text-xs text-gray-400 hover:text-gray-600 px-1">
                    Annulla
                  </button>
                </div>
              ) : (
                <button onClick={() => setConfermaElimina(true)}
                  className="text-gray-300 hover:text-red-500 transition-colors"
                  title="Elimina rapportino">
                  <Trash2 size={14} />
                </button>
              )
            )}
          </div>
        </div>

        <Chips rapportino={r} />

        <div className="flex items-center justify-between mt-3">
          <span className="text-xs text-gray-400">
            {r.data_lavoro ? new Date(r.data_lavoro).toLocaleDateString('it-IT') : '—'}
            {r.lingua_originale && r.lingua_originale !== 'it' && (
              <span className="ml-2 text-gray-300">({r.lingua_originale.toUpperCase()})</span>
            )}
          </span>
          <button onClick={() => setAperto(v => !v)}
            className="text-xs text-gray-500 flex items-center gap-1 hover:text-gray-700">
            {aperto ? <><ChevronUp size={12} /> meno</> : <><ChevronDown size={12} /> dettagli</>}
          </button>
        </div>

        {aperto && (
          <div className="mt-3 pt-3 border-t border-gray-100 space-y-2 text-sm text-gray-700">
            {r.testo_italiano && (
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-1">Testo completo</p>
                <p className="text-xs leading-relaxed bg-gray-50 p-2 rounded">{r.testo_italiano}</p>
              </div>
            )}
            {r.lavorazioni?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-1">Lavorazioni</p>
                <ul className="text-xs space-y-0.5">
                  {r.lavorazioni.map((l, i) => <li key={i} className="flex gap-1"><span className="text-gray-400">•</span>{l}</li>)}
                </ul>
              </div>
            )}
            {r.materiali?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-1">Materiali</p>
                <div className="flex flex-wrap gap-1">
                  {r.materiali.map((m, i) => (
                    <span key={i} className="bg-green-50 text-green-700 px-2 py-0.5 rounded text-xs">{m}</span>
                  ))}
                </div>
              </div>
            )}
            {r.criticita && (
              <div className="bg-red-50 text-red-700 p-2 rounded text-xs">
                <span className="font-semibold">⚠️ Criticità: </span>{r.criticita}
              </div>
            )}
            {r.spese_extra?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-1">Spese extra</p>
                {r.spese_extra.map((s, i) => (
                  <div key={i} className="flex justify-between text-xs bg-yellow-50 px-2 py-1 rounded mb-0.5">
                    <span>{s.descrizione}</span>
                    {s.importo != null && <span className="font-semibold">€{s.importo}</span>}
                  </div>
                ))}
              </div>
            )}
            {r.foto_urls?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-1">Foto allegate</p>
                <div className="flex flex-wrap gap-1.5">
                  {r.foto_urls.map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                      <img src={url} alt="" className="w-16 h-16 object-cover rounded-lg border border-gray-200 hover:opacity-80 transition-opacity" />
                    </a>
                  ))}
                </div>
              </div>
            )}
            {r.note_admin && (
              <div className="bg-gray-50 p-2 rounded text-xs text-gray-600">
                <span className="font-semibold">Note admin: </span>{r.note_admin}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Azioni admin */}
      {isAdmin && r.stato === 'inviato' && (
        <div className="px-4 pb-4 space-y-2">
          {/* Assegnazione cantiere — se fuori cantiere */}
          {r.fuori_cantiere && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
              <div className="flex items-center gap-1.5">
                <MapPin size={13} className="text-amber-600"/>
                <p className="text-xs font-semibold text-amber-800">
                  {r.cantiere_rilevato
                    ? <>Operativo ha citato: <strong>"{r.cantiere_rilevato}"</strong> — non abbinato</>
                    : 'Nessun cantiere indicato'}
                </p>
              </div>
              {suggerito && !cantiereAssegnato && (
                <button
                  onClick={() => setCantiereAssegnato(String(suggerito.id))}
                  className="text-xs text-amber-700 underline">
                  Assegna a "{suggerito.nome}"
                </button>
              )}
              <select
                value={cantiereAssegnato}
                onChange={e => setCantiereAssegnato(e.target.value)}
                className="w-full border border-amber-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white">
                <option value="">— lascia fuori cantiere —</option>
                {cantieri.map(c => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
            </div>
          )}
          <input
            type="text"
            placeholder="Note di validazione (opzionale)"
            value={noteAdmin}
            onChange={e => setNoteAdmin(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-steelex-orange"
          />
          <div className="flex gap-2">
            <button onClick={() => onValida(r.id, false, noteAdmin, cantiereAssegnato || null)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 transition-colors">
              <CheckCircle size={15} /> {cantiereAssegnato ? 'Assegna e valida' : 'Valida'}
            </button>
            <button onClick={() => onValida(r.id, true, noteAdmin, null)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-red-500 text-white rounded-lg text-sm font-semibold hover:bg-red-600 transition-colors">
              <XCircle size={15} /> Rifiuta
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Banner costi non assegnati ────────────────────────────────────────────────
function BannerCostiNonAssegnati({ lista }) {
  const totOre = lista.reduce((s, r) => s + (r.ore_lavorate || 0), 0)
  const totOreExtra = lista.reduce((s, r) => s + (r.ore_extra || 0), 0)
  const tuttiMateriali = lista.flatMap(r => r.materiali || [])
  const daAssegnare = lista.filter(r => r.stato === 'inviato').length

  if (!lista.length) return null

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Euro size={16} className="text-amber-600"/>
        <p className="text-sm font-bold text-amber-900">Costi non imputati a cantiere</p>
        {daAssegnare > 0 && (
          <span className="ml-auto bg-amber-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
            {daAssegnare} da assegnare
          </span>
        )}
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-lg p-2.5 text-center border border-amber-100">
          <p className="text-lg font-bold text-gray-900">{totOre > 0 ? totOre.toFixed(1) : '—'}</p>
          <p className="text-xs text-gray-500">ore lavorate</p>
        </div>
        <div className="bg-white rounded-lg p-2.5 text-center border border-amber-100">
          <p className="text-lg font-bold text-gray-900">{totOreExtra > 0 ? totOreExtra.toFixed(1) : '—'}</p>
          <p className="text-xs text-gray-500">ore extra</p>
        </div>
        <div className="bg-white rounded-lg p-2.5 text-center border border-amber-100">
          <p className="text-lg font-bold text-gray-900">{tuttiMateriali.length || '—'}</p>
          <p className="text-xs text-gray-500">voci materiali</p>
        </div>
      </div>
      {tuttiMateriali.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-amber-700 mb-1">Materiali non assegnati:</p>
          <div className="flex flex-wrap gap-1">
            {[...new Set(tuttiMateriali)].slice(0, 10).map((m, i) => (
              <span key={i} className="bg-white border border-amber-200 text-amber-800 text-xs px-2 py-0.5 rounded-full">{m}</span>
            ))}
            {tuttiMateriali.length > 10 && (
              <span className="text-xs text-amber-600">+{tuttiMateriali.length - 10} altri</span>
            )}
          </div>
        </div>
      )}
      <p className="text-xs text-amber-700">
        Assegna questi rapportini al cantiere corretto durante la validazione per imputarne i costi.
      </p>
    </div>
  )
}

// ── Vista admin ───────────────────────────────────────────────────────────────
function VistaAdmin() {
  const qc = useQueryClient()
  const [tab, setTab] = useState('da-validare')

  const { data: daValidare = [] } = useQuery('rapp-da-validare',
    () => api.get('/rapportini/da-validare').then(r => r.data),
    { staleTime: 30000 })

  const { data: tutti = [] } = useQuery('rapp-tutti',
    () => api.get('/rapportini').then(r => r.data),
    { staleTime: 30000, enabled: tab === 'tutti' })

  const { data: fuoriCantiere = [] } = useQuery('rapp-fuori',
    () => api.get('/rapportini/fuori-cantiere').then(r => r.data),
    { staleTime: 30000 })

  const { data: cantieri = [] } = useQuery('cantieri-lista-rap',
    () => api.get('/cantieri').then(r => r.data.filter(c =>
      ['attivo', 'in_corso', 'preventivo'].includes(c.stato)
    )), { staleTime: 120000 })

  const validaMutation = useMutation(
    ({ id, rifiuta, note_admin, cantiere_id }) =>
      api.put(`/rapportini/${id}/valida`, { rifiuta, note_admin, cantiere_id: cantiere_id ? parseInt(cantiere_id) : null }),
    {
      onSuccess: () => {
        qc.invalidateQueries('rapp-da-validare')
        qc.invalidateQueries('rapp-tutti')
        qc.invalidateQueries('rapp-fuori')
      }
    }
  )

  const eliminaMutation = useMutation(
    (id) => api.delete(`/rapportini/${id}`),
    {
      onSuccess: () => {
        qc.invalidateQueries('rapp-da-validare')
        qc.invalidateQueries('rapp-tutti')
        qc.invalidateQueries('rapp-fuori')
      }
    }
  )

  const lista = tab === 'da-validare' ? daValidare : tab === 'fuori' ? fuoriCantiere : tutti
  const fuoriCount = fuoriCantiere.filter(r => r.stato === 'inviato').length

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Rapportini operativi</h1>
        <div className="flex gap-2">
          {daValidare.length > 0 && (
            <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
              {daValidare.length} in attesa
            </span>
          )}
          {fuoriCount > 0 && (
            <span className="bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
              {fuoriCount} fuori cant.
            </span>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
        {[
          { key: 'da-validare', label: 'Da validare' },
          { key: 'fuori', label: 'Fuori cantiere' },
          { key: 'tutti', label: 'Tutti' },
        ].map(({ key, label }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-semibold transition-colors ${
              tab === key ? 'bg-white text-steelex-orange shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'fuori' && <BannerCostiNonAssegnati lista={fuoriCantiere} />}

      {lista.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <FileText size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">{tab === 'fuori' ? 'Nessun costo non assegnato' : 'Nessun rapportino'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {lista.map(r => (
            <RapportinoCard key={r.id} r={r} isAdmin cantieri={cantieri}
              onValida={(id, rifiuta, note_admin, cantiere_id) =>
                validaMutation.mutate({ id, rifiuta, note_admin, cantiere_id })}
              onElimina={(id) => eliminaMutation.mutate(id)} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Entry point ───────────────────────────────────────────────────────────────
export default function RapportiniPage() {
  const { utente } = useAuth()
  const navigate = useNavigate()
  const isAdmin = RUOLI_ADMIN.includes(utente?.ruolo)

  // Operativi usano la dashboard (la registrazione è lì)
  if (!isAdmin) {
    navigate('/', { replace: true })
    return null
  }

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <VistaAdmin />
    </div>
  )
}
