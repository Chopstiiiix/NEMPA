import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { host: true, port: 5173 },
  resolve: {
    alias: {
      // Push is native-only; stub the Firebase web SDK peer so the web build
      // doesn't need the heavy `firebase` package. See src/shims/.
      'firebase/messaging': fileURLToPath(new URL('./src/shims/firebase-messaging.ts', import.meta.url)),
    },
  },
});
