import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'
import tailwindcss from '@tailwindcss/vite'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'


const __dirname = dirname(fileURLToPath(import.meta.url))
export default defineConfig({
  plugins: [solid(), tailwindcss()],
  build: {
    outDir: '../assets',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        upload: resolve(__dirname, 'upload/index.html'),
        admin: resolve(__dirname, 'admin/index.html'),
      },
    },
  },
})
