import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// The browser talks to /n8n/... and Vite forwards it to your local n8n.
// This avoids CORS entirely. Change N8N_URL in .env if n8n runs elsewhere.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // n8n is started with N8N_LISTEN_ADDRESS=127.0.0.1. Use the IPv4
  // address explicitly because Node may resolve localhost to ::1 first.
  const target = env.N8N_URL || 'http://127.0.0.1:5678'
  const proxy = {
    '/n8n': {
      target,
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/n8n/, ''),
    },
  }
  return {
    plugins: [react()],
    server: { port: 5173, host: '127.0.0.1', proxy },
    preview: { port: 5173, host: '127.0.0.1', proxy },
  }
})
