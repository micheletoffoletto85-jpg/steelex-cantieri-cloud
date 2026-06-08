import { useQuery } from 'react-query'
import { Link } from 'react-router-dom'
import { HardHat, TrendingUp, Clock, CheckCircle, AlertCircle, CheckCircle2, AlertTriangle, PauseCircle, Mic, ChevronRight, Calendar } from 'lucide-react'
import api from '../lib/api'
import { useAuth } from '../lib/auth'
import dayjs from 'dayjs'
import 'dayjs/locale/it'
import relativeTime from 'dayjs/plugin/relativeTime'
dayjs.locale('it')
dayjs.extend(relativeTime)

const STATO_LABEL = {
  preventivo: { label: 'Preventivo', color: 'bg-gray-100 text-gray-700' },
  in_corso: { label: 'In Corso', color: 'bg-blue-100 text-blue-700' },
  sospeso: { label: 'Sospeso', color: 'bg-yellow-100 text-yellow-700' },
  completato: { label: 'Completato', color: 'bg-green-100 text-green-700' },
  annullato: { label: 'Annullato', color: 'bg-red-100 text-red-700' },
}

const STATO_FASE = {
  pianificata:  { label: 'Pianificata',  icon: Clock,         cls: 'text-gray-500' },
  in_corso:     { label: 'In corso',     icon: Clock,         cls: 'text-blue-600' },
  completata:   { label: 'Completata',   icon: CheckCircle2,  cls: 'text-green-600' },
  in_ritardo:   { label: 'In ritardo',   icon: AlertTriangle, cls: 'text-red-500' },
  sospesa:      { label: 'Sospesa',      icon: PauseCircle,   cls: 'text-amber-500' },
}

