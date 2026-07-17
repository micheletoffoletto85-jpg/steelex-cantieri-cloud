# Regola: Due App Separate — STEELEX e FR

## ⚠️ REGOLA FONDAMENTALE
Esistono DUE app distinte e completamente separate. Non mescolare mai codice, grafica o branding.

---

## APP 1 — STEELEX Cantieri
- **Repo locale**: `C:\steelex-cantieri-cloud`
- **GitHub**: `micheletoffoletto85-jpg/steelex-cantieri-cloud`
- **Deploy**: Railway (backend) + Vercel (frontend)
- **Brand**: arancione #FF6B00, logo STEELEX
- **Stato**: BLINDATA — non toccare salvo istruzione esplicita di Michele

## APP 2 — FR Cantieri (Fontana Raffaele)
- **Repo locale**: `C:\fontana-raffaele-cantieri`
- **GitHub**: `micheletoffoletto85-jpg/fontana-raffaele-cantieri`
- **Deploy**: Vercel → `fontana-raffaele-cantieri.vercel.app`
- **Brand**: charcoal #1C1C1C, logo FR ufficiale (PNG con doppia diagonale)
- **Backend**: `C:\fontana-raffaele-cantieri\backend` (stesso repo del frontend, deploy Railway)
  - ⚠️ `C:\fr-server` è una copia VECCHIA e abbandonata — NON toccarla

---

## Ordine di lavoro per ogni modifica funzionale
1. **Prima** implementa su STEELEX (`C:\steelex-cantieri-cloud`)
2. **Poi** porta la stessa modifica su FR (`C:\fontana-raffaele-cantieri`)
3. **Adatta** il branding: colori, loghi e stili FR sono diversi da STEELEX
4. **Mai** copiare file di grafica da un repo all'altro

## Deploy
- **STEELEX**: `git push` su `C:\steelex-cantieri-cloud` → Railway + Vercel auto-deploy
- **FR**: `git push` su `C:\fontana-raffaele-cantieri` → Vercel auto-deploy
  - Il commit author deve essere `micheletoffoletto85-jpg <michele.toffoletto85@gmail.com>`
  - Se bloccato: verificare `git config user.email` → deve essere `michele.toffoletto85@gmail.com`

## Differenze di branding (non mischiare mai)
| Elemento      | STEELEX              | FR Cantieri               |
|---------------|----------------------|---------------------------|
| Colore accent | #FF6B00 (arancione)  | #1C1C1C (charcoal)        |
| Logo          | logo-steelex.png     | logo_fr.png (PNG ufficiale, filter:invert su dark bg) |
| Nome app      | STEELEX Cantieri     | Fontana Raffaele Cantieri |
| Valori splash | "Gestione cantieri"  | "Fontana Raffaele S.R.L." |

## Cosa NON fare mai
- NON modificare STEELEX pensando di lavorare su FR (e viceversa)
- NON copiare logo o colori da un'app all'altra
- NON fare push su master di STEELEX senza istruzione esplicita
- NON mischiare le due sessioni di lavoro in un unico commit
