import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { appIdentityPlugin } from './scripts/app-identity.mjs'
export default defineConfig({
  plugins: [react(), appIdentityPlugin()],
  base: './',
  server: { open: false },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          scene: ['@react-three/fiber', '@react-three/drei'],
        },
      },
    },
  },
})
