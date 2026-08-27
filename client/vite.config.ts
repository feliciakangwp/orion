import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Served from https://<user>.github.io/orion/ as a GitHub Pages project site.
export default defineConfig({
  base: '/orion/',
  plugins: [react(), tailwindcss()],
})
