import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages project sites are served from /<repo-name>/, so asset URLs
  // need that prefix baked in at build time.
  base: '/box-generator/',
  plugins: [react()],
})
