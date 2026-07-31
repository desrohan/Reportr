import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import webExtension from 'vite-plugin-web-extension'

export default defineConfig({
  // Wipe dist on every build so stale dev artifacts (e.g. @react-refresh.js from
  // a prior `vite dev`) never end up in a production zip uploaded to the store.
  build: {
    emptyOutDir: true,
  },
  plugins: [
    react(),
    webExtension({
      manifest: 'manifest.json',
      additionalInputs: ['src/offscreen/offscreen.html']
    })
  ],
})
