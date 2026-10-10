import axios from 'axios'

const BASE = import.meta.env.VITE_API_URL || '/api/v1'

const client = axios.create({ baseURL: BASE, timeout: 30000 })

// Attach token
client.interceptors.request.use(cfg => {
  const token = localStorage.getItem('tchelab_token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

// Handle 401 — try refresh
let refreshing = false
let queue = []

client.interceptors.response.use(
  r => r,
  async err => {
    const orig = err.config
    if (err.response?.status === 401 && !orig._retry) {
      orig._retry = true
      if (refreshing) {
        return new Promise((res, rej) => queue.push({ res, rej })).then(t => {
          orig.headers.Authorization = `Bearer ${t}`
          return client(orig)
        })
      }
      refreshing = true
      try {
        const refresh = localStorage.getItem('tchelab_refresh')
        const { data } = await axios.post(`${BASE}/auth/refresh`, { refresh_token: refresh })
        const newToken = data.data?.access_token
        localStorage.setItem('tchelab_token', newToken)
        queue.forEach(p => p.res(newToken))
        queue = []
        orig.headers.Authorization = `Bearer ${newToken}`
        return client(orig)
      } catch {
        queue.forEach(p => p.rej(err))
        queue = []
        localStorage.removeItem('tchelab_token')
        localStorage.removeItem('tchelab_refresh')
        // O ProtectedRoute (App.jsx) decide se mostra o Dashboard ou o Login
        // olhando o `token` persistido pelo Zustand em 'tchelab-auth' — uma
        // chave SEPARADA desta aqui. Sem limpar essa também, o reload abaixo
        // reidrata o Zustand com o token antigo (ainda "válido" pra ele),
        // o guard renderiza o Dashboard de novo, que chama fetchMe() de
        // novo, que 401 de novo, que tenta refresh de novo (sem token raw),
        // que 422 de novo... um loop de reload infinito, várias vezes por
        // segundo, que foi o que esgotou o rate limit em produção.
        localStorage.removeItem('tchelab-auth')
        window.location.href = '/login'
      } finally { refreshing = false }
    }
    return Promise.reject(err)
  }
)

export default client
