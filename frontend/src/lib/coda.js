// Esegue fn su ogni elemento con al massimo `limite` operazioni contemporanee.
// Serve per gli upload multipli: 50 foto spedite tutte insieme intasano la
// connessione del telefono e vanno tutte in timeout (log 16/11/2026).
// Ritorna i risultati nello stesso ordine degli elementi.
export async function inCoda(elementi, fn, limite = 3) {
  const lista = Array.from(elementi)
  const risultati = new Array(lista.length)
  let prossimo = 0
  const lavoratore = async () => {
    while (prossimo < lista.length) {
      const i = prossimo++
      risultati[i] = await fn(lista[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limite, lista.length) }, lavoratore))
  return risultati
}
