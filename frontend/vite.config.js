import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Em desenvolvimento, API e arquivos públicos (avatares) vêm do backend.
    proxy: {
      '/api': 'http://localhost:3003',
      '/storage': 'http://localhost:3003',
    },
  },
})
