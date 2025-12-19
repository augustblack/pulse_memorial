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
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        upload: resolve(__dirname, 'upload/index.html'),
        admin: resolve(__dirname, 'admin/index.html'),
        editor: resolve(__dirname, 'editor/index.html'),
        mockup: resolve(__dirname, 'mockup/index.html'),
      },
    },
  },
})
