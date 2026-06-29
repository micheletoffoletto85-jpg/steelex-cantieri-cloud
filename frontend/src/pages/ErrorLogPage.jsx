import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { AlertTriangle, Trash2, RefreshCw, X } from 'lucide-react'
import api from '../lib/api'
import dayjs from 'dayjs'

const COLORI_STATUS = {
  400: 'bg-yellow-100 text-yellow-800',
  403: 'bg-orange-100 text-orange-800',
  404: 'bg-gray-100 text-gray-600',
  422: 'bg-yellow-100 text-yellow-700',
  500: 'bg-red-100 text-red-800',
}

export default function ErrorLogPage() {
  const qc = useQueryClient()
  const [dettaglio, setDettaglio] = useState(null)

  const { data, isLoading, refetch } = useQuery(
    'error-log',
    () => api.get('/error-log?limit=200').then(r => r.data),
    { staleTime: 30000 }
  )

  const elimina = useMutation(
    (id) => api.delete(`/error-log/${id}`),
    { onSuccess: () => qc.invalidateQueries('error-log') }
  )

  const svuota = useMutation(
    () => api.delete('/error-log'),
    { onSuccess: () => qc.invalidateQueries('error-log') }
  )

  const errori = data?.errori || []
  const totale = data?.totale || 0

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <AlertTriangle size={20} className="text-red-500" />
            Error Log
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">{totale} errori registrati — visibile solo admin</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => refetch()}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
            <RefreshCw size={14} /> Aggiorna
          </button>
          {errori.length > 0 && (
            <button onClick={() => { if (window.confirm('Svuotare tutto il log?')) svuota.mutate() }}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors border border-red-200">
              <Trash2 size={14} /> Svuota tutto
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-gray-400">Caricamento...</div>
      ) : errori.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">
          <AlertTriangle size={36} className="mx-auto mb-3 opacity-20" />
          <p className="font-medium">Nessun errore registrato</p>
          <p className="text-xs mt-1">Gli errori API degli utenti appariranno qui</p>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Data/Ora</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Utente</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Status</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Endpoint</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Messaggio</th>
                <th className="px-2 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {errori.map(e => (
                <tr key={e.id} className="hover:bg-gray-50 transition-colors cursor-pointer"
                  onClick={() => setDettaglio(e)}>
                  <td className="px-4 py-2 text-xs text-gray-500 whitespace-nowrap">
                    {dayjs(e.creato_il).format('DD/MM/YY HH:mm')}
                  </td>
                  <td className="px-4 py-2">
                    <span className="font-medium text-gray-700">{e.nome} {e.cognome}</span>
                    <span className="ml-1.5 text-xs text-gray-400">{e.ruolo}</span>
                  </td>
                  <td className="px-4 py-2">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${COLORI_STATUS[e.status_code] || 'bg-gray-100 text-gray-600'}`}>
                      {e.status_code}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs font-mono text-gray-600 max-w-[180px] truncate">
                    <span className="text-gray-400 mr-1">{e.metodo}</span>{e.endpoint}
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-600 max-w-[200px] truncate">
                    {e.messaggio}
                  </td>
                  <td className="px-2 py-2" onClick={ev => ev.stopPropagation()}>
                    <button onClick={() => elimina.mutate(e.id)}
                      className="p-1 text-gray-300 hover:text-red-500 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modale dettaglio */}
      {dettaglio && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => setDettaglio(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-5 space-y-3"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-gray-800">Dettaglio errore #{dettaglio.id}</h2>
              <button onClick={() => setDettaglio(null)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-2 text-sm">
              <Row label="Data" val={dayjs(dettaglio.creato_il).format('DD/MM/YYYY HH:mm:ss')} />
              <Row label="Utente" val={`${dettaglio.nome || '?'} ${dettaglio.cognome || ''} (${dettaglio.ruolo})`} />
              <Row label="Pagina" val={dettaglio.url_pagina} />
              <Row label="Endpoint" val={`${dettaglio.metodo} ${dettaglio.endpoint}`} mono />
              <Row label="Status" val={dettaglio.status_code} />
              <Row label="Messaggio" val={dettaglio.messaggio} />
              {dettaglio.dettagli && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-1">Dettagli risposta</p>
                  <pre className="bg-gray-50 rounded-lg p-3 text-xs text-gray-700 overflow-x-auto whitespace-pre-wrap break-all">
                    {(() => { try { return JSON.stringify(JSON.parse(dettaglio.dettagli), null, 2) } catch { return dettaglio.dettagli } })()}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Row({ label, val, mono }) {
  if (!val) return null
  return (
    <div className="flex gap-2">
      <span className="text-xs font-semibold text-gray-500 w-20 flex-shrink-0 pt-0.5">{label}</span>
      <span className={`text-gray-700 ${mono ? 'font-mono text-xs' : ''}`}>{val}</span>
    </div>
  )
}
