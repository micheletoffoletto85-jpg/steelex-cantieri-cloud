import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { useNavigate } from 'react-router-dom'
import { Clock, Package, AlertTriangle, Euro, CheckCircle, XCircle, FileText, ChevronDown, ChevronUp } from 'lucide-react'
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
function RapportinoCard({ r, isAdmin, onValida }) {
  const [aperto, setAperto] = useState(false)

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
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${statoColor}`}>
            {r.stato}
          </span>
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

        {/* Dettaglio espanso */}
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
        <div className="px-4 pb-4 flex gap-2">
          <button onClick={() => onValida(r.id, false)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 transition-colors">
            <CheckCircle size={15} /> Valida
          </button>
          <button onClick={() => onValida(r.id, true)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-red-500 text-white rounded-lg text-sm font-semibold hover:bg-red-600 transition-colors">
            <XCircle size={15} /> Rifiuta
          </button>
        </div>
      )}
    </div>
  )
}

// ── Vista admin ───────────────────────────────────────────────────────────────
function VistaAdmin() {
  const qc = useQueryClient()
  const [tab, setTab] = useState('da-validare')

  const { data: daValidare = [] } = useQuery('rapp-da-validare',
    () => api.get('/rapportini/da-validare').then(r => r.data),
    { staleTime: 30000, enabled: tab === 'da-validare' })

  const { data: tutti = [] } = useQuery('rapp-tutti',
    () => api.get('/rapportini').then(r => r.data),
    { staleTime: 30000, enabled: tab === 'tutti' })

  const { data: fuoriCantiere = [] } = useQuery('rapp-fuori',
    () => api.get('/rapportini/fuori-cantiere').then(r => r.data),
    { staleTime: 30000, enabled: tab === 'fuori' })

  const validaMutation = useMutation(
    ({ id, rifiuta }) => api.put(`/rapportini/${id}/valida`, { rifiuta }),
    {
      onSuccess: () => {
        qc.invalidateQueries('rapp-da-validare')
        qc.invalidateQueries('rapp-tutti')
        qc.invalidateQueries('rapp-fuori')
      }
    }
  )

  const lista = tab === 'da-validare' ? daValidare : tab === 'fuori' ? fuoriCantiere : tutti

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Rapportini operativi</h1>
        {daValidare.length > 0 && (
          <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
            {daValidare.length} in attesa
          </span>
        )}
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

      {lista.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <FileText size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nessun rapportino</p>
        </div>
      ) : (
        <div className="space-y-3">
          {lista.map(r => (
            <RapportinoCard key={r.id} r={r} isAdmin
              onValida={(id, rifiuta) => validaMutation.mutate({ id, rifiuta })} />
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
