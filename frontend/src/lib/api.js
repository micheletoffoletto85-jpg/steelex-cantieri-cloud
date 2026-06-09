import axios from 'axios'

const api = axios.create({
  baseURL: '/api/v1',
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
