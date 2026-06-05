/**
 * Vista dedicata al cliente — mostra solo avanzamento e pin visibili.
 * Nessun dato economico, nessun diario interno, nessun report.
 */
import { useState, useRef } from 'react'
import { useQuery } from 'react-query'
import { MapPin, Map, FileText, AlertTriangle, Wrench, CheckCircle2 } from 'lucide-react'
import api from '../lib/api'
import { useAuth } from '../lib/auth'

const TIPO_PIN = {
  lavorazione: { label: 'Lavorazione', color: '#2563eb', bg: 'bg-blue-100 text-blue-700' },
  criticita:   { label: 'Criticità',   color: '#dc2626', bg: 'bg-red-100 text-red-700' },
  nota:        { label: 'Nota',        color: '#d97706', bg: 'bg-yellow-100 text-yellow-700' },
}
const STATO_STYLE = {
  preventivo: 'bg-gray-100 text-gray-700',
  in_corso:   'bg-blue-100 text-blue-700',
  sospeso:    'bg-yellow-100 text-yellow-700',
  completato: 'bg-green-100 text-green-700',
  annullato:  'bg-red-100 text-red-700',
}
const STATO_LABEL = { preventivo: 'Preventivo', in_corso: 'In Corso', sospeso: 'Sospeso', completato: 'Completato', annullato: 'Annullato' }

function useAuthImage(url) {
  const [src, setSrc] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const prevUrl = useRef(null)

  if (url && url !== prevUrl.current) {
    prevUrl.current = url
    setSrc(null); setLoading(true); setError(false)
    if (url.startsWith('http')) {
      setSrc(url); setLoading(false)
    } else {
      api.get(url, { responseType: 'blob' })
        .then(r => { const o = URL.createObjectURL(r.data); setSrc(o) })
        .catch(() => setError(true))
        .finally(() => setLoading(false))
    }
  }
  return { src, loading, error }
}

