import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 5173,
  },
  build: {
    // Built straight into the backend's public/ folder so one Express
    // process can serve both the API and the compiled frontend — no
    // second Railway service, no separate root directory to configure.
    outDir: '../backend/public',
    emptyOutDir: true,
  },
})
