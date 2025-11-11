import { defineConfig } from 'vitest/config'
import { vitePlugin as remix } from '@remix-run/dev'

export default defineConfig({
  plugins: [
    remix({
      ssr: false,
    }),
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./test-setup.ts'],
  },
})