export default function ClienteView({ cantiere }) {
  const { utente } = useAuth()
  const cantiereId = cantiere.id
  const [docAperto, setDocAperto] = useState(null)
  const [pinSel, setPinSel] = useState(null)
  const imgRef = useRef(null)

  const { data: docs = [] } = useQuery(
    ['documenti', cantiereId],
    () => api.get(`/cantieri/${cantiereId}/documenti`).then(r => r.data),
    { enabled: !!utente }
  )

  // Solo documenti con pin visibili al cliente
  const docsConPinCliente = docs.filter(d =>
    (d.pin_dati || []).some(p => (p.visibilita || []).includes('cliente'))
  )

  const previewUrl = (doc) => `/cantieri/${cantiereId}/documenti/${doc.id}/preview`

  return (
    <div className="max-w-2xl mx-auto space-y-4">

      {/* Header avanzamento */}
      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${STATO_STYLE[cantiere.stato]}`}>
            {STATO_LABEL[cantiere.stato]}
          </span>
          <span className="text-3xl font-bold text-steelex-orange">{cantiere.avanzamento}%</span>
        </div>

        {/* Barra avanzamento grande */}
        <div className="space-y-1">
          <div className="w-full bg-gray-100 rounded-full h-5 overflow-hidden">
            <div className="bg-steelex-orange h-5 rounded-full transition-all duration-700"
              style={{ width: `${cantiere.avanzamento}%` }} />
          </div>
          <p className="text-xs text-gray-400 text-right">Avanzamento lavori</p>
        </div>

        {/* Info essenziali */}
        <div className="grid grid-cols-2 gap-3 pt-2 border-t">
          {cantiere.data_inizio && (
            <div>
              <p className="text-xs text-gray-400">Inizio lavori</p>
              <p className="font-medium text-gray-800">{new Date(cantiere.data_inizio).toLocaleDateString('it-IT')}</p>
            </div>
          )}
          {cantiere.data_fine_prevista && (
            <div>
              <p className="text-xs text-gray-400">Fine prevista</p>
              <p className="font-medium text-gray-800">{new Date(cantiere.data_fine_prevista).toLocaleDateString('it-IT')}</p>
            </div>
          )}
          {cantiere.citta && (
            <div>
              <p className="text-xs text-gray-400">Cantiere</p>
              <p className="font-medium text-gray-800">{cantiere.citta}{cantiere.provincia ? ` (${cantiere.provincia})` : ''}</p>
            </div>
          )}
          {cantiere.indirizzo && (
            <div>
              <p className="text-xs text-gray-400">Indirizzo</p>
              <p className="font-medium text-gray-800 truncate">{cantiere.indirizzo}</p>
            </div>
          )}
        </div>
      </div>

      {/* Mappe con pin visibili al cliente */}
      {docsConPinCliente.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-bold text-gray-800 flex items-center gap-2">
            <Map size={18} className="text-steelex-orange" /> Planimetrie e lavorazioni
          </h2>
          {docsConPinCliente.map(doc => (
            <div key={doc.id} className="card space-y-3">
              <div className="flex items-center gap-2">
                {doc.tipo === 'pdf' ? <FileText size={16} className="text-red-500" /> : <Map size={16} className="text-steelex-orange" />}
                <p className="font-medium text-sm text-gray-800">{doc.nome}</p>
              </div>

              <MappaClienteViewer
                url={previewUrl(doc)}
                pins={(doc.pin_dati || []).filter(p => (p.visibilita || []).includes('cliente'))}
                pinSel={pinSel}
                onClickPin={pin => setPinSel(pinSel?.id === pin.id ? null : pin)}
              />

              {/* Dettaglio pin selezionato */}
              {pinSel && (doc.pin_dati||[]).find(p=>p.id===pinSel.id) && (
                <div className="rounded-xl border-2 p-3 space-y-1" style={{ borderColor: TIPO_PIN[pinSel.tipo]?.color || '#888' }}>
                  <div className="flex flex-wrap gap-1 mb-1">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${TIPO_PIN[pinSel.tipo]?.bg}`}>
                      {TIPO_PIN[pinSel.tipo]?.label}
                    </span>
                    {pinSel.stato === 'risolto' && (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700 flex items-center gap-1">
                        <CheckCircle2 size={10} /> Risolto
                      </span>
                    )}
                    {pinSel.stato === 'in_lavorazione' && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">In lavorazione</span>
                    )}
                    {pinSel.stato === 'aperto' && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">Segnalato</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-800">{pinSel.nota}</p>
                  {/* Foto del pin (se ci sono) */}
                  {pinSel.foto_urls?.length > 0 && (
                    <div className="flex gap-2 flex-wrap mt-1">
                      {pinSel.foto_urls.map((url, i) => (
                        <img key={i} src={url} className="w-20 h-20 object-cover rounded-lg border" alt="" />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Lista pin visibili */}
              {(() => {
                const pinsVisibili = (doc.pin_dati||[]).filter(p => (p.visibilita||[]).includes('cliente'))
                if (pinsVisibili.length === 0) return null
                return (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Punti segnalati ({pinsVisibili.length})</p>
                    {pinsVisibili.map(pin => (
                      <button key={pin.id} onClick={() => setPinSel(pinSel?.id === pin.id ? null : pin)}
                        className={`w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-colors ${pinSel?.id === pin.id ? 'bg-gray-100' : 'hover:bg-gray-50'}`}>
                        <MapPin size={14} style={{ color: TIPO_PIN[pin.tipo]?.color, flexShrink: 0 }} fill="currentColor" />
                        <span className="flex-1 truncate text-gray-700">{pin.nota}</span>
                        {pin.stato === 'risolto'
                          ? <CheckCircle2 size={14} className="text-green-500 flex-shrink-0" />
                          : pin.stato === 'in_lavorazione'
                            ? <span className="text-xs text-yellow-600 flex-shrink-0">In corso</span>
                            : <span className="text-xs text-red-500 flex-shrink-0">Aperto</span>}
                      </button>
                    ))}
                  </div>
                )
              })()}
            </div>
          ))}
        </div>
      )}

      {/* Nessuna mappa con pin cliente */}
      {docsConPinCliente.length === 0 && (
        <div className="card text-center py-8 text-gray-400">
          <Map size={32} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">Nessun aggiornamento disponibile</p>
          <p className="text-xs mt-1 text-gray-300">Il tuo cantiere è in corso — gli aggiornamenti appariranno qui</p>
        </div>
      )}
    </div>
  )
}

function MappaClienteViewer({ url, pins, pinSel, onClickPin }) {
  const { src, loading, error } = useAuthImage(url)
  const containerRef = useRef(null)

  return (
    <div ref={containerRef} className="relative w-full rounded-xl overflow-hidden border border-gray-200 bg-gray-100 select-none" style={{ minHeight: 80 }}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm">Caricamento mappa...</div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm">Mappa non disponibile</div>
      )}
      {src && <img src={src} alt="mappa" className="w-full h-auto block" draggable={false} />}
      {src && pins.map(pin => (
        <button key={pin.id}
          onClick={e => { e.stopPropagation(); onClickPin(pin) }}
          style={{
            position: 'absolute',
            left: `calc(${pin.x * 100}% - 14px)`,
            top: `calc(${pin.y * 100}% - 32px)`,
            color: pin.stato === 'risolto' ? '#16a34a' : (TIPO_PIN[pin.tipo]?.color || '#888'),
            filter: pinSel?.id === pin.id ? 'drop-shadow(0 0 6px rgba(0,0,0,0.7))' : 'drop-shadow(0 2px 3px rgba(0,0,0,0.5))',
            transform: pinSel?.id === pin.id ? 'scale(1.3)' : 'scale(1)',
            transition: 'transform 0.15s',
            zIndex: 10,
          }}
          title={pin.nota}
        >
          <MapPin size={28} fill="currentColor" />
        </button>
      ))}
    </div>
  )
}
