import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    watch: {
      // Rust compilation emits locked DLLs beneath the Vite project root.
      // Watching those generated files breaks `tauri dev` on Windows.
      ignored: ['**/src-tauri/target/**'],
    },
    // Allow any Host header so the app is reachable through public
    // Cloudflare quick tunnels (https://*.trycloudflare.com) - Vite 5.4+
    // otherwise returns 403 Blocked request.
    allowedHosts: true
  }
})
