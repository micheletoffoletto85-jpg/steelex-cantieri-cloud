import { useEffect, useState } from 'react'

export default function SplashScreen({ onDone, utente }) {
  const [fase, setFase] = useState(0)
  const isCliente = utente?.ruolo === 'cliente'

  // Durata un po' più lunga per i clienti (più d'impatto)
  useEffect(() => {
    if (isCliente) {
      // fase 0→logo, 1→nome+linea, 2→partnership, 3→fade out
      const t1 = setTimeout(() => setFase(1), 400)   // logo appare subito
      const t2 = setTimeout(() => setFase(2), 1400)  // partnership entra
      const t3 = setTimeout(() => setFase(3), 3800)  // pausa lunga — leggi tutto
      const t4 = setTimeout(() => onDone(), 4600)    // fade out + entra
      return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4) }
    } else {
      // fase 0→logo, 1→testo+partnership, 2→fade out
      const t1 = setTimeout(() => setFase(1), 400)   // testo + partnership entrano
      const t2 = setTimeout(() => setFase(2), 3500)  // pausa — leggi tutto
      const t3 = setTimeout(() => onDone(), 4300)    // fade out + entra
      return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
    }
  }, [onDone, isCliente])

  if (isCliente) {
    // ── Splash CLIENTE — caldo, personalizzato ──────────────────────────────
    return (
      <div className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-steelex-dark transition-opacity duration-600 ${fase === 3 ? 'opacity-0' : 'opacity-100'}`}>
        {/* Logo */}
        <div className={`transition-all duration-500 ${fase >= 0 ? 'opacity-100 scale-100' : 'opacity-0 scale-75'}`}>
          <img src="/logo-steelex.png" alt="Steelex" className="h-14 mb-8" />
        </div>

        {/* Benvenuto */}
        <div className="overflow-hidden">
          <div className={`transition-all duration-700 ease-out text-center ${fase >= 1 ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'}`}>
            <p className="text-gray-400 text-sm tracking-widest uppercase mb-2">Bentornato</p>
            <p className="text-3xl font-bold text-white">{utente?.nome || 'Cliente'}</p>
          </div>
        </div>

        {/* Linea arancione */}
        <div className="mt-6 h-0.5 bg-steelex-orange transition-all duration-700 ease-out"
          style={{ width: fase >= 1 ? '200px' : '0px' }} />

        {/* Sottotitolo */}
        <div className="overflow-hidden h-6 mt-3">
          <div className={`transition-all duration-500 delay-200 text-center ${fase >= 1 ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'}`}>
            <span className="text-xs tracking-[0.25em] text-gray-400 uppercase">Il tuo cantiere ti aspetta</span>
          </div>
        </div>

        {/* Partnership — appare in fase 2 */}
        <div className={`absolute bottom-10 left-0 right-0 flex flex-col items-center gap-3 transition-all duration-700 ${fase >= 2 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <p className="text-[10px] tracking-[0.3em] text-gray-600 uppercase">Un progetto</p>
          <div className="flex items-center gap-6">
            <span className="text-xs font-semibold text-gray-400 tracking-wider">GeoColors</span>
            <span className="text-gray-700">·</span>
            <span className="text-xs font-semibold text-gray-400 tracking-wider">GeoBuildings</span>
            <span className="text-gray-700">·</span>
            <span className="text-xs font-semibold text-gray-400 tracking-wider">Fontana Raffaele</span>
          </div>
        </div>
      </div>
    )
  }

  // ── Splash STANDARD (admin / staff) ─────────────────────────────────────────
  return (
    <div className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-steelex-dark transition-opacity duration-500 ${fase === 2 ? 'opacity-0' : 'opacity-100'}`}>
      {/* Logo */}
      <div className={`transition-all duration-500 ${fase >= 0 ? 'opacity-100 scale-100' : 'opacity-0 scale-75'}`}>
        <img src="/logo-steelex.png" alt="Steelex" className="h-16 mb-6" />
      </div>

      {/* Nome che scorre dal basso */}
      <div className="overflow-hidden h-10">
        <div className={`transition-all duration-700 ease-out ${fase >= 1 ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'}`}>
          <span className="text-3xl font-bold tracking-widest text-white uppercase">Cantieri</span>
        </div>
      </div>

      {/* Linea arancione che si espande */}
      <div className="mt-6 h-0.5 bg-steelex-orange transition-all duration-700 ease-out"
        style={{ width: fase >= 1 ? '160px' : '0px' }} />

      {/* Tagline */}
      <div className="overflow-hidden h-6 mt-3">
        <div className={`transition-all duration-500 delay-300 ${fase >= 1 ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'}`}>
          <span className="text-xs tracking-[0.3em] text-gray-400 uppercase">Gestione cantieri</span>
        </div>
      </div>

      {/* Partnership — appare insieme alla tagline */}
      <div className={`absolute bottom-10 left-0 right-0 flex flex-col items-center gap-3 transition-all duration-700 delay-500 ${fase >= 1 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        <p className="text-[10px] tracking-[0.3em] text-gray-600 uppercase">Un progetto</p>
        <div className="flex items-center gap-6">
          <span className="text-xs font-semibold text-gray-500 tracking-wider">GeoColors</span>
          <span className="text-gray-700">·</span>
          <span className="text-xs font-semibold text-gray-500 tracking-wider">GeoBuildings</span>
          <span className="text-gray-700">·</span>
          <span className="text-xs font-semibold text-gray-500 tracking-wider">Fontana Raffaele</span>
        </div>
      </div>
    </div>
  )
}
