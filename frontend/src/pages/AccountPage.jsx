import { useQuery, useMutation, useQueryClient } from 'react-query'
import { Bell, BellOff, UserCog } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../lib/api'
import { useAuth } from '../lib/auth'

// Pagina "Il mio account": ognuno sceglie quali notifiche ricevere.
// Default tutte attive; spegnere una categoria vale sia per il campanello in app sia per le push.
export default function AccountPage() {
  const { utente } = useAuth()
  const qc = useQueryClient()
  const { data, isLoading } = useQuery('preferenze-notifiche', () => api.get('/notifiche/preferenze').then(r => r.data))
  const categorie = data?.categorie || []

  const salva = useMutation(
    disattivate => api.put('/notifiche/preferenze', { disattivate }).then(r => r.data),
    {
      onSuccess: d => { qc.setQueryData('preferenze-notifiche', d); toast.success('Preferenze salvate') },
      onError: () => toast.error('Salvataggio non riuscito'),
    }
  )

  const imposta = (chiave, attiva) => {
    const spente = categorie.filter(c => (c.chiave === chiave ? !attiva : !c.attiva)).map(c => c.chiave)
    salva.mutate(spente)
  }
  const tutte = attiva => salva.mutate(attiva ? [] : categorie.map(c => c.chiave))
  const nAttive = categorie.filter(c => c.attiva).length

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-steelex-orange text-white flex items-center justify-center"><UserCog size={22} /></div>
        <div>
          <h1 className="text-2xl font-bold">Il mio account</h1>
          <p className="text-sm text-gray-500">{utente?.nome} {utente?.cognome} · {utente?.email}</p>
        </div>
      </div>

      <div className="card space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h2 className="font-bold text-lg">Notifiche</h2>
            <p className="text-xs text-gray-500">Scegli cosa vuoi ricevere — vale per il campanello e per le notifiche sul telefono</p>
          </div>
          {!isLoading && (
            <div className="flex gap-2">
              <button className="btn-secondary !min-h-[36px] !py-1.5 text-sm" disabled={salva.isLoading || nAttive === categorie.length} onClick={() => tutte(true)}>Tutte attive</button>
              <button className="btn-secondary !min-h-[36px] !py-1.5 text-sm" disabled={salva.isLoading || nAttive === 0} onClick={() => tutte(false)}>Spegni tutte</button>
            </div>
          )}
        </div>

        {isLoading ? <p className="text-gray-400 text-sm py-4 text-center">Caricamento...</p> : (
          <div className="divide-y divide-gray-100">
            {categorie.map(c => (
              <label key={c.chiave} className="flex items-center gap-3 py-3 cursor-pointer">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${c.attiva ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                  {c.attiva ? <Bell size={18} /> : <BellOff size={18} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`font-medium ${c.attiva ? 'text-gray-900' : 'text-gray-400'}`}>{c.etichetta}</p>
                  <p className="text-xs text-gray-400">{c.descrizione}</p>
                </div>
                {/* Interruttore grande: si usa anche col telefono in cantiere */}
                <input type="checkbox" className="sr-only peer" checked={c.attiva} disabled={salva.isLoading}
                  onChange={e => imposta(c.chiave, e.target.checked)} />
                <span className={`relative w-12 h-7 rounded-full transition-colors flex-shrink-0 ${c.attiva ? 'bg-green-500' : 'bg-gray-300'}`}>
                  <span className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow transition-all ${c.attiva ? 'left-[22px]' : 'left-0.5'}`} />
                </span>
              </label>
            ))}
          </div>
        )}
        <p className="text-xs text-gray-400">Le notifiche ricevute dipendono anche dal tuo ruolo: qui puoi solo spegnere quelle che non ti servono.</p>
      </div>
    </div>
  )
}
