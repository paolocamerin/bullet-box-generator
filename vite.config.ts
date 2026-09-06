import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  // GitHub Pages project sites are served from /<repo-name>/, so asset URLs
  // need that prefix baked in at build time. Only applied to the production
  // build — applying it to `dev` too makes the dev server 404 at `/`,
  // requiring the awkward http://localhost:5173/box-generator/ instead.
  base: command === 'build' ? '/box-generator/' : '/',
  plugins: [react()],
}))
