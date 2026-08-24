import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { useNavigate } from 'react-router-dom'
import { Clock, Package, AlertTriangle, Euro, CheckCircle, XCircle, FileText, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, MapPin, Trash2, Pencil, X, Edit3, Save, GitBranch } from 'lucide-react'
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
// ── Galleria foto con visualizzatore a schermo intero ─────────────────────────
function FotoGalleria({ urls }) {
  const [idx, setIdx] = useState(null)
  if (!urls?.length) return null
  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        {urls.map((url, i) => (
          <img key={i} src={url} alt={`foto ${i + 1}`} onClick={() => setIdx(i)}
            className="w-20 h-20 object-cover rounded-lg border border-gray-200 cursor-pointer hover:opacity-80 transition-opacity" />
        ))}
      </div>
      {idx !== null && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4" onClick={() => setIdx(null)}>
          {urls.length > 1 && (
            <button onClick={e => { e.stopPropagation(); setIdx((idx - 1 + urls.length) % urls.length) }}
              className="absolute left-2 text-white/80 hover:text-white p-2 z-10"><ChevronLeft size={30} /></button>
          )}
          <img src={urls[idx]} alt="" className="max-h-full max-w-full rounded-lg object-contain" onClick={e => e.stopPropagation()} />
          {urls.length > 1 && (
            <button onClick={e => { e.stopPropagation(); setIdx((idx + 1) % urls.length) }}
              className="absolute right-2 text-white/80 hover:text-white p-2 z-10"><ChevronRight size={30} /></button>
          )}
          <button onClick={() => setIdx(null)} className="absolute top-3 right-3 text-white/80 hover:text-white p-2"><X size={24} /></button>
          <span className="absolute bottom-3 left-1/2 -translate-x-1/2 text-white/70 text-xs">{idx + 1} / {urls.length}</span>
        </div>
      )}
    </>
  )
}

