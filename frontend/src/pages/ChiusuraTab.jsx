/**
 * Tab "Chiusura cantiere" — verbale di fine lavori (documento relazionale, NON contabile):
 * dati di consegna, relazione dei lavori (con bozza AI), selezione foto, verbale PDF.
 */
import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { Flag, Sparkles, Loader2, FileText, Check, Star, ImageOff, CircleCheck } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../lib/api'
import dayjs from 'dayjs'

const RUOLI_CHIUSURA = ['admin', 'capo_cantiere', 'amministrazione']
const fmtD = d => (d ? dayjs(d).format('DD/MM/YYYY') : '—')

export default function ChiusuraTab({ cantiereId, utente }) {
  const qc = useQueryClient()
  const abilitato = RUOLI_CHIUSURA.includes(utente?.ruolo)

  const { data, isLoading } = useQuery(
    ['chiusura', cantiereId],
    () => api.get(`/cantieri/${cantiereId}/chiusura`).then(r => r.data),
    { enabled: abilitato, staleTime: 0 },
  )

  const [form, setForm] = useState(null)
  const [dirty, setDirty] = useState(false)
  const [salvato, setSalvato] = useState(false)

  useEffect(() => {
    if (!data) return
    setForm({
      committente_nome: data.committente_nome || '',
      direzione_lavori: data.direzione_lavori || '',
      responsabile_nome: data.responsabile_nome || data.contesto?.responsabile || '',
      data_ultimazione: data.data_ultimazione || data.contesto?.data_fine || dayjs().format('YYYY-MM-DD'),
      relazione: data.relazione || '',
      consegne: data.consegne || '',
      foto_ids: data.foto_ids || [],
      foto_copertina_id: data.foto_copertina_id || null,
    })
    setDirty(false)
  }, [data])

  const salvaMutation = useMutation(
    (body) => api.put(`/cantieri/${cantiereId}/chiusura`, body),
    {
      onSuccess: () => {
        qc.invalidateQueries(['chiusura', cantiereId])
        setDirty(false); setSalvato(true)
        setTimeout(() => setSalvato(false), 2000)
      },
      onError: () => toast.error('Errore nel salvataggio'),
    },
  )

  const formRef = useRef(form)
  formRef.current = form

  const toBody = (src) => ({
    committente_nome: src.committente_nome || null,
    direzione_lavori: src.direzione_lavori || null,
    responsabile_nome: src.responsabile_nome || null,
    data_ultimazione: src.data_ultimazione || null,
    relazione: src.relazione || null,
    consegne: src.consegne || null,
    foto_ids: src.foto_ids || [],
    foto_copertina_id: src.foto_copertina_id || null,
  })

  const salvaOra = (patch = {}) => {
    const src = { ...formRef.current, ...patch }
    formRef.current = src
    return salvaMutation.mutateAsync(toBody(src))
  }

  const aggiorna = (patch, salvaSubito = false) => {
    setForm(f => {
      const next = { ...f, ...patch }
      formRef.current = next
      return next
    })
    setDirty(true)
    if (salvaSubito) salvaOra(patch)
  }

  const onBlurSalva = () => { if (dirty) salvaOra() }

  const bozzaMutation = useMutation(
    () => api.post(`/cantieri/${cantiereId}/chiusura/genera-bozza`, null, { timeout: 120000 }).then(r => r.data),
    {
      onSuccess: (res) => {
        aggiorna({ relazione: res.relazione || form.relazione })
        toast.success('Bozza generata — rileggila e sistemala')
      },
      onError: (e) => toast.error(e.response?.data?.detail || 'Errore generazione bozza'),
    },
  )

  const confermaMutation = useMutation(
    () => api.post(`/cantieri/${cantiereId}/chiusura/conferma`).then(r => r.data),
    {
      onSuccess: () => {
        qc.invalidateQueries(['chiusura', cantiereId])
        qc.invalidateQueries(['cantiere', cantiereId])
        toast.success('Cantiere chiuso — verbale definitivo')
        setConferma(false)
      },
      onError: (e) => toast.error(e.response?.data?.detail || 'Errore conferma'),
    },
  )

  const [conferma, setConferma] = useState(false)
  const [scaricando, setScaricando] = useState(false)

  const scaricaPdf = async () => {
    setScaricando(true)
    if (data?.stato !== 'definitivo') {
      try { await salvaOra() } catch { /* segnalato da salvaMutation */ }
    }
    try {
      const resp = await api.post(`/cantieri/${cantiereId}/chiusura/genera-pdf`, null, { responseType: 'blob', timeout: 90000 })
      const url = URL.createObjectURL(resp.data)
      const a = document.createElement('a')
      a.href = url
      a.download = resp.headers['content-disposition']?.match(/filename="(.+)"/)?.[1] || 'verbale_chiusura.pdf'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Errore generazione PDF')
    } finally {
      setScaricando(false)
    }
  }

  if (!abilitato) return <div className="card text-center py-10 text-gray-400">Sezione riservata allo staff interno.</div>
  if (isLoading || !form) return <div className="text-center py-10 text-gray-400">Caricamento...</div>

  const ctx = data.contesto || {}
  const definitivo = data.stato === 'definitivo'
  const foto = ctx.foto || []
  const selezionate = form.foto_ids || []

  const toggleFoto = (id) => {
    const cur = formRef.current?.foto_ids || []
    const next = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]
    const patch = { foto_ids: next }
    if (!next.includes(formRef.current?.foto_copertina_id)) patch.foto_copertina_id = next[0] || null
    aggiorna(patch, true)
  }
  const setCopertina = (id) => {
    const cur = formRef.current?.foto_ids || []
    const next = cur.includes(id) ? cur : [...cur, id]
    aggiorna({ foto_ids: next, foto_copertina_id: id }, true)
  }

  return (
    <div className="space-y-4">
      {/* Intestazione */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <Flag size={16} className="text-steelex-orange" /> Chiusura cantiere
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">Verbale di fine lavori — documento relazionale, non contabile</p>
        </div>
        <div className="text-right shrink-0">
          {definitivo ? (
            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-green-100 text-green-700">
              <CircleCheck size={12} /> Verbale n. {data.numero}
            </span>
          ) : (
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">Bozza</span>
          )}
          <div className="text-[11px] text-gray-400 mt-1 h-3">
            {salvato ? 'salvato' : dirty ? 'modifiche non salvate' : ''}
          </div>
        </div>
      </div>

      {/* Contesto sintetico */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          ['Inizio lavori', fmtD(ctx.data_inizio)],
          ['Fine lavori', fmtD(ctx.data_fine)],
          ['Durata', ctx.durata || '—'],
          ['Fasi / Avanz.', `${ctx.n_fasi ?? 0} · ${Math.round(ctx.avanzamento ?? 0)}%`],
        ].map(([k, v]) => (
          <div key={k} className="bg-gray-50 rounded-lg px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">{k}</p>
            <p className="text-sm text-gray-800 font-medium">{v}</p>
          </div>
        ))}
      </div>

      {/* Dati del verbale */}
      <div className="card space-y-3">
        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Dati del verbale</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs text-gray-500">Committente</span>
            <input className="input-field mt-1 text-sm" value={form.committente_nome}
              onChange={e => aggiorna({ committente_nome: e.target.value })} onBlur={onBlurSalva} />
          </label>
          <label className="block">
            <span className="text-xs text-gray-500">Direzione lavori</span>
            <input className="input-field mt-1 text-sm" placeholder="Nome del direttore lavori"
              value={form.direzione_lavori} onChange={e => aggiorna({ direzione_lavori: e.target.value })} onBlur={onBlurSalva} />
          </label>
          <label className="block">
            <span className="text-xs text-gray-500">Responsabile di cantiere</span>
            <input className="input-field mt-1 text-sm" value={form.responsabile_nome}
              onChange={e => aggiorna({ responsabile_nome: e.target.value })} onBlur={onBlurSalva} />
          </label>
          <label className="block">
            <span className="text-xs text-gray-500">Data di ultimazione</span>
            <input type="date" className="input-field mt-1 text-sm" value={form.data_ultimazione || ''}
              onChange={e => aggiorna({ data_ultimazione: e.target.value }, true)} />
          </label>
        </div>
      </div>

      {/* Relazione */}
      <div className="card space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Relazione dei lavori eseguiti</p>
          <button onClick={() => bozzaMutation.mutate()} disabled={bozzaMutation.isLoading}
            className="flex items-center gap-1.5 text-xs font-semibold text-steelex-orange hover:underline disabled:opacity-50">
            {bozzaMutation.isLoading ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            {bozzaMutation.isLoading ? 'Genero…' : 'Genera bozza AI'}
          </button>
        </div>
        <textarea
          className="input-field text-sm leading-relaxed w-full font-serif"
          rows={12}
          placeholder="Descrizione dei lavori eseguiti. Usa 'Genera bozza AI' per un primo testo da diario e cronoprogramma, poi correggilo."
          value={form.relazione}
          onChange={e => aggiorna({ relazione: e.target.value })}
          onBlur={onBlurSalva}
        />
        <p className="text-[11px] text-gray-400">Testo libero, in paragrafi separati da una riga vuota. Niente importi o costi: il verbale non è contabile.</p>
      </div>

      {/* Foto */}
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Documentazione fotografica</p>
          <span className="text-xs text-gray-400">{selezionate.length} selezionate</span>
        </div>
        {foto.length === 0 ? (
          <div className="text-center py-6 text-gray-400 text-sm flex flex-col items-center gap-1">
            <ImageOff size={22} className="opacity-40" />
            Nessuna foto nell'archivio del cantiere.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {foto.map(f => {
              const sel = selezionate.includes(f.id)
              const cov = form.foto_copertina_id === f.id
              return (
                <div key={f.id} className={`relative rounded-lg overflow-hidden border-2 transition-colors ${sel ? 'border-steelex-orange' : 'border-transparent'}`}>
                  <button type="button" onClick={() => toggleFoto(f.id)} className="block w-full">
                    <img src={f.url} alt={f.nota || 'foto'} className="w-full aspect-[4/3] object-cover" />
                    {sel && (
                      <span className="absolute top-1 left-1 bg-steelex-orange text-white rounded-full w-5 h-5 flex items-center justify-center">
                        <Check size={12} />
                      </span>
                    )}
                  </button>
                  {sel && (
                    <button type="button" onClick={() => setCopertina(f.id)}
                      className={`absolute top-1 right-1 rounded-full w-5 h-5 flex items-center justify-center ${cov ? 'bg-steelex-orange text-white' : 'bg-white/85 text-gray-500'}`}
                      title={cov ? 'Foto di copertina' : 'Imposta come copertina'}>
                      <Star size={11} fill={cov ? 'currentColor' : 'none'} />
                    </button>
                  )}
                  {(f.nota || f.data) && (
                    <p className="text-[10px] text-gray-500 px-1.5 py-1 bg-white truncate">
                      {[f.nota, f.data ? fmtD(f.data) : null].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        )}
        {selezionate.length > 0 && <p className="text-[11px] text-gray-400">La <Star size={10} className="inline -mt-0.5" /> segna la foto di copertina del verbale.</p>}
      </div>

      {/* Consegne */}
      <div className="card space-y-2">
        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Consegne al committente</p>
        <textarea className="input-field text-sm w-full" rows={3}
          placeholder="Es. manuale d'uso e manutenzione, certificazioni impianti, documentazione as-built…"
          value={form.consegne} onChange={e => aggiorna({ consegne: e.target.value })} onBlur={onBlurSalva} />
      </div>

      {/* Azioni */}
      <div className="flex flex-col sm:flex-row gap-2 pt-1">
        <button onClick={scaricaPdf} disabled={scaricando}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
          {scaricando ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />}
          {definitivo ? 'Scarica verbale PDF' : 'Anteprima verbale PDF'}
        </button>
        {!definitivo && (
          <button onClick={() => setConferma(true)}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-steelex-orange text-white text-sm font-semibold hover:bg-gray-800">
            <Flag size={15} /> Conferma chiusura cantiere
          </button>
        )}
      </div>

      {/* Modale conferma */}
      {conferma && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setConferma(false)}>
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full space-y-3" onClick={e => e.stopPropagation()}>
            <h4 className="font-semibold text-gray-900">Confermi la chiusura?</h4>
            <p className="text-sm text-gray-600">
              Il verbale diventa <b>definitivo</b> e il cantiere passa a <b>Completato</b> con data
              fine lavori <b>{fmtD(form.data_ultimazione)}</b>. Potrai comunque riscaricare il PDF.
            </p>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setConferma(false)} className="flex-1 py-2 rounded-lg border border-gray-300 text-sm text-gray-600">Annulla</button>
              <button onClick={() => confermaMutation.mutate()} disabled={confermaMutation.isLoading}
                className="flex-1 py-2 rounded-lg bg-steelex-orange text-white text-sm font-semibold disabled:opacity-50">
                {confermaMutation.isLoading ? 'Confermo…' : 'Conferma e chiudi'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
