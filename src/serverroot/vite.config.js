import { defineConfig } from 'vite'
import wasm from 'vite-plugin-wasm'

export default defineConfig({
  base: './',
  plugins: [wasm()],
  define: {
    global: 'globalThis',
  },
  resolve: {
    alias: {
      '@': '/src',
    }
  },
  optimizeDeps: {
    include: ['matrix-js-sdk'],
    exclude: ['@matrix-org/matrix-sdk-crypto-wasm'],
  },
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://127.0.0.1:3491', changeOrigin: true } }
  }
})
