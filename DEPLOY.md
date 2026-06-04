# Deploy su Railway.app

## Procedura (una sola volta)

### 1. Crea account Railway
Vai su https://railway.app e registrati con GitHub.

### 2. Installa Railway CLI (opzionale ma comodo)
```
npm install -g @railway/cli
railway login
```

### 3. Crea il progetto su Railway
- Vai su https://railway.app/new
- Clicca "Deploy from GitHub repo"
- Collega questo repository

### 4. Aggiungi il database PostgreSQL
- Nella dashboard Railway → "New Service" → "Database" → "PostgreSQL"
- Railway crea automaticamente la variabile DATABASE_URL

### 5. Configura le variabili d'ambiente del backend
Nel servizio backend su Railway → "Variables":
```
DATABASE_URL=<copiata automaticamente da Railway>
SECRET_KEY=<genera: python -c "import secrets; print(secrets.token_hex(32))">
CORS_ORIGINS=https://tuo-frontend.railway.app
```

### 6. Configura il frontend
Nel servizio frontend su Railway → "Variables":
```
VITE_API_URL=https://tuo-backend.railway.app/api/v1
```

### 7. Primo admin
Dopo il deploy, chiama l'endpoint una sola volta:
```
POST https://tuo-backend.railway.app/api/v1/auth/registra
{
  "nome": "Michele",
  "cognome": "Fontana",
  "email": "michele@steelex.it",
  "password": "la-tua-password"
}
```
Dopo il primo utente, la registrazione pubblica è bloccata.

## Struttura servizi Railway
- `steelex-backend` — FastAPI (cartella /backend)
- `steelex-frontend` — React/Nginx (cartella /frontend)  
- `steelex-db` — PostgreSQL (gestito da Railway)
