import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Security headers (CSP, HSTS, etc.) are set by Cloudflare from public/_headers.
export default defineConfig({
  // Relative paths, so the same build works at any host or subpath.
  base: './',
  plugins: [react(), tailwindcss()],
})
