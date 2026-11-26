// Sicurezza e backup (solo admin): cestino dei cantieri eliminati, registro
// attività (chi ha fatto cosa e quando) e backup da salvare su un disco esterno.
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { Trash2, RotateCcw, History, HardDriveDownload, KeyRound, Search, Copy, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import dayjs from 'dayjs'
import api from '../lib/api'

// scarica un file dal server col nome che dà il server
async function scaricaFile(url, nomeDefault) {
  try {
    const res = await api.get(url, { responseType: 'blob', timeout: 120000 })
    const nome = res.headers['content-disposition']?.match(/filename="(.+)"/)?.[1] || nomeDefault
    const u = URL.createObjectURL(res.data)
    const a = document.createElement('a')
    a.href = u; a.download = nome; a.click()
    setTimeout(() => URL.revokeObjectURL(u), 1000)
  } catch {
    toast.error('Download non riuscito')
  }
}

const quando = d => d ? dayjs(d).format('DD/MM/YYYY HH:mm') : '—'

const SCHEDE = [
  ['cestino', 'Cestino', Trash2],
  ['registro', 'Registro attività', History],
  ['backup', 'Backup', HardDriveDownload],
]

export default function SicurezzaPage() {
  const [scheda, setScheda] = useState('cestino')
  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Sicurezza e backup</h1>
        <p className="text-sm text-gray-500">Per recuperare gli errori: cosa è stato eliminato, chi ha fatto cosa, copie di sicurezza.</p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {SCHEDE.map(([k, l, Icona]) => (
          <button key={k} onClick={() => setScheda(k)}
            className={`h-12 rounded-xl border text-sm font-semibold flex items-center justify-center gap-2 ${scheda === k ? 'bg-steelex-orange text-white border-steelex-orange' : 'bg-white text-gray-600 border-gray-200'}`}>
            <Icona size={16} /> <span className="truncate">{l}</span>
          </button>
        ))}
      </div>
      {scheda === 'cestino' && <Cestino />}
      {scheda === 'registro' && <Registro />}
      {scheda === 'backup' && <Backup />}
    </div>
  )
}

