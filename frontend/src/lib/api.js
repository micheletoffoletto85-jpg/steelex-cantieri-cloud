import axios from 'axios'

const api = axios.create({
  baseURL: '/api/v1',
  timeout: 12000,
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

let _refreshPromise = null

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config
    // Logga errori significativi (non i 401 che gestiamo sotto, non i log stessi)
    const sc = err.response?.status
    if (sc && sc !== 401 && !original._skipLog && !original.url?.includes('/error-log')) {
      try {
        api.post('/error-log', {
          endpoint: original.url,
          metodo: original.method?.toUpperCase(),
          status_code: sc,
          messaggio: err.response?.data?.detail || err.message,
          url_pagina: window.location.pathname,
          dettagli: JSON.stringify(err.response?.data).slice(0, 500),
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
