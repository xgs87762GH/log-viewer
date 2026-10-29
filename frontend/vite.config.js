import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'

export default defineConfig({
  plugins: [
    vue(),
    AutoImport({
      resolvers: [ElementPlusResolver()],
    }),
    Components({
      resolvers: [ElementPlusResolver()],
    }),
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8090',
        configure(proxy) {
          // 把浏览器真实 IP 传给后端（统计白名单 / 访问记录）
          proxy.on('proxyReq', (proxyReq, req) => {
            const addr = req.socket?.remoteAddress || ''
            const ip = addr.startsWith('::ffff:') ? addr.slice(7) : addr
            if (ip) proxyReq.setHeader('X-Forwarded-For', ip)
          })
        },
      },
      '/config': 'http://localhost:8090',
    },
  },
})
