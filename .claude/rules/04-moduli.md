# Moduli dell'App

## Fase 1 — Setup e Core (INIZIA DA QUI)
- Struttura progetto completa
- Backend FastAPI funzionante
- Database PostgreSQL collegato
- Deploy su Railway.app attivo
- Login/autenticazione utenti

## Fase 2 — Cantieri
- Dashboard cantieri
- Scheda cantiere (nome, cliente, indirizzo, stato, date)
- Diario giornaliero + foto
- Checklist attività
- Stato avanzamento %

## Fase 3 — Documenti
- Upload PDF e DXF
- Visualizzatore PDF nel browser
- Pin di localizzazione su piante (click = aggiungi nota)
- Versioning documenti

## Fase 4 — AI Multilingue
- Registrazione audio da smartphone
- Trascrizione automatica (Whisper)
- Traduzione in italiano (Claude API)
- Report PDF generato automaticamente

## Fase 5 — Modulo Economico
- Ordini di acquisto a fornitori
- Registro fatture fornitori (upload PDF)
- Fatture clienti (generate da SAL)
- Budget cantiere vs spesa reale
- Export Excel per commercialista

## Utenti
- Admin (Michele): accesso totale
- Capo cantiere: suoi cantieri
- Fornitore: upload documenti richiesti
- Cliente: stato avanzamento read-only

## UX Cantiere
- Funziona bene con guanti
- Bottoni grandi
- Massimo 3 click per azioni frequenti
- Funziona offline (PWA) con sync quando torna connessione
