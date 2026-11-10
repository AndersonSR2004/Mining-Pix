import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import AdminAuthGate from './AdminAuthGate'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AdminAuthGate />
  </StrictMode>,
)
