import { useQuery } from 'react-query'
import { CloudRain, Thermometer, MapPin, ExternalLink, AlertTriangle } from 'lucide-react'
import dayjs from 'dayjs'

/* Mappa codici meteo WMO → etichetta + emoji */
const WMO = [
  [[0], '☀️', 'Sereno'],
  [[1, 2], '🌤️', 'Poco nuvoloso'],
  [[3], '☁️', 'Nuvoloso'],
  [[45, 48], '🌫️', 'Nebbia'],
  [[51, 53, 55, 56, 57], '🌦️', 'Pioviggine'],
  [[61, 63, 65, 66, 67], '🌧️', 'Pioggia'],
  [[71, 73, 75, 77], '🌨️', 'Neve'],
  [[80, 81, 82], '🌧️', 'Rovesci'],
  [[85, 86], '🌨️', 'Neve'],
  [[95, 96, 99], '⛈️', 'Temporale'],
]
const CODICI_PIOGGIA = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99]

function decodeWmo(code) {
  const found = WMO.find(([codes]) => codes.includes(code))
  return found ? { emoji: found[1], label: found[2] } : { emoji: '🌡️', label: '—' }
}

/* Geocoding comune → previsioni 3 giorni (Open-Meteo, gratuito senza API key) */
async function fetchMeteo(comune) {
  const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(comune)}&count=1&language=it`)
  const geo = await geoRes.json()
  const loc = geo?.results?.[0]
  if (!loc) throw new Error('Località non trovata')
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum` +
    `&timezone=Europe%2FRome&forecast_days=3`
  const res = await fetch(url)
  const dati = await res.json()
  const d = dati.daily
  return d.time.map((data, i) => ({
    data,
    code: d.weather_code[i],
    tmax: Math.round(d.temperature_2m_max[i]),
    tmin: Math.round(d.temperature_2m_min[i]),
    probPioggia: d.precipitation_probability_max?.[i] ?? 0,
    mmPioggia: d.precipitation_sum?.[i] ?? 0,
  }))
}

function nomeGiorno(data, i) {
  if (i === 0) return 'Oggi'
  if (i === 1) return 'Domani'
  return dayjs(data).format('dddd')
}

export default function MeteoMappa({ cantiere }) {
  const comune = cantiere.citta || ''
  const indirizzoCompleto = [cantiere.indirizzo, cantiere.citta, cantiere.provincia].filter(Boolean).join(', ')

  const { data: giorni, isLoading, isError } = useQuery(
    ['meteo', comune],
    () => fetchMeteo(comune),
    { enabled: !!comune, staleTime: 30 * 60 * 1000, retry: 1 }
  )

  if (!comune && !indirizzoCompleto) return null

  // Allerte: pioggia prevista o caldo oltre 35°
  const allerte = []
  ;(giorni || []).forEach((g, i) => {
    const piove = CODICI_PIOGGIA.includes(g.code) || (g.probPioggia >= 50 && g.mmPioggia > 0.2)
    if (piove) allerte.push({ tipo: 'pioggia', giorno: nomeGiorno(g.data, i) })
    if (g.tmax >= 35) allerte.push({ tipo: 'caldo', giorno: nomeGiorno(g.data, i), tmax: g.tmax })
  })

  return (
    <div className="grid md:grid-cols-2 gap-4">
      {/* ── Meteo 3 giorni ── */}
      <div className="card space-y-3">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
          ⛅ Meteo — {comune || 'cantiere'}
        </p>

        {allerte.length > 0 && (
          <div className="space-y-1.5">
            {allerte.map((a, i) => (
              <div key={i} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${a.tipo === 'pioggia' ? 'bg-blue-50 text-blue-700' : 'bg-red-50 text-red-600'}`}>
                {a.tipo === 'pioggia'
                  ? <><CloudRain size={14} className="flex-shrink-0" /> Allerta pioggia — {a.giorno}</>
                  : <><Thermometer size={14} className="flex-shrink-0" /> Allerta caldo {a.tmax}° — {a.giorno}</>}
              </div>
            ))}
          </div>
        )}

        {isLoading && <p className="text-sm text-gray-400 text-center py-6">Caricamento meteo...</p>}
        {isError && (
          <p className="text-xs text-gray-400 text-center py-6 flex items-center justify-center gap-1">
            <AlertTriangle size={14} /> Meteo non disponibile per "{comune}"
          </p>
        )}

        {giorni && (
          <div className="grid grid-cols-3 gap-2">
            {giorni.map((g, i) => {
              const { emoji, label } = decodeWmo(g.code)
              const critico = CODICI_PIOGGIA.includes(g.code) || g.tmax >= 35
              return (
                <div key={g.data} className={`rounded-xl p-3 text-center ${critico ? 'bg-orange-50 ring-1 ring-orange-200' : 'bg-gray-50'}`}>
                  <p className="text-xs font-semibold text-gray-500 capitalize">{nomeGiorno(g.data, i)}</p>
                  <p className="text-[10px] text-gray-400 mb-1">{dayjs(g.data).format('DD/MM')}</p>
                  <p className="text-3xl leading-none mb-1">{emoji}</p>
                  <p className="text-[10px] text-gray-500 mb-1">{label}</p>
                  <p className="text-sm font-bold text-gray-800">{g.tmax}° <span className="font-normal text-gray-400 text-xs">/ {g.tmin}°</span></p>
                  {g.probPioggia > 0 && (
                    <p className="text-[10px] text-blue-500 mt-0.5 flex items-center justify-center gap-0.5">
                      <CloudRain size={10} /> {g.probPioggia}%
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Mappa Google ── */}
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
            <MapPin size={13} /> Posizione
          </p>
          <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(indirizzoCompleto || comune)}`}
            target="_blank" rel="noopener noreferrer"
            className="text-xs text-steelex-orange font-medium flex items-center gap-1 hover:underline">
            Apri in Maps <ExternalLink size={12} />
          </a>
        </div>
        <iframe
          title="Mappa cantiere"
          src={`https://www.google.com/maps?q=${encodeURIComponent(indirizzoCompleto || comune)}&output=embed&z=15`}
          className="w-full h-56 rounded-xl border-0"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
        <p className="text-xs text-gray-400 truncate">{indirizzoCompleto || comune}</p>
      </div>
    </div>
  )
}
