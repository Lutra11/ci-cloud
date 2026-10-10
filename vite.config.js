import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  base: './',
  server: {
    host: true, // 允许局域网访问，方便手机扫码打开输入页
    port: 5173
  }
})
