import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// GitHub Pages serves this project from the repository subpath.
export default defineConfig({
  base: '/Mining-Pix/',
  plugins: [react()],
})
