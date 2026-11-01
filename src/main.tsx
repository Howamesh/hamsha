import './lib/authRedirect' // must run before @/data creates the Supabase client
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { installLatinDigits } from './lib/latinDigits'

installLatinDigits()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