function ClienteDashboard({ utente, cantieri }) {
  // Per il cliente di solito c'è 1 cantiere — prende il primo attivo
  const cantiere = cantieri.find(c => c.stato === 'in_corso') || cantieri[0]

  const { data, isLoading } = useQuery(
    ['aggiornamenti-cliente', cantiere?.id],
    () => api.get(`/cantieri/${cantiere.id}/aggiornamenti-cliente`).then(r => r.data),
    { enabled: !!cantiere, staleTime: 0 }
  )

  return (
    <div className="space-y-5">
      {/* Header benvenuto */}
      <div className="bg-steelex-dark rounded-2xl p-6 text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full bg-steelex-orange" />
          <div className="absolute -bottom-12 -left-4 w-32 h-32 rounded-full bg-steelex-orange" />
        </div>
        <div className="relative">
          <img src="/logo-steelex.png" alt="Steelex" className="h-7 mb-4 opacity-80" />
          <p className="text-sm tracking-widest text-gray-400 uppercase mb-1">Benvenuto</p>
          <h1 className="text-2xl font-bold text-white">{utente?.nome}</h1>
          <div className="mt-3 h-0.5 w-16 bg-steelex-orange rounded" />
          {cantiere && (
            <p className="text-gray-400 text-sm mt-3">
              Stai seguendo: <span className="text-white font-medium">{cantiere.nome}</span>
            </p>
          )}
        </div>
      </div>

      {cantieri.length === 0 && (
        <div className="card text-center py-10 text-gray-400">
          <HardHat size={40} className="mx-auto mb-2 opacity-30" />
          <p>Non sei ancora assegnato a nessun cantiere.</p>
          <p className="text-xs mt-1">Contatta il responsabile per ricevere l'accesso.</p>
        </div>
      )}

      {cantiere && (
        <>
          {/* Avanzamento globale */}
          {data && (
            <div className="bg-steelex-dark rounded-2xl p-5 text-white">
              <p className="text-xs tracking-widest text-gray-400 uppercase mb-1">Avanzamento cantiere</p>
              <div className="flex items-end justify-between mb-3">
                <p className="text-4xl font-bold text-steelex-orange">{data.avanzamento_globale}%</p>
                <Link to={`/cantieri/${cantiere.id}`} className="text-xs text-steelex-orange underline mb-1">Vedi dettagli →</Link>
              </div>
              <div className="w-full bg-white/10 rounded-full h-2.5">
                <div className="bg-steelex-orange h-2.5 rounded-full transition-all duration-1000"
                  style={{ width: `${Math.min(100, data.avanzamento_globale)}%` }} />
              </div>
            </div>
          )}

          {/* Fasi condivise */}
          {isLoading && (
            <div className="flex items-center justify-center py-8 text-gray-400 gap-3">
              <div className="w-6 h-6 border-2 border-steelex-orange border-t-transparent rounded-full animate-spin" />
              <span className="text-sm">Caricamento aggiornamenti...</span>
            </div>
          )}

          {data && data.fasi.length === 0 && data.totale_fasi > 0 && (
            <div className="card text-center py-6 border-2 border-dashed border-orange-200">
              <p className="text-sm text-gray-500">Nessun aggiornamento condiviso ancora.</p>
              <p className="text-xs text-gray-400 mt-1">Il responsabile pubblicherà gli aggiornamenti qui.</p>
            </div>
          )}

          {data && data.fasi.length > 0 && (
            <div className="card space-y-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                Cronoprogramma — {data.fasi_condivise} fase{data.fasi_condivise !== 1 ? 'i' : ''} condivise
              </p>
              {data.fasi.map(f => {
                const stato = STATO_FASE[f.stato] || STATO_FASE.pianificata
                const Icona = stato.icon
                return (
                  <div key={f.id} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <Icona size={13} className={stato.cls + ' flex-shrink-0'} />
                        <span className="text-sm font-medium text-gray-800 truncate">{f.nome}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`text-xs font-medium ${stato.cls}`}>{stato.label}</span>
                        <span className="text-xs font-bold text-steelex-orange w-8 text-right">{f.percentuale}%</span>
                      </div>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <div className="h-1.5 rounded-full transition-all duration-700"
                        style={{ width: `${Math.min(100, f.percentuale)}%`, backgroundColor: f.colore || '#FF6B00' }} />
                    </div>
                    {(f.data_inizio || f.data_fine_prevista) && (
                      <p className="text-[10px] text-gray-400">
                        {f.data_inizio && dayjs(f.data_inizio).format('D MMM')}
                        {f.data_inizio && f.data_fine_prevista && ' → '}
                        {f.data_fine_prevista && dayjs(f.data_fine_prevista).format('D MMM YYYY')}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Prossimi appuntamenti */}
          {data && data.appuntamenti?.length > 0 && (
            <div className="card space-y-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-2">
                <Calendar size={13} /> Prossimi aggiornamenti
              </p>
              {data.appuntamenti.map(a => (
                <div key={a.id} className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0">
                  <div className="flex-shrink-0 w-10 h-10 rounded-xl flex flex-col items-center justify-center text-center"
                    style={{ backgroundColor: (a.colore || '#FF6B00') + '20', border: `1.5px solid ${(a.colore || '#FF6B00')}40` }}>
                    <span className="text-[10px] font-bold leading-tight" style={{ color: a.colore || '#FF6B00' }}>{dayjs(a.data).format('D')}</span>
                    <span className="text-[9px] uppercase" style={{ color: a.colore || '#FF6B00' }}>{dayjs(a.data).format('MMM')}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{a.nome}</p>
                    <p className="text-xs text-gray-400">{dayjs(a.data).fromNow()}</p>
                  </div>
                  <ChevronRight size={14} className="text-gray-300 flex-shrink-0" />
                </div>
              ))}
            </div>
          )}

          {/* Note dal cantiere */}
          {data && data.note_condivise?.length > 0 && (
            <div className="card space-y-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Ultime note dal cantiere</p>
              {data.note_condivise.slice(0, 3).map(n => (
                <div key={n.id} className="border-l-2 border-steelex-orange pl-3 py-1 space-y-0.5">
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-gray-400">
                      {dayjs(n.data).format('D MMMM YYYY')}
                      {n.meteo && <span className="ml-1">{n.meteo}</span>}
                    </p>
                    {n.fonte === 'voce' && <Mic size={10} className="text-red-400" />}
                  </div>
                  <p className="text-sm text-gray-700 leading-relaxed">{n.testo}</p>
                </div>
              ))}
            </div>
          )}

          {/* Link al dettaglio */}
          <Link to={`/cantieri/${cantiere.id}`}
            className="block w-full text-center py-3 rounded-xl border-2 border-steelex-orange text-steelex-orange font-semibold text-sm hover:bg-orange-50 transition-colors">
            Vai al cantiere completo →
          </Link>
        </>
      )}
    </div>
  )
}

export default function DashboardPage() {
  const { utente } = useAuth()
  const isCliente = utente?.ruolo === 'cliente'
  const { data: cantieri = [] } = useQuery('cantieri', () => api.get('/cantieri').then(r => r.data))

  const stats = {
    totale: cantieri.length,
    in_corso: cantieri.filter(c => c.stato === 'in_corso').length,
    completati: cantieri.filter(c => c.stato === 'completato').length,
    avanzamento_medio: cantieri.length
      ? Math.round(cantieri.reduce((s, c) => s + c.avanzamento, 0) / cantieri.length)
      : 0,
  }

  // Mostra i cantieri non completati/annullati, poi tutti gli altri — max 5
  const cantieriRecenti = [
    ...cantieri.filter(c => c.stato === 'in_corso'),
    ...cantieri.filter(c => c.stato === 'preventivo'),
    ...cantieri.filter(c => c.stato === 'sospeso'),
    ...cantieri.filter(c => !['in_corso', 'preventivo', 'sospeso'].includes(c.stato)),
  ].slice(0, 5)

  const STATO_BADGE = {
    preventivo: 'bg-gray-100 text-gray-600',
    in_corso: 'bg-blue-100 text-blue-700',
    sospeso: 'bg-yellow-100 text-yellow-700',
    completato: 'bg-green-100 text-green-700',
    annullato: 'bg-red-100 text-red-700',
  }
  const STATO_LABEL_DASH = { preventivo: 'Preventivo', in_corso: 'In Corso', sospeso: 'Sospeso', completato: 'Completato', annullato: 'Annullato' }

  if (isCliente) return <ClienteDashboard utente={utente} cantieri={cantieri} />

  return (
    <div className="space-y-6">
      {/* Intestazione */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Ciao, {utente?.nome} 👋</h1>
        <p className="text-gray-500 text-sm">Ecco la situazione dei cantieri oggi</p>
      </div>

      {/* Layout desktop: 2 colonne | mobile: stack */}
      <div className="lg:grid lg:grid-cols-3 lg:gap-6 space-y-6 lg:space-y-0">

        {/* Colonna sinistra: stats + azioni rapide */}
        <div className="lg:col-span-1 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <StatCard icon={HardHat} label="Totale Cantieri" value={stats.totale} color="orange" />
            <StatCard icon={Clock} label="In Corso" value={stats.in_corso} color="blue" />
            <StatCard icon={CheckCircle} label="Completati" value={stats.completati} color="green" />
            <StatCard icon={TrendingUp} label="Avanz. Medio" value={`${stats.avanzamento_medio}%`} color="purple" />
          </div>

          {/* Azioni rapide — solo desktop, no cliente */}
          {!isCliente && (
            <div className="hidden lg:block card space-y-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Azioni rapide</p>
              <Link to="/cantieri" className="flex items-center gap-2 text-sm text-gray-700 hover:text-steelex-orange font-medium py-1.5 transition-colors">
                <HardHat size={16} className="text-steelex-orange" /> Vai ai cantieri
              </Link>
              <Link to="/cantieri" state={{ nuovo: true }} className="flex items-center gap-2 text-sm text-gray-700 hover:text-steelex-orange font-medium py-1.5 transition-colors">
                <AlertCircle size={16} className="text-blue-500" /> Nuovo cantiere
              </Link>
            </div>
          )}
        </div>

        {/* Colonna destra: cantieri recenti */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-gray-800">Cantieri Recenti</h2>
            <Link to="/cantieri" className="text-steelex-orange text-sm font-medium">Vedi tutti →</Link>
          </div>
          {cantieri.length === 0 ? (
            <div className="card text-center py-8 text-gray-400">
              <HardHat size={40} className="mx-auto mb-2 opacity-30" />
              {isCliente ? (
                <p>Non sei ancora assegnato a nessun cantiere.<br/><span className="text-xs">Contatta il responsabile per ricevere l'accesso.</span></p>
              ) : (
                <>
                  <p>Nessun cantiere ancora</p>
                  <Link to="/cantieri" className="text-steelex-orange text-sm font-medium mt-2 inline-block">Crea il primo cantiere →</Link>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {cantieriRecenti.map(c => (
                <Link key={c.id} to={`/cantieri/${c.id}`}
                  className="card flex items-center gap-3 hover:border-steelex-orange border-2 border-transparent transition-colors">
                  <div className="w-9 h-9 rounded-xl bg-orange-50 flex items-center justify-center flex-shrink-0">
                    <HardHat size={18} className="text-steelex-orange" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{c.nome}</p>
                    <p className="text-sm text-gray-500 truncate">{c.cliente}{c.citta ? ` — ${c.citta}` : ''}</p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATO_BADGE[c.stato]}`}>
                      {STATO_LABEL_DASH[c.stato]}
                    </span>
                    <div className="text-right hidden sm:block w-16">
                      <div className="text-steelex-orange font-bold text-sm">{c.avanzamento}%</div>
                      <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
                        <div className="bg-steelex-orange h-1.5 rounded-full transition-all" style={{ width: `${c.avanzamento}%` }} />
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, color }) {
  const colors = {
    orange: 'bg-orange-50 text-orange-600',
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    purple: 'bg-purple-50 text-purple-600',
  }
  return (
    <div className="card">
      <div className={`inline-flex p-2 rounded-lg ${colors[color]} mb-2`}>
        <Icon size={20} />
      </div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
    </div>
  )
}
