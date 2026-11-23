import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// GitHub Pages can't send security headers, so the production build carries a CSP in a <meta> tag instead.
// Dev is left alone: Vite's hot reload needs inline scripts and a websocket that this policy would block.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self' https://api.sleeper.app",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

const cspMeta = (): Plugin => ({
  name: 'csp-meta',
  apply: 'build',
  transformIndexHtml: () => [
    { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' },
  ],
})

export default defineConfig({
  // Relative paths, so the same build works at a GitHub Pages subpath or a custom domain.
  base: './',
  plugins: [react(), tailwindcss(), cspMeta()],
})
