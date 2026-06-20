import { defineConfig } from 'vite';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env from the project root (one level up from client/)
config({ path: resolve(__dirname, '..', '.env') });

export default defineConfig({
  envDir: resolve(__dirname, '..'),
  define: {
    'import.meta.env.VITE_DISCORD_CLIENT_ID': JSON.stringify(process.env.DISCORD_CLIENT_ID || ''),
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: true,
      },
    },
  },
  build: {
    outDir: '../server/public',
    emptyOutDir: true,
  },
});
