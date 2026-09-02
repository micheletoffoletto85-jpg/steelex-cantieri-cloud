import axios from 'axios'

const api = axios.create({
  baseURL: '/api/v1',
  // Il backend attende fino a pool_timeout=20s per una connessione DB libera (vedi
  // backend/app/database.py): un timeout client più corto (12s) fa scadere la richiesta
  // lato utente PRIMA che il server finisca di aspettare, causando falsi "Timeout client"
  // ogni volta che più richieste GET partono in parallelo (es. tab Economia).
  timeout: 25000,
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  // Upload file (foto, PDF, DXF): sulla rete di cantiere 12s spesso non bastano
  if (config.headers['Content-Type'] === 'multipart/form-data') config.timeout = 60000
  return config
})

let _refreshPromise = null

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config
    // Logga errori significativi (non i 401 che gestiamo sotto, non i log stessi).
    // Anche timeout ed errori di rete (senza response) — altrimenti restano invisibili.
    const sc = err.response?.status
    const isTimeout = err.code === 'ECONNABORTED'
    const isNetErr = !err.response && (isTimeout || err.code === 'ERR_NETWORK' || err.message === 'Network Error')
    if (((sc && sc !== 401) || isNetErr) && !original?._skipLog && !original?.url?.includes('/error-log')) {
      try {
        api.post('/error-log', {
          endpoint: original.url,
          metodo: original.method?.toUpperCase(),
          status_code: sc ?? null,
          messaggio: err.response?.data?.detail
            || (isTimeout ? `Timeout client dopo ${original?.timeout}ms` : err.message),
          url_pagina: window.location.pathname,
          dettagli: err.response
            ? JSON.stringify(err.response.data).slice(0, 500)
            : JSON.stringify({ code: err.code, message: err.message }).slice(0, 500),
        }, { _skipLog: true }).catch(() => {})
      } catch {}
    }
    if (err.response?.status === 401 && !original._retry) {
      original._retry = true
      const refreshToken = localStorage.getItem('refresh_token')
      if (refreshToken) {
        try {
          // Una sola richiesta di refresh anche se ci sono chiamate parallele
          if (!_refreshPromise) {
            _refreshPromise = axios.post('/api/v1/auth/refresh', null, {
              headers: { Authorization: `Bearer ${refreshToken}` },
            }).finally(() => { _refreshPromise = null })
          }
          const r = await _refreshPromise
          const newToken = r.data.access_token
          localStorage.setItem('token', newToken)
          original.headers.Authorization = `Bearer ${newToken}`
          return api(original)
        } catch {
          // Refresh scaduto → logout
        }
      }
      localStorage.removeItem('token')
      localStorage.removeItem('refresh_token')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api
