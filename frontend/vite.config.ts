import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    // The `@` alias lives in tsconfig.app.json `paths`; Vite reads it from there.
    tsconfigPaths: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:3000',
      '/share': 'http://127.0.0.1:3000',
    },
  },
})
