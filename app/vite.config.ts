import { readFileSync } from 'node:fs';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };
const deployment = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')) as { headers: { headers: { key: string; value: string }[] }[] };

export default defineConfig({
  plugins: [{
    name: 'hongsi-demo-bootstrap',
    transformIndexHtml: { order: 'pre', handler(html) {
      if (!html.includes('src="/src/main.ts"')) throw new Error('원본의 시작 경로가 변경되었습니다. 데모 진입점을 확인해 주세요.');
      return html.replace('src="/src/main.ts"', 'src="/demo/bootstrap.ts"').replace('<title>홍시 · 홍익대 캠퍼스 도우미</title>', '<title>홍시 데모 · 체험하기</title>');
    } },
    configureServer(server) {
      server.middlewares.use('/api', (_req, res) => { res.statusCode = 404; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: { code: 'demo_only', message: '데모 API는 브라우저 안에서만 실행됩니다.' } })); });
    },
  }, svelte()],
  clearScreen: false,
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  server: { host: '127.0.0.1', port: 5174, strictPort: true },
  preview: { strictPort: true, headers: Object.fromEntries(deployment.headers[0].headers.map(h => [h.key, h.value])) },
  build: { target: 'es2022', outDir: 'dist' },
});
