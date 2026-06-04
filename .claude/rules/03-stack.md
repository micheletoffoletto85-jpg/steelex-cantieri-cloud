# Stack e Coding

## Backend
- Python 3.11+ con FastAPI
- PostgreSQL con SQLAlchemy + Alembic
- Autenticazione JWT
- Upload file: PDF, DXF, immagini (max 50MB)

## Frontend
- React 18 + TailwindCSS
- Mobile-first (smartphone di cantiere)
- Bottoni grandi, UI semplice
- Colori STEELEX (#FF6B00)

## Deploy (Railway.app)
- Backend: servizio Python su Railway
- Database: PostgreSQL plugin Railway
- Frontend: React su Railway o Vercel (gratis)
- Variabili d'ambiente: sempre su Railway dashboard, mai hardcoded

## Regole codice
- Commenti in italiano
- Nessuna credenziale nel codice — solo variabili d'ambiente
- Un file .env.example con tutte le variabili necessarie (senza valori)
- Test base per ogni endpoint critico
