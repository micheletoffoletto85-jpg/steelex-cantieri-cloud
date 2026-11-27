import { ChevronLeft, ChevronRight } from 'lucide-react'

export const PER_PAGINA = 10

// Barra pagine con bottoni grandi (si usa col telefono in cantiere)
export default function Paginazione({ pagina, totale, perPagina = PER_PAGINA, onCambia, caricando = false }) {
  const pagine = Math.max(1, Math.ceil((totale || 0) / perPagina))
  if (pagine <= 1) return null
  const vai = p => { onCambia(Math.min(Math.max(1, p), pagine)); window.scrollTo?.({ top: 0, behavior: 'smooth' }) }
  // al massimo 5 numeri attorno alla pagina corrente
  const da = Math.max(1, Math.min(pagina - 2, pagine - 4))
  const numeri = Array.from({ length: Math.min(5, pagine) }, (_, i) => da + i)
  return (
    <div className={`flex items-center justify-center gap-1.5 py-2 ${caricando ? 'opacity-60' : ''}`}>
      <button onClick={() => vai(pagina - 1)} disabled={pagina <= 1}
        className="w-11 h-11 rounded-xl bg-white border border-gray-200 flex items-center justify-center text-gray-600 disabled:opacity-30" aria-label="Pagina precedente">
        <ChevronLeft size={20} />
      </button>
      {numeri.map(n => (
        <button key={n} onClick={() => vai(n)}
          className={`min-w-[44px] h-11 px-2 rounded-xl text-sm font-semibold border ${n === pagina ? 'bg-steelex-orange text-white border-steelex-orange' : 'bg-white text-gray-700 border-gray-200'}`}>
          {n}
        </button>
      ))}
      <button onClick={() => vai(pagina + 1)} disabled={pagina >= pagine}
        className="w-11 h-11 rounded-xl bg-white border border-gray-200 flex items-center justify-center text-gray-600 disabled:opacity-30" aria-label="Pagina successiva">
        <ChevronRight size={20} />
      </button>
      <span className="text-xs text-gray-400 ml-1">di {pagine}</span>
    </div>
  )
}
