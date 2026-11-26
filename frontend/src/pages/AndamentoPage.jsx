// Andamento annuale (admin + amministrazione): come sta andando l'anno, mese per
// mese, confrontato con l'anno prima. Grafici in SVG, colori del design system FR.
import { useState } from 'react'
import { useQuery } from 'react-query'
import { Link } from 'react-router-dom'
import { TrendingUp, TrendingDown, HardHat, Clock, Receipt, Percent, Info } from 'lucide-react'
import api from '../lib/api'

const MESI = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic']
const MESI_LUNGHI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']
const C = { ink: '#FF6B00', prima: '#D7D2C6', griglia: '#F1EEE8', costi: '#1A1A2E', ok: '#15803D', muted: '#6B6862' }
const eur = n => '€ ' + Math.round(Number(n) || 0).toLocaleString('it-IT')
const eurK = n => { const v = Number(n) || 0; return v >= 1000 ? `€ ${(v / 1000).toLocaleString('it-IT', { maximumFractionDigits: v >= 100000 ? 0 : 1 })}k` : eur(v) }
const num = n => Math.round(Number(n) || 0).toLocaleString('it-IT')
const perc = x => x == null ? '—' : `${(x * 100).toLocaleString('it-IT', { maximumFractionDigits: 1 })}%`
const cumul = arr => arr.reduce((acc, v, i) => [...acc, (acc[i - 1] || 0) + (v || 0)], [])

