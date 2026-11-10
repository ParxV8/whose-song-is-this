import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const API = process.env.API_ORIGIN || 'http://127.0.0.1:3001';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Spotify only accepts loopback IPs (not "localhost") for http redirect URIs.
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': API,
      '/auth': API,
      '/socket.io': { target: API, ws: true },
    },
  },
});
