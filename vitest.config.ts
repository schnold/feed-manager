import { defineConfig } from 'vitest/config'
import { vitePlugin as remix } from '@remix-run/dev'

export default defineConfig({
  plugins: [
    remix({
      ssr: true, // Enable SSR to test server-side modules
    }),
  ],
  test: {
    globals: true,
    environment: 'node', // Use node environment for server-side tests
    setupFiles: ['./test-setup.ts'],
  },
})