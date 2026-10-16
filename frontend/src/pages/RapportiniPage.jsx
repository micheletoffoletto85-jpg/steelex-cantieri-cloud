import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { useNavigate } from 'react-router-dom'
import {
  Mic, MicOff, Send, Clock, Package, AlertTriangle, CheckCircle, XCircle,
  FileText, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Camera, Plus, X, Info, Image, MapPin, Euro, Trash2, Pencil,
  Edit3, Save, GitBranch, Sparkles
} from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../lib/api'
import { useAuth } from '../lib/auth'
import MaterialiUsati from '../components/MaterialiUsati'

const RUOLI_ADMIN = ['admin', 'capo_cantiere', 'capo_cantiere_sub', 'direzione_lavori', 'amministrazione']

// ── Chip colorati ─────────────────────────────────────────────────────────────
function Chips({ r }) {
  const chips = []
  if (r.ore_lavorate) chips.push({ label: `${r.ore_lavorate}h`, color: 'bg-blue-100 text-blue-700' })
  if (r.ore_extra)    chips.push({ label: `+${r.ore_extra}h extra`, color: 'bg-orange-100 text-orange-700' })
  if (r.materiali?.length) chips.push({ label: `${r.materiali.length} mat.`, color: 'bg-green-100 text-green-700' })
  if (r.materiale_extra) chips.push({ label: 'Mat. extra', color: 'bg-teal-100 text-teal-700' })
  if (r.colleghi_ore?.length) chips.push({ label: `+${r.colleghi_ore.length} collega${r.colleghi_ore.length > 1 ? 'i' : ''}`, color: 'bg-purple-100 text-purple-700' })
  if (r.extra_preventivo) chips.push({ icon: AlertTriangle, label: 'Extra preventivo', color: 'bg-orange-100 text-orange-700' })
  if (r.criticita)    chips.push({ icon: AlertTriangle, label: 'Criticità/NC', color: 'bg-red-100 text-red-700' })
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {chips.map(({ icon: Icon, label, color }, i) => (
        <span key={i} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${color}`}>
          {Icon && <Icon size={10} />}{label}
        </span>
      ))}
    </div>
  )
}

// ── Foto preview con visualizzatore a schermo intero ──────────────────────────
function FotoPreview({ urls }) {
  const [idx, setIdx] = useState(null)
  if (!urls?.length) return null
  return (
    <>
      <div className="flex flex-wrap gap-1.5 mt-2">
        {urls.map((url, i) => (
          <img key={i} src={url} alt={`foto ${i+1}`} onClick={() => setIdx(i)}
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

// ── Editor di una lista di stringhe (lavorazioni, materiali) ──────────────────
function ListaEditor({ label, items, onChange, placeholder }) {
  const aggiorna = (idx, val) => onChange(items.map((x, i) => i === idx ? val : x))
  const aggiungi = () => onChange([...items, ''])
  const rimuovi = (idx) => onChange(items.length > 1 ? items.filter((_, i) => i !== idx) : [''])
  return (
    <div className="space-y-1.5">
      <label className="text-xs text-gray-500">{label}</label>
      {items.map((v, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <input value={v} onChange={e => aggiorna(i, e.target.value)} placeholder={placeholder}
            className="flex-1 border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-steelex-orange" />
          <button onClick={() => rimuovi(i)} className="text-gray-400 hover:text-red-500 p-1"><X size={13} /></button>
        </div>
      ))}
      <button onClick={aggiungi} className="text-xs text-steelex-orange hover:underline flex items-center gap-1">
        <Plus size={12} /> Aggiungi
      </button>
    </div>
  )
}

// ── Card rapportino ───────────────────────────────────────────────────────────
function RapportinoCard({ r, isAdmin, onValida, onElimina, onAssegna, onModifica, onDividi, onRianalizza, onMaterialeSpesa, cantieri = [] }) {
  const [aperto, setAperto] = useState(false)
  const [noteAdmin, setNoteAdmin] = useState('')
  const [cantiereAssegnato, setCantiereAssegnato] = useState('')
  const [confermaElimina, setConfermaElimina] = useState(false)
  const [modificaCantiere, setModificaCantiere] = useState(false)
  const [nuovoCantiere, setNuovoCantiere] = useState('')
  const [modificaTesto, setModificaTesto] = useState(false)
  const [testoEdit, setTestoEdit] = useState(r.descrizione_lavori || r.testo_italiano || '')
  const [oreEdit, setOreEdit] = useState(r.ore_lavorate ?? '')
  const [colleghiEdit, setColleghiEdit] = useState(() => (r.colleghi_ore || []).map(c => ({ nome: c.nome || '', ore: c.ore ?? '', utente_id: c.utente_id ?? '' })))
  const { data: operatori = [] } = useQuery('operatori', () => api.get('/rapportini/operatori').then(r => r.data), { enabled: isAdmin, staleTime: 5 * 60 * 1000 })
  const [lavorazioniEdit, setLavorazioniEdit] = useState(() => r.lavorazioni?.length ? r.lavorazioni : [''])
  const [materialiEdit, setMaterialiEdit] = useState(() => r.materiali?.length ? r.materiali : [''])
  const [criticitaEdit, setCriticitaEdit] = useState(r.criticita || '')
  const [descrizioneExtraEdit, setDescrizioneExtraEdit] = useState(r.descrizione_extra || '')
  const [materialeExtraEdit, setMaterialeExtraEdit] = useState(r.materiale_extra || '')
  const [extraPreventivoEdit, setExtraPreventivoEdit] = useState(!!r.extra_preventivo)
  const [extraPreventivoNotaEdit, setExtraPreventivoNotaEdit] = useState(r.extra_preventivo_nota || '')
  const [dividendo, setDividendo] = useState(false)
  const [segmenti, setSegmenti] = useState(() =>
    (r.segmenti_cantieri || []).map(s => ({ ...s, cantiere_id: s.cantiere_id ? String(s.cantiere_id) : '' }))
  )
  const [rianalizzando, setRianalizzando] = useState(false)

  const rianalizza = async () => {
    setRianalizzando(true)
    try { await onRianalizza(r.id) } finally { setRianalizzando(false) }
  }

  // Pre-seleziona il cantiere rilevato dall'AI se esiste nel DB
  const suggerito = cantieri.find(c =>
    r.cantiere_rilevato && c.nome?.toLowerCase().includes(r.cantiere_rilevato.toLowerCase())
  )

  const statoPill = {
    inviato:  'pill-warn',
    validato: 'pill-ok',
    rifiutato:'pill-late',
    diviso:   'pill-info',
  }[r.stato] || 'pill-neutral'
  const statoLabel = {
    inviato: 'Da validare', validato: 'Validato', rifiutato: 'Rifiutato', diviso: 'Diviso',
  }[r.stato] || r.stato

  const salvaTesto = () => {
    onModifica(r.id, {
      descrizione_lavori: testoEdit,
      ore_lavorate: oreEdit === '' ? null : parseFloat(oreEdit),
      colleghi_ore: colleghiEdit
        .filter(c => c.nome.trim())
        .map(c => ({ nome: c.nome.trim(), ore: c.ore === '' ? null : parseFloat(c.ore), utente_id: c.utente_id === '' || c.utente_id == null ? null : parseInt(c.utente_id) })),
      lavorazioni: lavorazioniEdit.map(l => l.trim()).filter(Boolean),
      materiali: materialiEdit.map(m => m.trim()).filter(Boolean),
      criticita: criticitaEdit.trim() || null,
      descrizione_extra: descrizioneExtraEdit.trim() || null,
      materiale_extra: materialeExtraEdit.trim() || null,
      extra_preventivo: extraPreventivoEdit,
      extra_preventivo_nota: extraPreventivoEdit ? (extraPreventivoNotaEdit.trim() || null) : null,
    })
    setModificaTesto(false)
  }

  const aggiungiCollega = () => setColleghiEdit(c => [...c, { nome: '', ore: '', utente_id: '' }])
  const aggiornaCollega = (idx, campo, val) => setColleghiEdit(c => c.map((x, i) => i === idx ? { ...x, [campo]: val } : x))
  const rimuoviCollega = (idx) => setColleghiEdit(c => c.filter((_, i) => i !== idx))

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
        { cantiere: r.cantiere_rilevato || '', cantiere_id: r.cantiere_id ? String(r.cantiere_id) : '', ore: r.ore_lavorate ?? '', lavorazioni: r.lavorazioni || [], riassunto: '', testo: r.descrizione_lavori || r.testo_italiano || '' },
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

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            {isAdmin && <p className="text-xs text-gray-500 mb-0.5">{r.operativo_nome}</p>}
            <p className="font-semibold text-gray-900 text-sm leading-snug">
              {r.riassunto || r.descrizione_lavori?.slice(0, 100) || '—'}
            </p>
            {r.cantiere_nome
              ? <p className="text-xs text-steelex-orange font-medium mt-0.5">{r.cantiere_nome}</p>
              : r.cantiere_rilevato
              ? <p className="text-xs text-gray-400 mt-0.5">"{r.cantiere_rilevato}" — non abbinato</p>
              : null}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {r.multi_cantiere && r.stato !== 'diviso' && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 flex items-center gap-1">
                <GitBranch size={10} /> multi-cantiere
              </span>
            )}
            <span className={`pill ${statoPill}`}>{statoLabel}</span>
            {isAdmin && r.stato !== 'inviato' && r.stato !== 'diviso' && (
              <button onClick={() => setModificaCantiere(v => !v)}
                className={`transition-colors ${modificaCantiere ? 'text-steelex-orange' : 'text-gray-400 hover:text-steelex-orange'}`}
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
                  className="text-gray-400 hover:text-red-500 transition-colors"
                  title="Elimina rapportino">
                  <Trash2 size={14} />
                </button>
              )
            )}
          </div>
        </div>

        <Chips r={r} />
        <FotoPreview urls={r.foto_avanzamento_urls} />

        {/* Testo completo — sempre visibile in anteprima, non più nascosto in "dettagli" */}
        {(r.descrizione_lavori || r.testo_italiano) && (
          <div className="mt-2.5">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold text-gray-500">Lavori svolti</p>
              {isAdmin && !modificaTesto && r.stato !== 'diviso' && (
                <div className="flex items-center gap-2">
                  <button onClick={rianalizza} disabled={rianalizzando}
                    className="text-gray-400 hover:text-purple-600 transition-colors disabled:opacity-40"
                    title="Ri-analizza con IA (matching cantiere e rilevamento multi-cantiere aggiornati)">
                    <Sparkles size={13} className={rianalizzando ? 'animate-pulse' : ''} />
                  </button>
                  <button onClick={() => {
                    setTestoEdit(r.descrizione_lavori || r.testo_italiano || ''); setOreEdit(r.ore_lavorate ?? '')
                    setColleghiEdit((r.colleghi_ore || []).map(c => ({ nome: c.nome || '', ore: c.ore ?? '' })))
                    setLavorazioniEdit(r.lavorazioni?.length ? r.lavorazioni : [''])
                    setMaterialiEdit(r.materiali?.length ? r.materiali : [''])
                    setCriticitaEdit(r.criticita || '')
                    setDescrizioneExtraEdit(r.descrizione_extra || '')
                    setMaterialeExtraEdit(r.materiale_extra || '')
                    setExtraPreventivoEdit(!!r.extra_preventivo)
                    setExtraPreventivoNotaEdit(r.extra_preventivo_nota || '')
                    setModificaTesto(true)
                  }}
                    className="text-gray-400 hover:text-steelex-orange transition-colors" title="Modifica testo">
                    <Edit3 size={13} />
                  </button>
                </div>
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
                <div className="space-y-2">
                  <label className="text-xs text-gray-500">Colleghi presenti (senza un proprio rapportino) — collegali a un operatore per aggiornare le sue ore</label>
                  {colleghiEdit.map((c, i) => (
                    <div key={i} className="space-y-1 border border-gray-100 rounded-lg p-1.5">
                      <div className="flex items-center gap-1.5">
                        <input value={c.nome} onChange={e => aggiornaCollega(i, 'nome', e.target.value)}
                          placeholder="Nome citato"
                          className="flex-1 border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-steelex-orange" />
                        <input type="number" step="0.5" min="0" max="24" value={c.ore}
                          onChange={e => aggiornaCollega(i, 'ore', e.target.value)}
                          placeholder={oreEdit || '—'}
                          className="w-16 border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-steelex-orange" />
                        <button onClick={() => rimuoviCollega(i)} className="text-gray-400 hover:text-red-500 p-1"><X size={13} /></button>
                      </div>
                      <select value={c.utente_id ?? ''} onChange={e => aggiornaCollega(i, 'utente_id', e.target.value)}
                        className={`w-full border rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-steelex-orange ${c.utente_id ? 'border-green-300 bg-green-50 text-green-800' : 'border-amber-300 bg-amber-50 text-amber-700'}`}>
                        <option value="">⚠ Nessun operatore collegato</option>
                        {operatori.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
                      </select>
                    </div>
                  ))}
                  <button onClick={aggiungiCollega} className="text-xs text-steelex-orange hover:underline flex items-center gap-1">
                    <Plus size={12} /> Aggiungi collega
                  </button>
                </div>

                <ListaEditor label="Lavorazioni svolte" items={lavorazioniEdit} onChange={setLavorazioniEdit} placeholder="es. posa cartongesso" />
                <ListaEditor label="Materiali usati" items={materialiEdit} onChange={setMaterialiEdit} placeholder="es. cartongesso 12.5mm" />

                <div>
                  <label className="text-xs text-gray-500">Criticità / non conformità</label>
                  <textarea value={criticitaEdit} onChange={e => setCriticitaEdit(e.target.value)} rows={2}
                    className="w-full text-xs border border-gray-200 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-steelex-orange" />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Lavori extra / situazioni particolari</label>
                  <textarea value={descrizioneExtraEdit} onChange={e => setDescrizioneExtraEdit(e.target.value)} rows={2}
                    className="w-full text-xs border border-gray-200 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-steelex-orange" />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Materiale extra usato</label>
                  <input value={materialeExtraEdit} onChange={e => setMaterialeExtraEdit(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-steelex-orange" />
                </div>

                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={extraPreventivoEdit} onChange={e => setExtraPreventivoEdit(e.target.checked)}
                    className="w-3.5 h-3.5 accent-steelex-orange" />
                  <span className="text-xs text-gray-600">⚠ Lavorazione extra preventivo (da fatturare a parte)</span>
                </label>
                {extraPreventivoEdit && (
                  <input value={extraPreventivoNotaEdit} onChange={e => setExtraPreventivoNotaEdit(e.target.value)}
                    placeholder="Nota (opzionale): cosa è extra rispetto al preventivo"
                    className="w-full text-xs border border-orange-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-steelex-orange" />
                )}

                <div className="flex gap-2">
                  <button onClick={salvaTesto}
                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-steelex-orange text-white rounded-lg text-xs font-semibold hover:bg-gray-800">
                    <Save size={13} /> Salva
                  </button>
                  <button onClick={() => setModificaTesto(false)}
                    className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700">Annulla</button>
                </div>
              </div>
            ) : (
              <>
                {r.extra_preventivo && (
                  <div className="mb-1.5 bg-orange-50 border border-orange-200 rounded-lg px-2 py-1.5 text-xs text-orange-700">
                    <span className="font-semibold">⚠ Extra preventivo</span>
                    {r.extra_preventivo_nota && <> — {r.extra_preventivo_nota}</>}
                  </div>
                )}
                <p className="text-xs leading-relaxed bg-gray-50 p-2 rounded whitespace-pre-wrap text-gray-700">
                  {r.descrizione_lavori || r.testo_italiano}
                </p>
                {r.colleghi_ore?.length > 0 && (
                  <div className="text-xs mt-1 space-y-0.5">
                    {r.colleghi_ore.map((c, i) => (
                      <p key={i} className="text-purple-700">
                        + {c.nome} ({c.ore ?? r.ore_lavorate ?? '—'}h){' '}
                        {c.utente_nome
                          ? <span className="text-green-700">→ {c.utente_nome}</span>
                          : <span className="text-amber-600">→ operatore non collegato</span>}
                      </p>
                    ))}
                  </div>
                )}
              </>
            )}
            {r.testo_italiano && r.descrizione_lavori && r.testo_italiano !== r.descrizione_lavori && (
              <div className="mt-2">
                <p className="text-xs font-semibold text-gray-500 mb-1">Racconto completo (voce)</p>
                <p className="text-xs leading-relaxed bg-gray-50 p-2 rounded whitespace-pre-wrap text-gray-600">{r.testo_italiano}</p>
              </div>
            )}
          </div>
        )}

        <MaterialiUsati source={r} isAdmin={isAdmin} onMaterialeSpesa={onMaterialeSpesa} />

        <div className="flex items-center justify-between mt-3">
          <span className="text-xs text-gray-400">
            {r.data_lavoro ? new Date(r.data_lavoro).toLocaleDateString('it-IT') : '—'}
            {r.lingua_originale && r.lingua_originale !== 'it' && (
              <span className="ml-2 text-gray-300">({r.lingua_originale.toUpperCase()})</span>
            )}
          </span>
          <button onClick={() => setAperto(v => !v)}
            className="text-xs text-gray-500 flex items-center gap-1 hover:text-gray-700">
            {aperto ? <><ChevronUp size={12}/> meno</> : <><ChevronDown size={12}/> altri dettagli</>}
          </button>
        </div>

        {aperto && (
          <div className="mt-3 pt-3 border-t border-gray-100 space-y-3 text-sm text-gray-700">
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
            {r.ore_lavorate != null && (
              <p className="text-xs text-gray-600">Ore lavorate: <strong>{r.ore_lavorate}h</strong></p>
            )}
            {r.foto_extra_urls?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-1">Foto extra</p>
                <FotoPreview urls={r.foto_extra_urls} />
              </div>
            )}
            {r.descrizione_extra && (
              <div className="bg-orange-50 text-orange-800 p-2 rounded text-xs">
                <span className="font-semibold">Extra: </span>{r.descrizione_extra}
              </div>
            )}
            {r.ore_extra != null && (
              <p className="text-xs text-gray-600">Ore extra: <strong>{r.ore_extra}h</strong></p>
            )}
            {r.criticita && (
              <div className="bg-red-50 text-red-700 p-2 rounded text-xs">
                <span className="font-semibold">⚠️ Criticità/NC: </span>{r.criticita}
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
                className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-steelex-orange text-white rounded-lg text-sm font-semibold hover:bg-gray-800 transition-colors disabled:opacity-40">
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
                        <button onClick={() => rimuoviSegmento(i)} className="text-gray-400 hover:text-red-500">
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
              <CheckCircle size={15}/> {cantiereAssegnato ? 'Assegna e valida' : 'Valida'}
            </button>
            <button onClick={() => onValida(r.id, true, noteAdmin, null)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-red-500 text-white rounded-lg text-sm font-semibold hover:bg-red-600 transition-colors">
              <XCircle size={15}/> Rifiuta
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Registrazione rapportino da parte di un admin ────────────────────────────
// Stesso flusso degli operatori (voce/testo → IA → diario + ore + spese), ma l'admin
// può registrarlo PER CONTO di un operatore o di un esterno senza account, e con
// "valida subito" farlo diventare operativo all'istante.
function RegistraRapportinoAdmin({ cantieri = [], onChiudi }) {
  const qc = useQueryClient()
  const { utente } = useAuth()
  const oggiStr = new Date().toISOString().slice(0, 10)

  const [perConto, setPerConto] = useState('io')     // 'io' | '<id>' | 'esterno'
  const [nomeEsterno, setNomeEsterno] = useState('')
  const [dataRif, setDataRif] = useState(oggiStr)
  const [cantiereId, setCantiereId] = useState('')
  const [validaSubito, setValidaSubito] = useState(true)
  const [testo, setTesto] = useState('')
  const [foto, setFoto] = useState([])
  const [fase, setFase] = useState('idle')  // idle | recording | transcribing | inviando
  const [errore, setErrore] = useState(null)

  const mediaRef = useRef(null)
  const chunksRef = useRef([])
  const fotoInputRef = useRef(null)

  const { data: operatori = [] } = useQuery('operatori',
    () => api.get('/rapportini/operatori').then(r => r.data), { staleTime: 5 * 60 * 1000 })

  const startRec = async () => {
    setErrore(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = ['audio/webm', 'audio/mp4', 'audio/ogg', ''].find(
        m => m === '' || MediaRecorder.isTypeSupported(m))
      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : {})
      chunksRef.current = []
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        const tipoReale = mr.mimeType || mimeType || 'audio/webm'
        // Estensione dal sottotipo MIME reale (non da un elenco fisso): se il browser
        // registra in un formato diverso da webm/mp4/ogg (es. aac, 3gpp su alcuni Android),
        // taggarlo comunque come .m4a mandava in errore Whisper con "formato non supportato"
        const ext = (tipoReale.split(';')[0].split('/')[1] || 'webm').replace('x-', '')
        const blob = new Blob(chunksRef.current, { type: tipoReale })
        if (blob.size < 2048) { setErrore('Registrazione troppo breve — riprova'); setFase('idle'); return }
        setFase('transcribing')
        try {
          const fd = new FormData()
          fd.append('audio', blob, `rapportino.${ext}`)
          const res = await api.post('/rapportini/trascrivi', fd, { timeout: 180000 })
          setTesto(t => (t ? t + '\n' : '') + (res.data.testo || ''))
          setFase('idle')
        } catch (err) {
          setErrore(err?.response?.data?.detail || 'Errore trascrizione')
          setFase('idle')
        }
      }
      mr.start(1000)
      mediaRef.current = mr
      setFase('recording')
    } catch {
      setErrore('Microfono non disponibile — controlla i permessi')
    }
  }

  const stopRec = () => {
    if (mediaRef.current?.state === 'recording') mediaRef.current.stop()
  }

  const inviaMutation = useMutation(
    async () => {
      const fd = new FormData()
      fd.append('testo', testo.trim())
      if (dataRif) fd.append('data_riferimento', dataRif)
      if (cantiereId) fd.append('cantiere_id', cantiereId)
      if (perConto === 'esterno') fd.append('operatore_nome', nomeEsterno.trim())
      else if (perConto !== 'io') fd.append('per_conto_id', perConto)
      fd.append('valida_subito', validaSubito ? 'true' : 'false')
      foto.forEach(f => fd.append('foto_avanzamento', f))
      const res = await api.post('/rapportini/invia', fd, {
        headers: { 'Content-Type': 'multipart/form-data' }, timeout: 180000,
      })
      return res.data
    },
    {
      onSuccess: (data) => {
        qc.invalidateQueries('rapp-da-validare')
        qc.invalidateQueries('rapp-tutti')
        qc.invalidateQueries('rapp-fuori')
        toast.success(data.stato === 'validato'
          ? 'Rapportino registrato e validato' : 'Rapportino in coda da validare')
        onChiudi()
      },
      onError: (err) => {
        setErrore(err?.response?.data?.detail || 'Errore invio')
        setFase('idle')
      },
    }
  )

  const puoInviare = testo.trim().length > 3
    && (perConto !== 'esterno' || nomeEsterno.trim().length > 1)
    && fase === 'idle'

  const invia = () => { setErrore(null); setFase('inviando'); inviaMutation.mutate() }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 px-4 pb-4 sm:pb-0 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-4 my-6">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-gray-900 text-lg">Registra rapportino</h2>
          <button onClick={onChiudi} className="text-gray-400 hover:text-gray-600 p-1"><X size={18} /></button>
        </div>

        {/* Per conto di */}
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Per conto di</label>
          <select value={perConto} onChange={e => setPerConto(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-steelex-orange">
            <option value="io">Io stesso ({utente?.nome} {utente?.cognome})</option>
            {operatori.map(o => <option key={o.id} value={String(o.id)}>{o.nome}</option>)}
            <option value="esterno">Altro operatore esterno (senza account)…</option>
          </select>
          {perConto === 'esterno' && (
            <input value={nomeEsterno} onChange={e => setNomeEsterno(e.target.value)}
              placeholder="Nome e cognome dell'operatore esterno"
              className="mt-2 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-steelex-orange" />
          )}
        </div>

        {/* Data + cantiere */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Giorno</label>
            <input type="date" value={dataRif} max={oggiStr} onChange={e => setDataRif(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-steelex-orange" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Cantiere</label>
            <select value={cantiereId} onChange={e => setCantiereId(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-steelex-orange">
              <option value="">Rileva da testo</option>
              {cantieri.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
        </div>

        {/* Registrazione voce / testo */}
        <div className="flex items-center gap-3">
          {fase === 'recording' ? (
            <button onClick={stopRec}
              className="w-12 h-12 rounded-full bg-red-600 text-white flex items-center justify-center shadow-lg animate-pulse shrink-0">
              <MicOff size={20} />
            </button>
          ) : (
            <button onClick={startRec} disabled={fase !== 'idle'}
              className="w-12 h-12 rounded-full bg-steelex-orange text-white flex items-center justify-center shadow-lg disabled:opacity-40 shrink-0">
              <Mic size={20} />
            </button>
          )}
          <p className="text-xs text-gray-500 flex-1">
            {fase === 'recording' && '🔴 Registrazione — tocca per fermare'}
            {fase === 'transcribing' && 'Trascrizione in corso…'}
            {fase === 'idle' && 'Detta il rapportino o scrivilo qui sotto'}
            {fase === 'inviando' && 'Invio in corso…'}
          </p>
        </div>

        <textarea value={testo} onChange={e => setTesto(e.target.value)} rows={5}
          placeholder="Cantiere, ore lavorate, attività svolte, materiali, eventuali problemi…"
          className="w-full border border-gray-200 rounded-xl p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-steelex-orange" />

        {/* Foto */}
        <div>
          <input ref={fotoInputRef} type="file" accept="image/*" multiple className="hidden"
            onChange={e => setFoto(prev => [...prev, ...Array.from(e.target.files).filter(f => f.type.startsWith('image/'))].slice(0, 5))} />
          <div className="flex gap-2 flex-wrap">
            {foto.map((f, i) => (
              <div key={i} className="relative">
                <img src={URL.createObjectURL(f)} alt="" className="w-14 h-14 object-cover rounded-lg border border-gray-200" />
                <button onClick={() => setFoto(prev => prev.filter((_, j) => j !== i))}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center"><X size={10} /></button>
              </div>
            ))}
            {foto.length < 5 && (
              <button onClick={() => fotoInputRef.current?.click()}
                className="w-14 h-14 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center text-gray-400 hover:border-steelex-orange hover:text-steelex-orange transition-colors">
                <Camera size={18} />
              </button>
            )}
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input type="checkbox" checked={validaSubito} onChange={e => setValidaSubito(e.target.checked)}
            className="w-4 h-4 accent-steelex-orange" />
          Valida subito (crea diario, ore e spese)
        </label>

        {errore && <div className="bg-red-50 text-red-700 p-3 rounded-xl text-sm">{errore}</div>}

        <div className="flex gap-3">
          <button onClick={onChiudi}
            className="flex-1 py-3 border-2 border-gray-200 text-gray-600 rounded-xl font-semibold text-sm hover:bg-gray-50 transition-colors">
            Annulla
          </button>
          <button onClick={invia} disabled={!puoInviare || fase === 'inviando'}
            className="flex-1 py-3 bg-steelex-orange text-white rounded-xl font-bold text-sm hover:bg-orange-600 disabled:opacity-40 flex items-center justify-center gap-2 transition-all">
            <Send size={15} /> {validaSubito ? 'Registra e valida' : 'Registra'}
          </button>
        </div>
      </div>
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
  const [registrando, setRegistrando] = useState(false)

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
      ['attivo','in_corso','preventivo'].includes(c.stato)
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

  const rianalizzaMutation = useMutation(
    (id) => api.put(`/rapportini/${id}/rianalizza`),
    {
      onSuccess: () => {
        qc.invalidateQueries('rapp-da-validare')
        qc.invalidateQueries('rapp-tutti')
        qc.invalidateQueries('rapp-fuori')
      },
      onError: (err) => toast.error(err.response?.data?.detail || 'Errore ri-analisi')
    }
  )

  const materialeSpesaMutation = useMutation(
    ({ id, ...body }) => api.post(`/rapportini/${id}/materiale-spesa`, body),
    {
      onSuccess: () => {
        qc.invalidateQueries('rapp-da-validare')
        qc.invalidateQueries('rapp-tutti')
        qc.invalidateQueries('rapp-fuori')
      }
    }
  )

  const [batchProgress, setBatchProgress] = useState(null)

  const rianalizzaTutti = async () => {
    const eleggibili = tutti.filter(r => r.stato !== 'diviso' && (r.descrizione_lavori || r.testo_italiano))
    if (!eleggibili.length) return
    setBatchProgress({ fatti: 0, totale: eleggibili.length, errori: 0 })
    let errori = 0
    for (let i = 0; i < eleggibili.length; i++) {
      try {
        await api.put(`/rapportini/${eleggibili[i].id}/rianalizza`, null, { timeout: 30000 })
      } catch {
        errori++
      }
      setBatchProgress({ fatti: i + 1, totale: eleggibili.length, errori })
    }
    qc.invalidateQueries('rapp-da-validare')
    qc.invalidateQueries('rapp-tutti')
    qc.invalidateQueries('rapp-fuori')
    toast.success(`Ri-analizzati ${eleggibili.length - errori}/${eleggibili.length} rapportini`
      + (errori ? ` (${errori} errori)` : ''))
    setBatchProgress(null)
  }

  const lista = tab === 'da-validare' ? daValidare : tab === 'fuori' ? fuoriCantiere : tutti
  const fuoriCount = fuoriCantiere.filter(r => r.stato === 'inviato').length

  return (
    <div className="space-y-5">
      {registrando && (
        <RegistraRapportinoAdmin cantieri={cantieri} onChiudi={() => setRegistrando(false)} />
      )}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Rapportini operativi</h1>
        <div className="flex items-center gap-2">
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
          <button onClick={() => setRegistrando(true)}
            className="flex items-center gap-1.5 bg-steelex-orange text-white text-sm font-semibold px-3 py-1.5 rounded-lg hover:bg-orange-600 transition-colors">
            <Plus size={15} /> Registra rapportino
          </button>
        </div>
      </div>

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

      {tab === 'tutti' && tutti.length > 0 && (
        batchProgress ? (
          <div className="bg-purple-50 border border-purple-200 rounded-xl px-3 py-2 flex items-center gap-2 text-xs text-purple-700">
            <Sparkles size={13} className="animate-pulse shrink-0" />
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <span>Ri-analisi in corso… {batchProgress.fatti}/{batchProgress.totale}</span>
                {batchProgress.errori > 0 && <span className="text-red-500">{batchProgress.errori} errori</span>}
              </div>
              <div className="h-1.5 bg-purple-100 rounded-full overflow-hidden">
                <div className="h-full bg-purple-500 transition-all"
                  style={{ width: `${(batchProgress.fatti / batchProgress.totale) * 100}%` }} />
              </div>
            </div>
          </div>
        ) : (
          <button onClick={rianalizzaTutti}
            className="text-xs text-purple-700 underline flex items-center gap-1">
            <Sparkles size={12} /> Ri-analizza tutti con IA (pregresso)
          </button>
        )
      )}

      {lista.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <FileText size={40} className="mx-auto mb-3 opacity-30"/>
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
              onDividi={(id, segmenti) => dividiMutation.mutate({ id, segmenti })}
              onRianalizza={(id) => rianalizzaMutation.mutateAsync(id)}
              onMaterialeSpesa={(id, body) => materialeSpesaMutation.mutateAsync({ id, ...body })} />
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

  if (!isAdmin) {
    navigate('/', { replace: true })
    return null
  }

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <VistaAdmin/>
    </div>
  )
}
