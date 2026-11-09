import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import AdminAuthGate from './AdminAuthGate'
import '../index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AdminAuthGate />
  </StrictMode>,
)