function Cestino() {
  const qc = useQueryClient()
  const { data = [], isLoading } = useQuery('cestino', () => api.get('/sicurezza/cestino').then(r => r.data))
  const ripristina = useMutation(id => api.post(`/sicurezza/cestino/${id}/ripristina`).then(r => r.data), {
    onSuccess: r => {
      toast.success(`Ripristinato: ${r.righe} elementi, ${r.collegamenti} collegamenti`)
      qc.invalidateQueries('cestino'); qc.invalidateQueries('cantieri')
    },
    onError: e => toast.error(e.response?.data?.detail || 'Ripristino non riuscito'),
  })
  if (isLoading) return <p className="text-sm text-gray-500">Carico…</p>
  if (!data.length) return <div className="card text-sm text-gray-500">Il cestino è vuoto. Da adesso ogni cantiere eliminato finisce qui e si può ripristinare.</div>
  return (
    <div className="space-y-2">
      {data.map(e => (
        <div key={e.id} className="card flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900 truncate">{e.nome}</p>
            <p className="text-xs text-gray-500">
              Eliminato il {quando(e.eliminato_il)}{e.eliminato_da_nome ? ` da ${e.eliminato_da_nome}` : ''} · {e.righe} elementi
              {e.dettaglio?.diari_giornalieri ? ` · ${e.dettaglio.diari_giornalieri} diari` : ''}
              {e.dettaglio?.foto_cantiere ? ` · ${e.dettaglio.foto_cantiere} foto` : ''}
              {e.dettaglio?.rapportini_operativi ? ` · ${e.dettaglio.rapportini_operativi} rapportini` : ''}
            </p>
            {e.ripristinato_il && <p className="text-xs text-green-700">Ripristinato il {quando(e.ripristinato_il)} da {e.ripristinato_da_nome}</p>}
          </div>
          {!e.ripristinato_il && (
            <button className="btn-primary flex items-center justify-center gap-2" disabled={ripristina.isLoading}
              onClick={() => { if (confirm(`Ripristinare «${e.nome}» com'era al momento dell'eliminazione?`)) ripristina.mutate(e.id) }}>
              <RotateCcw size={16} /> Ripristina
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

function Registro() {
  const [cerca, setCerca] = useState('')
  const [dal, setDal] = useState(dayjs().subtract(7, 'day').format('YYYY-MM-DD'))
  const [soloElim, setSoloElim] = useState(false)
  const params = new URLSearchParams({ dal, limit: '500', ...(cerca.trim() ? { cerca: cerca.trim() } : {}), ...(soloElim ? { solo_eliminazioni: 'true' } : {}) })
  const { data = [], isLoading } = useQuery(['registro', dal, cerca, soloElim],
    () => api.get(`/sicurezza/registro?${params}`).then(r => r.data), { keepPreviousData: true })
  return (
    <div className="space-y-3">
      <div className="card grid grid-cols-1 sm:grid-cols-3 gap-2">
        <label className="relative sm:col-span-2">
          <Search size={16} className="absolute left-3 top-3 text-gray-400" />
          <input className="input-field pl-9" placeholder="Cerca persona, cantiere, azione…" value={cerca} onChange={e => setCerca(e.target.value)} />
        </label>
        <input type="date" className="input-field" value={dal} onChange={e => setDal(e.target.value)} />
        <label className="flex items-center gap-2 text-sm text-gray-600 sm:col-span-3">
          <input type="checkbox" checked={soloElim} onChange={e => setSoloElim(e.target.checked)} /> Solo eliminazioni
        </label>
      </div>
      {isLoading ? <p className="text-sm text-gray-500">Carico…</p> : !data.length
        ? <div className="card text-sm text-gray-500">Nessuna attività in questo periodo.</div>
        : (
          <div className="card divide-y divide-gray-100 p-0">
            {data.map(r => (
              <div key={r.id} className={`px-4 py-2.5 text-sm ${r.metodo === 'DELETE' ? 'bg-red-50' : ''}`}>
                <div className="flex justify-between gap-2">
                  <span className={`font-medium ${r.metodo === 'DELETE' ? 'text-red-700' : 'text-gray-900'}`}>{r.descrizione}</span>
                  <span className="text-xs text-gray-400 whitespace-nowrap">{quando(r.quando)}</span>
                </div>
                <div className="text-xs text-gray-500">
                  {r.utente_nome || 'senza accesso'}
                  {r.cantiere_nome ? ` · ${r.cantiere_nome}` : r.cantiere_id ? ` · cantiere ${r.cantiere_id}` : ''}
                  {r.esito >= 400 ? <span className="text-amber-700"> · non riuscito ({r.esito})</span> : ''}
                </div>
              </div>
            ))}
          </div>
        )}
      <p className="text-[11px] text-gray-400">Si registrano tutte le modifiche (non le sole letture). Il registro parte dal 26/11/2026.</p>
    </div>
  )
}

function Backup() {
  const qc = useQueryClient()
  const [scarico, setScarico] = useState(false)
  const [nuova, setNuova] = useState(null)
  const { data: chiavi = [] } = useQuery('chiavi-backup', () => api.get('/sicurezza/chiavi-backup').then(r => r.data))
  const crea = useMutation(() => api.post('/sicurezza/chiavi-backup', { nome: 'PC ufficio' }).then(r => r.data), {
    onSuccess: k => { setNuova(k.chiave); qc.invalidateQueries('chiavi-backup') },
  })
  const revoca = useMutation(id => api.delete(`/sicurezza/chiavi-backup/${id}`), { onSuccess: () => qc.invalidateQueries('chiavi-backup') })
  const scarica = async () => {
    setScarico(true)
    await scaricaFile('/sicurezza/backup/database', 'backup-steelex-database.zip')
    setScarico(false)
  }
  return (
    <div className="space-y-3">
      <div className="card space-y-2">
        <h2 className="font-semibold text-gray-900">Scarica il backup del database</h2>
        <p className="text-sm text-gray-600">
          Un file .zip con tutti i dati dell'app (cantieri, diari, rapportini, ore, economia, preventivi…).
          Salvalo su una chiavetta o un disco esterno. Si apre con qualsiasi programma e si può rimettere in un database nuovo.
        </p>
        <button className="btn-primary w-full flex items-center justify-center gap-2" disabled={scarico} onClick={scarica}>
          {scarico ? <><Loader2 size={18} className="animate-spin" /> Preparo il file…</> : <><HardDriveDownload size={18} /> Scarica backup (.zip)</>}
        </button>
        <p className="text-[11px] text-gray-400">Foto e documenti non sono nel file: li copia il backup automatico del PC dell'ufficio.</p>
      </div>

      <div className="card space-y-2">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2"><KeyRound size={16} /> Backup automatico dal PC dell'ufficio</h2>
        <p className="text-sm text-gray-600">
          Il PC scarica ogni giorno database, foto e documenti, e li copia anche sul disco esterno se è collegato.
          Usa una chiave che vale solo per i backup.
        </p>
        {nuova && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm space-y-1">
            <p className="font-semibold text-amber-900">Chiave nuova (si vede solo adesso):</p>
            <div className="flex gap-2 items-center">
              <code className="flex-1 break-all text-xs bg-white rounded px-2 py-1">{nuova}</code>
              <button className="btn-secondary" onClick={() => { navigator.clipboard.writeText(nuova); toast.success('Copiata') }}><Copy size={14} /></button>
            </div>
          </div>
        )}
        {chiavi.map(k => (
          <div key={k.id} className="flex items-center justify-between text-sm border-t border-gray-100 pt-2">
            <div>
              <span className={k.attiva ? 'text-gray-900' : 'text-gray-400 line-through'}>{k.nome}</span>
              <span className="text-xs text-gray-500"> · creata {quando(k.creata_il)} · ultimo backup {quando(k.ultimo_uso)}</span>
            </div>
            {k.attiva && <button className="text-xs text-red-600 underline" onClick={() => { if (confirm('Disattivare questa chiave? Il backup automatico si ferma finché non ne metti una nuova.')) revoca.mutate(k.id) }}>Disattiva</button>}
          </div>
        ))}
        <button className="btn-secondary w-full" disabled={crea.isLoading} onClick={() => crea.mutate()}>Crea una chiave nuova</button>
      </div>
    </div>
  )
}
