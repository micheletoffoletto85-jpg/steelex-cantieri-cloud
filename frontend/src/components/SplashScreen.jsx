import { useEffect, useState } from 'react'

export default function SplashScreen({ onDone }) {
  const [fase, setFase] = useState(0)
  // fase 0: logo appare, fase 1: nome scorre, fase 2: fade out

  useEffect(() => {
    const t1 = setTimeout(() => setFase(1), 400)
    const t2 = setTimeout(() => setFase(2), 1800)
    const t3 = setTimeout(() => onDone(), 2400)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [onDone])

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
    </div>
  )
}
