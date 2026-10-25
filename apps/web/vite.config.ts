import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// 说明：这里不读 process.env，避免前端构建依赖 @types/node。
// 开发代理指向 NestJS 服务端默认端口 3001（与 .env.example 的 PORT 保持一致）。
const API = 'http://localhost:3001';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': { target: API, changeOrigin: true },
      '/health': { target: API, changeOrigin: true },
    },
  },
  build: { outDir: 'dist', sourcemap: true },
});
