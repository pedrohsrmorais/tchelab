import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
      <Toaster
        position="top-right"
        toastOptions={{
          style: { background: '#1e3a8a', color: '#fff', border: '1px solid rgba(59,130,246,0.3)', borderRadius: '12px' },
          success: { iconTheme: { primary: '#6ee7b7', secondary: '#1e3a8a' } },
          error:   { iconTheme: { primary: '#fca5a5', secondary: '#1e3a8a' } },
        }}
      />
    </BrowserRouter>
  </React.StrictMode>
)
