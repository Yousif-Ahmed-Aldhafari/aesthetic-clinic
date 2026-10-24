import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// Same-origin browser requests keep the HttpOnly session scoped to this frontend host.
const proxy = { '/api/v1': { target: 'http://127.0.0.1:3000', changeOrigin: false } };
export default defineConfig({ plugins: [react()], server: { proxy }, preview: { proxy } });
