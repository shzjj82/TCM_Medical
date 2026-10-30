import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// 默认把 /api 转到 nestjs 网关的 /medical。
// 本机 3000 常被其它项目占用，网关默认 3010，前端 5173。冲突时用 TCM_WEB_PORT / TCM_API_PROXY。
const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const API = env.TCM_API_PROXY ?? 'http://127.0.0.1:3010';
const port = Number(env.TCM_WEB_PORT ?? 5173);

function attachBizCode(proxy: { on: (event: string, fn: (proxyReq: { setHeader: (k: string, v: string) => void }) => void) => void }) {
  proxy.on('proxyReq', (proxyReq) => {
    proxyReq.setHeader('X-Biz-Code', 'medical');
  });
}

export default defineConfig({
  plugins: [react()],
  server: {
    port,
    strictPort: Boolean(env.TCM_WEB_PORT),
    proxy: {
      '/api': {
        target: API,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '/medical'),
        configure: attachBizCode,
      },
      '/health': {
        target: API,
        changeOrigin: true,
        rewrite: () => '/medical/health',
        configure: attachBizCode,
      },
    },
  },
  build: { outDir: 'dist', sourcemap: true },
});
