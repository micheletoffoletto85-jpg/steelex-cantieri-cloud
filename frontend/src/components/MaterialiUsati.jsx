import { useState } from 'react'
import { Package, Euro, X } from 'lucide-react'
import toast from 'react-hot-toast'

/**
 * Elenco "Materiale usato" di un rapportino + registrazione diretta nelle Spese
 * del cantiere. Condiviso tra la card rapportino (RapportiniPage) e la sezione
 * diario del cantiere (CantierePage).
 *
 * props:
 *  - source: { id, materiali, materiale_extra, materiali_spese, cantiere_id }
 *            (id = id del rapportino; cantiere_id = cantiere collegato)
 *  - isAdmin: bool
 *  - onMaterialeSpesa: (rapportinoId, { materiale, importo, fornitore }) => Promise
 *  - titolo: intestazione (default "Materiale usato")
 */
export default function MaterialiUsati({ source, isAdmin, onMaterialeSpesa, titolo = 'Materiale usato' }) {
  const [openKey, setOpenKey] = useState(null)
  const [importo, setImporto] = useState('')
  const [fornitore, setFornitore] = useState('')
  const [saving, setSaving] = useState(false)

  const voci = [
    ...(source?.materiali || []).map((m, i) => ({ key: `m${i}`, testo: m })),
    ...(source?.materiale_extra ? [{ key: 'extra', testo: source.materiale_extra, extra: true }] : []),
  ]
  if (!voci.length) return null

  const spesati = source?.materiali_spese || []
  const giaSpesato = (testo) =>
    spesati.filter(s => (s.materiale || '').trim().toLowerCase() === (testo || '').trim().toLowerCase())

  const canAdd = isAdmin && !!source?.cantiere_id && !!source?.id && typeof onMaterialeSpesa === 'function'

  const apri = (key) => { setOpenKey(key); setImporto(''); setFornitore('') }

  const conferma = async (testo) => {
    const imp = parseFloat(String(importo).replace(',', '.'))
    if (Number.isNaN(imp) || imp < 0) { toast.error('Inserisci un importo'); return }
    setSaving(true)
    try {
      await onMaterialeSpesa(source.id, { materiale: testo, importo: imp, fornitore: fornitore.trim() || null })
      toast.success('Materiale aggiunto alle spese')
      setOpenKey(null)
    } catch {
      toast.error('Errore nel salvataggio')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-2">
      <p className="text-xs font-semibold text-gray-500 mb-1 flex items-center gap-1"><Package size={12} /> {titolo}</p>
      <div className="space-y-1">
        {voci.map(({ key, testo, extra }) => {
          const done = giaSpesato(testo)
          return (
            <div key={key}>
              <div className={`flex items-center justify-between gap-2 rounded px-2 py-1 text-xs ${extra ? 'bg-teal-50' : 'bg-gray-50'}`}>
                <span className={extra ? 'text-teal-800' : 'text-gray-700'}>
                  {extra && <span className="font-semibold">Extra: </span>}{testo}
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  {done.map((d, i) => (
                    <span key={i} className="text-green-700 bg-green-100 px-1.5 py-0.5 rounded font-semibold whitespace-nowrap">
                      ✓ € {Number(d.importo || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  ))}
                  {canAdd && (
                    <button onClick={() => openKey === key ? setOpenKey(null) : apri(key)}
                      className="flex items-center gap-1 text-steelex-orange hover:underline font-semibold whitespace-nowrap">
                      <Euro size={11} /> {done.length ? 'di nuovo' : 'in Spese'}
                    </button>
                  )}
                </div>
              </div>
              {canAdd && openKey === key && (
                <div className="flex items-center gap-1.5 mt-1 mb-1.5 pl-2 text-xs">
                  <div className="relative">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400">€</span>
                    <input autoFocus type="text" inputMode="decimal" value={importo}
                      onChange={e => setImporto(e.target.value)} placeholder="0,00"
                      onKeyDown={e => e.key === 'Enter' && conferma(testo)}
                      className="w-24 border border-gray-200 rounded pl-5 pr-2 py-1 focus:outline-none focus:ring-2 focus:ring-steelex-orange" />
                  </div>
                  <input type="text" value={fornitore} onChange={e => setFornitore(e.target.value)}
                    placeholder="fornitore (opz.)"
                    className="flex-1 min-w-0 border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-steelex-orange" />
                  <button disabled={saving} onClick={() => conferma(testo)}
                    className="px-2 py-1 bg-steelex-orange text-white rounded font-semibold hover:opacity-90 disabled:opacity-40">OK</button>
                  <button onClick={() => setOpenKey(null)} className="px-1.5 py-1 text-gray-400 hover:text-gray-600"><X size={13} /></button>
                </div>
              )}
            </div>
          )
        })}
      </div>
      {isAdmin && !source?.cantiere_id && (
        <p className="text-[10px] text-amber-600 mt-1">Assegna il rapportino a un cantiere per registrare i materiali nelle spese.</p>
      )}
    </div>
  )
}
