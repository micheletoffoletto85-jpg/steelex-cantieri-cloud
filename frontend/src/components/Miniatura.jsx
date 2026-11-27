import { useState } from 'react'

// Miniatura compressa (~30 KB) generata dal server per le foto su R2: le liste
// caricano questa, l'originale si scarica solo aprendo la foto a schermo intero.
// Le foto locali (/uploads, con login) e i blob restano come sono.
export const urlMiniatura = url =>
  url && /^https?:\/\//.test(url) ? `/api/v1/files/anteprima?u=${encodeURIComponent(url)}` : url

export default function Miniatura({ url, className = '', alt = '', ...props }) {
  // Se la miniatura non arriva (server giù, foto strana) ripiega sull'originale
  const [ripiego, setRipiego] = useState(false)
  if (!url) return null
  return (
    <img src={ripiego ? url : urlMiniatura(url)} alt={alt} className={className}
      loading="lazy" decoding="async" onError={() => !ripiego && setRipiego(true)} {...props} />
  )
}
