import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// 默认代理到 3001。本机 3000/3001 被其他项目占用时，可用
// TCM_WEB_PORT / TCM_API_PROXY 临时改端口，避免引入 @types/node。
const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const API = env.TCM_API_PROXY ?? 'http://localhost:3001';
const port = Number(env.TCM_WEB_PORT ?? 3000);

export default defineConfig({
  plugins: [react()],
  server: {
    port,
    strictPort: Boolean(env.TCM_WEB_PORT),
    proxy: {
      '/api': { target: API, changeOrigin: true },
      '/health': { target: API, changeOrigin: true },
    },
  },
  build: { outDir: 'dist', sourcemap: true },
});