function RapportinoCard({ r, isAdmin, onValida, onElimina, onAssegna, onModifica, onDividi, cantieri = [] }) {
  const [aperto, setAperto] = useState(false)
  const [noteAdmin, setNoteAdmin] = useState('')
  const [cantiereAssegnato, setCantiereAssegnato] = useState('')
  const [confermaElimina, setConfermaElimina] = useState(false)
  const [modificaCantiere, setModificaCantiere] = useState(false)
  const [nuovoCantiere, setNuovoCantiere] = useState('')
  const [modificaTesto, setModificaTesto] = useState(false)
  const [testoEdit, setTestoEdit] = useState(r.testo_italiano || '')
  const [oreEdit, setOreEdit] = useState(r.ore_lavorate ?? '')
  const [dividendo, setDividendo] = useState(false)
  const [segmenti, setSegmenti] = useState(() =>
    (r.segmenti_cantieri || []).map(s => ({ ...s, cantiere_id: s.cantiere_id ? String(s.cantiere_id) : '' }))
  )

  const suggerito = cantieri.find(c =>
    r.cantiere_rilevato && c.nome?.toLowerCase().includes(r.cantiere_rilevato.toLowerCase())
  )

  const salvaTesto = () => {
    onModifica(r.id, { testo_italiano: testoEdit, ore_lavorate: oreEdit === '' ? null : parseFloat(oreEdit) })
    setModificaTesto(false)
  }

  const aggiornaSegmento = (idx, campo, val) =>
    setSegmenti(s => s.map((seg, i) => i === idx ? { ...seg, [campo]: val } : seg))

  const aggiungiSegmento = () =>
    setSegmenti(s => [...s, { cantiere: '', cantiere_id: '', ore: '', lavorazioni: [], riassunto: '', testo: '' }])

  const rimuoviSegmento = (idx) =>
    setSegmenti(s => s.length > 1 ? s.filter((_, i) => i !== idx) : s)

  // Apre il pannello di divisione: se l'IA aveva già rilevato dei segmenti li riusa,
  // altrimenti parte da due righe (la prima col testo completo da tagliare/dividere a mano,
  // la seconda vuota) — così si può dividere manualmente anche se l'IA non l'ha segnalato
  // come multi-cantiere. Il testo NON va duplicato per intero su tutti i cantieri: va
  // spostato/riscritto tra le caselle in modo che ogni rapportino risultante racconti solo
  // la sua parte
  const apriDivisione = () => {
    if (segmenti.length < 2) {
      setSegmenti([
        { cantiere: r.cantiere_rilevato || '', cantiere_id: r.cantiere_id ? String(r.cantiere_id) : '', ore: r.ore_lavorate ?? '', lavorazioni: r.lavorazioni || [], riassunto: '', testo: r.testo_italiano || '' },
        { cantiere: '', cantiere_id: '', ore: '', lavorazioni: [], riassunto: '', testo: '' },
      ])
    }
    setDividendo(true)
  }

  const confermaDivisione = () => {
    if (segmenti.some(s => !s.cantiere_id)) return
    onDividi(r.id, segmenti.map(s => ({
      cantiere_id: parseInt(s.cantiere_id), ore: s.ore ? parseFloat(s.ore) : null,
      lavorazioni: s.lavorazioni || [], riassunto: s.riassunto || null, testo: s.testo || null,
    })))
    setDividendo(false)
  }

  const statoColor = {
    inviato: 'bg-yellow-100 text-yellow-700',
    validato: 'bg-green-100 text-green-700',
    rifiutato: 'bg-red-100 text-red-700',
    diviso: 'bg-purple-100 text-purple-700',
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
            {r.multi_cantiere && r.stato !== 'diviso' && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 flex items-center gap-1">
                <GitBranch size={10} /> multi-cantiere
              </span>
            )}
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statoColor}`}>
              {r.stato}
            </span>
            {isAdmin && r.stato !== 'inviato' && r.stato !== 'diviso' && (
              <button onClick={() => setModificaCantiere(v => !v)}
                className={`transition-colors ${modificaCantiere ? 'text-steelex-orange' : 'text-gray-300 hover:text-steelex-orange'}`}
                title="Assegna / cambia cantiere">
                <Pencil size={14} />
              </button>
            )}
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

        {/* Testo completo — sempre visibile in anteprima, non più nascosto in "dettagli" */}
        {r.testo_italiano && (
          <div className="mt-2.5">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold text-gray-500">Testo</p>
              {isAdmin && !modificaTesto && (
                <button onClick={() => { setTestoEdit(r.testo_italiano || ''); setOreEdit(r.ore_lavorate ?? ''); setModificaTesto(true) }}
                  className="text-gray-300 hover:text-steelex-orange transition-colors" title="Modifica testo">
                  <Edit3 size={13} />
                </button>
              )}
            </div>
            {modificaTesto ? (
              <div className="space-y-2">
                <textarea value={testoEdit} onChange={e => setTestoEdit(e.target.value)} rows={5}
                  className="w-full text-xs leading-relaxed border border-gray-200 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-steelex-orange" />
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-500 shrink-0">Ore lavorate</label>
                  <input type="number" step="0.5" min="0" max="24" value={oreEdit}
                    onChange={e => setOreEdit(e.target.value)}
                    className="w-20 border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-steelex-orange" />
                </div>
                <div className="flex gap-2">
                  <button onClick={salvaTesto}
                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-steelex-orange text-white rounded-lg text-xs font-semibold hover:opacity-90">
                    <Save size={13} /> Salva
                  </button>
                  <button onClick={() => setModificaTesto(false)}
                    className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700">Annulla</button>
                </div>
              </div>
            ) : (
              <p className="text-xs leading-relaxed bg-gray-50 p-2 rounded whitespace-pre-wrap text-gray-700">{r.testo_italiano}</p>
            )}
          </div>
        )}

        <div className="flex items-center justify-between mt-3">
          <span className="text-xs text-gray-400">
            {r.data_lavoro ? new Date(r.data_lavoro).toLocaleDateString('it-IT') : '—'}
            {r.lingua_originale && r.lingua_originale !== 'it' && (
              <span className="ml-2 text-gray-300">({r.lingua_originale.toUpperCase()})</span>
            )}
          </span>
          <button onClick={() => setAperto(v => !v)}
            className="text-xs text-gray-500 flex items-center gap-1 hover:text-gray-700">
            {aperto ? <><ChevronUp size={12} /> meno</> : <><ChevronDown size={12} /> altri dettagli</>}
          </button>
        </div>

        {aperto && (
          <div className="mt-3 pt-3 border-t border-gray-100 space-y-2 text-sm text-gray-700">
            {r.testo_originale && r.lingua_originale && r.lingua_originale !== 'it' && (
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-1">Testo originale ({r.lingua_originale.toUpperCase()})</p>
                <p className="text-xs leading-relaxed bg-gray-50 p-2 rounded whitespace-pre-wrap text-gray-500">{r.testo_originale}</p>
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
                <p className="text-xs font-semibold text-gray-500 mb-1">Foto allegate ({r.foto_urls.length})</p>
                <FotoGalleria urls={r.foto_urls} />
              </div>
            )}
            {r.note_admin && (
              <div className="bg-gray-50 p-2 rounded text-xs text-gray-600">
                <span className="font-semibold">Note admin: </span>{r.note_admin}
              </div>
            )}
          </div>
        )}

        {/* Modifica cantiere — per rapportini già validati/rifiutati */}
        {modificaCantiere && (
          <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
            <div className="flex items-center gap-1.5">
              <MapPin size={13} className="text-amber-600"/>
              <p className="text-xs font-semibold text-amber-800">
                {r.cantiere_nome ? <>Attualmente su: <strong>{r.cantiere_nome}</strong></> : 'Fuori cantiere — scegli dove imputarlo'}
              </p>
            </div>
            <select
              value={nuovoCantiere}
              onChange={e => setNuovoCantiere(e.target.value)}
              className="w-full border border-amber-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white">
              <option value="">— scegli cantiere —</option>
              {cantieri.map(c => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
            <div className="flex gap-2">
              <button
                disabled={!nuovoCantiere}
                onClick={() => { onAssegna(r.id, nuovoCantiere); setModificaCantiere(false); setNuovoCantiere('') }}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-steelex-orange text-white rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-40">
                <CheckCircle size={15} /> Assegna al cantiere
              </button>
              <button onClick={() => { setModificaCantiere(false); setNuovoCantiere('') }}
                className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700">
                Annulla
              </button>
            </div>
          </div>
        )}

        {/* Divide il rapportino tra più cantieri — sempre disponibile (non solo quando l'IA
            lo segnala in automatico). Disponibile anche dopo la validazione: in quel caso
            ripulisce prima diario e ore già registrate sul cantiere sbagliato */}
        {isAdmin && (r.stato === 'inviato' || r.stato === 'validato') && (
          <div className={`mt-3 rounded-xl p-3 space-y-2 ${dividendo || r.multi_cantiere ? 'bg-purple-50 border border-purple-200' : ''}`}>
            {r.multi_cantiere && (
              <div className="flex items-center gap-1.5">
                <GitBranch size={13} className="text-purple-600"/>
                <p className="text-xs font-semibold text-purple-800">
                  L'IA ha rilevato {segmenti.length || 2} cantieri diversi in questo rapportino
                </p>
              </div>
            )}
            {r.stato === 'validato' && dividendo && (
              <p className="text-xs text-purple-700">
                ⚠️ Già validato su <strong>{r.cantiere_nome}</strong> — dividendo verranno cancellate la nota diario
                e le ore già registrate lì, e ricreate correttamente sui cantieri scelti sotto.
              </p>
            )}
            {!dividendo ? (
              <button onClick={apriDivisione}
                className="text-xs text-purple-700 underline flex items-center gap-1">
                <GitBranch size={12} /> Dividi per cantiere
              </button>
            ) : (
              <div className="space-y-2">
                {segmenti.map((s, i) => (
                  <div key={i} className="bg-white border border-purple-100 rounded-lg p-2 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-gray-600">
                        {s.cantiere
                          ? <>Citato: <strong>"{s.cantiere}"</strong></>
                          : <span className="text-gray-400">Segmento {i + 1}</span>}
                      </p>
                      {segmenti.length > 2 && (
                        <button onClick={() => rimuoviSegmento(i)} className="text-gray-300 hover:text-red-500">
                          <X size={13} />
                        </button>
                      )}
                    </div>
                    {!s.cantiere_id && s.cantiere && (
                      <p className="text-xs text-red-500">⚠️ nome non riconosciuto tra i cantieri attivi — seleziona a mano</p>
                    )}
                    <select
                      value={s.cantiere_id}
                      onChange={e => aggiornaSegmento(i, 'cantiere_id', e.target.value)}
                      className="w-full border border-purple-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white">
                      <option value="">— scegli cantiere —</option>
                      {cantieri.map(c => (
                        <option key={c.id} value={c.id}>{c.nome}</option>
                      ))}
                    </select>
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">Testo per questo cantiere</label>
                      <textarea value={s.testo ?? ''} rows={4}
                        placeholder="Sposta/riscrivi qui solo la parte di racconto relativa a questo cantiere..."
                        onChange={e => aggiornaSegmento(i, 'testo', e.target.value)}
                        className="w-full text-xs leading-relaxed border border-purple-200 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-purple-400" />
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-500 shrink-0">Ore</label>
                      <input type="number" step="0.5" min="0" max="24" value={s.ore ?? ''}
                        onChange={e => aggiornaSegmento(i, 'ore', e.target.value)}
                        className="w-20 border border-purple-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-purple-400" />
                    </div>
                  </div>
                ))}
                <button onClick={aggiungiSegmento}
                  className="text-xs text-purple-700 underline">+ Aggiungi cantiere</button>
                <div className="flex gap-2">
                  <button
                    disabled={segmenti.some(s => !s.cantiere_id)}
                    onClick={confermaDivisione}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-purple-600 text-white rounded-lg text-sm font-semibold hover:bg-purple-700 transition-colors disabled:opacity-40">
                    <GitBranch size={15} /> Conferma divisione
                  </button>
                  <button onClick={() => setDividendo(false)}
                    className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700">Annulla</button>
                </div>
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

  const assegnaMutation = useMutation(
    ({ id, cantiere_id }) =>
      api.put(`/rapportini/${id}/assegna-cantiere`, { cantiere_id: parseInt(cantiere_id) }),
    {
      onSuccess: () => {
        qc.invalidateQueries('rapp-da-validare')
        qc.invalidateQueries('rapp-tutti')
        qc.invalidateQueries('rapp-fuori')
      }
    }
  )

  const modificaMutation = useMutation(
    ({ id, ...dati }) => api.put(`/rapportini/${id}`, dati),
    {
      onSuccess: () => {
        qc.invalidateQueries('rapp-da-validare')
        qc.invalidateQueries('rapp-tutti')
        qc.invalidateQueries('rapp-fuori')
      }
    }
  )

  const dividiMutation = useMutation(
    ({ id, segmenti }) => api.put(`/rapportini/${id}/dividi`, segmenti),
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
              onElimina={(id) => eliminaMutation.mutate(id)}
              onAssegna={(id, cantiere_id) => assegnaMutation.mutate({ id, cantiere_id })}
              onModifica={(id, dati) => modificaMutation.mutate({ id, ...dati })}
              onDividi={(id, segmenti) => dividiMutation.mutate({ id, segmenti })} />
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