export default function AndamentoPage() {
  const [anno, setAnno] = useState(new Date().getFullYear())
  const { data, isLoading } = useQuery(['andamento', anno], () => api.get(`/andamento?anno=${anno}`).then(r => r.data), { keepPreviousData: true })
  if (isLoading || !data) return <div className="text-center py-12 text-steelex-muted-fg">Carico l'andamento…</div>
  const a = data.attuale, p = data.precedente
  const oggi = new Date(data.oggi)
  const mesiFatti = anno < oggi.getFullYear() ? 12 : anno > oggi.getFullYear() ? 0 : oggi.getMonth() + 1
  const delta = p.kpi.acquisito ? (a.kpi.acquisito - p.kpi.acquisito) / p.kpi.acquisito : null

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ textWrap: 'balance' }}>Andamento {anno}</h1>
          <p className="text-sm text-steelex-muted-fg">
            {anno === oggi.getFullYear() ? `Aggiornato a oggi, ${oggi.toLocaleDateString('it-IT')}` : 'Anno chiuso'} · confronto con il {anno - 1}
          </p>
        </div>
        <div className="flex gap-1.5">
          {[...new Set([...data.anni, anno])].sort().map(y => (
            <button key={y} onClick={() => setAnno(y)}
              className={`min-h-[40px] px-3.5 rounded-full text-sm font-semibold ${y === anno ? 'bg-steelex-orange text-white' : 'bg-white border border-steelex-border text-steelex-muted-fg'}`}>
              {y}
            </button>
          ))}
        </div>
      </div>

      {/* Hero: lavoro acquisito, progressivo dell'anno contro l'anno prima */}
      <div className="rounded-2xl bg-steelex-dark text-white p-5 sm:p-6 grid sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-4 items-center">
        <div>
          <p className="text-xs uppercase tracking-wide text-white/60">Lavoro acquisito</p>
          <p className="font-mono tabular-nums text-4xl sm:text-5xl font-medium mt-1">{eur(a.kpi.acquisito)}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            {delta != null && (
              <span className={`inline-flex items-center gap-1 font-semibold ${delta >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                {delta >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                {delta >= 0 ? '+' : ''}{perc(delta)} sul {anno - 1}
              </span>
            )}
            <span className="text-white/60">{a.kpi.cantieri_acquisiti} cantieri · {eur(a.kpi.portafoglio)} ancora da fare</span>
          </div>
        </div>
        <Progressivo att={cumul(a.mesi.acquisito).map((v, i) => i < mesiFatti ? v : null)} prima={cumul(p.mesi.acquisito)} anno={anno} />
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi icona={HardHat} titolo="Cantieri chiusi" valore={num(a.kpi.chiusi)} prima={p.kpi.chiusi} adesso={a.kpi.chiusi} />
        <Kpi icona={Clock} titolo="Ore lavorate" valore={num(a.kpi.ore)} sotto={`${num(a.kpi.giornate)} giornate da 8 ore`} prima={p.kpi.ore} adesso={a.kpi.ore} />
        <Kpi icona={Receipt} titolo="Costi registrati" valore={eurK(a.kpi.costi)} sotto="spese + manodopera" />
        <Kpi icona={Percent} titolo="Margine cantieri chiusi" valore={perc(a.kpi.margine_chiusi)}
          sotto={a.kpi.margine_su ? `su ${a.kpi.margine_su} cantieri con importo` : 'nessun cantiere chiuso con importo'} />
      </div>

      {/* Mese per mese */}
      <div className="card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Mese per mese</h2>
          <div className="flex flex-wrap gap-3 text-xs text-steelex-muted-fg">
            <Leg colore={C.ink}>Acquisito {anno}</Leg>
            <Leg colore={C.prima}>Acquisito {anno - 1}</Leg>
            <Leg colore={C.costi} linea>Costi {anno}</Leg>
          </div>
        </div>
        <BarreMensili a={a} p={p} mesiFatti={mesiFatti} />
      </div>

      {/* Ore */}
      <div className="card space-y-2">
        <h2 className="font-semibold">Ore lavorate</h2>
        <p className="text-xs text-steelex-muted-fg -mt-1">Dai rapportini e dalle ore registrate in cantiere</p>
        <OreMensili ore={a.mesi.ore} prima={p.mesi.ore} mesiFatti={mesiFatti} />
      </div>

      {/* Cantieri dell'anno */}
      {a.cantieri.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <h2 className="font-semibold px-4 pt-4 pb-2">I lavori più importanti del {anno}</h2>
          <div className="divide-y divide-steelex-border">
            {a.cantieri.map(c => (
              <Link key={c.id} to={`/cantieri/${c.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-steelex-muted">
                <span className="text-xs text-steelex-muted-fg w-8">{MESI[c.mese - 1]}</span>
                <span className="flex-1 min-w-0 truncate text-sm">{c.nome}</span>
                {c.margine != null && c.speso > 0 && c.stato === 'completato' && (
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${c.margine >= 0.2 ? 'bg-ok-tint text-ok' : c.margine >= 0 ? 'bg-warn-tint text-warn' : 'bg-danger-tint text-danger'}`}>
                    {perc(c.margine)}
                  </span>
                )}
                <span className="font-mono tabular-nums text-sm w-24 text-right">{c.valore ? eur(c.valore) : '—'}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {a.kpi.cantieri_senza_importo > 0 && (
        <p className="text-xs text-steelex-muted-fg flex gap-1.5"><Info size={14} className="shrink-0 mt-px" />
          {a.kpi.cantieri_senza_importo} cantieri dell'anno non hanno un importo (senza budget):
          contano in ore, costi e cantieri chiusi ma non nel lavoro acquisito. Per farli contare, metti il budget nella scheda del cantiere.
        </p>
      )}
    </div>
  )
}

function Leg({ colore, linea, children }) {
  return (
    <span className="flex items-center gap-1.5">
      {linea ? <span className="w-4 border-t-2 border-dashed" style={{ borderColor: colore }} />
        : <span className="w-2.5 h-2.5 rounded-sm" style={{ background: colore }} />}
      {children}
    </span>
  )
}

function Kpi({ icona: Icona, titolo, valore, sotto, prima, adesso }) {
  const d = prima ? (adesso - prima) / prima : null
  return (
    <div className="card space-y-1">
      <p className="text-xs text-steelex-muted-fg flex items-center gap-1.5"><Icona size={14} /> {titolo}</p>
      <p className="font-mono tabular-nums text-2xl font-medium">{valore}</p>
      {d != null
        ? <p className={`text-xs font-semibold ${d >= 0 ? 'text-ok' : 'text-danger'}`}>{d >= 0 ? '+' : ''}{perc(d)} sull'anno prima</p>
        : sotto && <p className="text-xs text-steelex-muted-fg">{sotto}</p>}
    </div>
  )
}

// Curva del progressivo: quanto lavoro si è acquisito da inizio anno
function Progressivo({ att, prima, anno }) {
  const W = 420, H = 150, P = 6
  const max = Math.max(1, ...att.filter(v => v != null), ...prima)
  const x = i => P + (i * (W - 2 * P)) / 11
  const y = v => H - 18 - (v / max) * (H - 34)
  const linea = arr => arr.map((v, i) => v == null ? null : `${x(i)},${y(v)}`).filter(Boolean).join(' ')
  const ultimo = att.reduce((u, v, i) => v != null ? i : u, -1)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-36" role="img" aria-label={`Progressivo del lavoro acquisito ${anno} contro ${anno - 1}`}>
      {prima.some(Boolean) && <polyline points={linea(prima)} fill="none" stroke="rgba(255,255,255,.35)" strokeWidth="2" strokeDasharray="5 5" />}
      {ultimo >= 0 && <>
        <polygon points={`${x(0)},${H - 18} ${linea(att)} ${x(ultimo)},${H - 18}`} fill="rgba(255,255,255,.08)" />
        <polyline points={linea(att)} fill="none" stroke="#FF6B00" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(ultimo)} cy={y(att[ultimo])} r="5" fill="#FF6B00" stroke="#1A1A2E" strokeWidth="2" />
      </>}
      {MESI.map((m, i) => (i % 2 === 0 || i === 11) && (
        <text key={m} x={x(i)} y={H - 3} textAnchor="middle" fontSize="10" fill="rgba(255,255,255,.5)">{m}</text>
      ))}
      {prima.some(Boolean) && <text x={W - P} y={12} textAnchor="end" fontSize="10" fill="rgba(255,255,255,.5)">— — {anno - 1}</text>}
    </svg>
  )
}

function BarreMensili({ a, p, mesiFatti }) {
  const [sel, setSel] = useState(null)
  const W = 720, H = 240, SX = 44, BASE = H - 24
  const vals = a.mesi.acquisito, pv = p.mesi.acquisito, costi = a.mesi.costi
  const max = Math.max(1, ...vals, ...pv, ...costi) * 1.1
  const passo = (W - SX - 8) / 12
  const y = v => BASE - (v / max) * (BASE - 12)
  const tacche = [0, 0.25, 0.5, 0.75, 1].map(t => t * max)
  const lineaCosti = costi.map((v, i) => i < mesiFatti ? `${SX + passo * i + passo / 2},${y(v)}` : null).filter(Boolean).join(' ')
  const m = sel ?? (mesiFatti ? mesiFatti - 1 : 0)
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Lavoro acquisito e costi per mese">
        {tacche.map(t => (
          <g key={t}>
            <line x1={SX} x2={W - 8} y1={y(t)} y2={y(t)} stroke={C.griglia} />
            <text x={SX - 6} y={y(t) + 3} textAnchor="end" fontSize="10" fill={C.muted}>{eurK(t)}</text>
          </g>
        ))}
        {MESI.map((nome, i) => {
          const cx = SX + passo * i + passo / 2, bw = Math.min(16, passo / 3.2)
          const attivo = i === m
          return (
            <g key={nome} onClick={() => setSel(i)} onMouseEnter={() => setSel(i)} style={{ cursor: 'pointer' }}>
              <rect x={SX + passo * i} y={0} width={passo} height={BASE} fill={attivo ? 'rgba(255,107,0,.06)' : 'transparent'} />
              {pv[i] > 0 && <rect x={cx - bw - 1} y={y(pv[i])} width={bw} height={BASE - y(pv[i])} rx="3" fill={C.prima} />}
              {vals[i] > 0 && <rect x={cx + 1} y={y(vals[i])} width={bw} height={BASE - y(vals[i])} rx="3" fill={C.ink} />}
              <text x={cx} y={H - 8} textAnchor="middle" fontSize="11" fill={attivo ? C.ink : C.muted} fontWeight={attivo ? 600 : 400}>{nome}</text>
            </g>
          )
        })}
        <line x1={SX} x2={W - 8} y1={BASE} y2={BASE} stroke="#CFCFCC" />
        {lineaCosti && <polyline points={lineaCosti} fill="none" stroke={C.costi} strokeWidth="2" strokeDasharray="6 4" strokeLinejoin="round" />}
        {costi.map((v, i) => i < mesiFatti && v > 0 && (
          <circle key={i} cx={SX + passo * i + passo / 2} cy={y(v)} r="3.5" fill={C.costi} stroke="#fff" strokeWidth="1.5" />
        ))}
      </svg>
      {/* dettaglio del mese toccato */}
      <div className="mt-2 rounded-xl bg-steelex-muted px-3 py-2.5 grid grid-cols-2 sm:grid-cols-5 gap-2 text-sm">
        <div className="col-span-2 sm:col-span-1 font-semibold capitalize">{MESI_LUNGHI[m]}</div>
        <Det t="Acquisito" v={eur(vals[m])} s={a.mesi.cantieri_acquisiti[m] ? `${a.mesi.cantieri_acquisiti[m]} cantieri` : null} />
        <Det t="Costi" v={eur(costi[m])} s={`di cui manodopera ${eurK(a.mesi.costi_manodopera[m])}`} />
        <Det t="Ore" v={num(a.mesi.ore[m])} s={a.mesi.chiusi[m] ? `${a.mesi.chiusi[m]} cantieri chiusi` : null} />
        <Det t={`Acquisito ${a.anno - 1}`} v={eur(pv[m])} />
      </div>
    </div>
  )
}

function Det({ t, v, s }) {
  return (
    <div>
      <p className="text-[11px] text-steelex-muted-fg">{t}</p>
      <p className="font-mono tabular-nums">{v}</p>
      {s && <p className="text-[11px] text-steelex-muted-fg">{s}</p>}
    </div>
  )
}

function OreMensili({ ore, prima, mesiFatti }) {
  const max = Math.max(1, ...ore, ...prima)
  return (
    <div className="grid grid-cols-12 gap-1.5 items-end h-36 pt-2">
      {MESI.map((m, i) => (
        <div key={m} className="flex flex-col items-center gap-1 h-full justify-end" title={`${m}: ${num(ore[i])} ore`}>
          <span className="text-[10px] font-mono text-steelex-muted-fg">{ore[i] ? num(ore[i]) : ''}</span>
          <div className="w-full relative flex-1 flex items-end">
            {prima[i] > 0 && <div className="absolute inset-x-0 bottom-0 rounded-t border-t-2 border-dashed" style={{ height: `${(prima[i] / max) * 100}%`, borderColor: C.prima }} />}
            <div className="w-full rounded-t" style={{ height: `${(ore[i] / max) * 100}%`, background: i < mesiFatti ? C.ink : C.prima, opacity: ore[i] ? 1 : 0 }} />
          </div>
          <span className="text-[10px] text-steelex-muted-fg">{m[0]}</span>
        </div>
      ))}
    </div>
  )
}
