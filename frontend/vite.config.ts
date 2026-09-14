import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 5173,
  },
    preview: {
    // Railway assigns a dynamic *.up.railway.app subdomain (and you may add
    // a custom domain later), so rather than hardcode one host we just
    // trust whatever host the request comes in on.
    host: true,
    allowedHosts: true,
  },
})
