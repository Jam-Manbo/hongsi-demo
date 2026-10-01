import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, rmSync, mkdtempSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifestPath = join(root, 'upstream.json');
const repository = 'https://github.com/Jam-Manbo/hongsi.git';
const branch = 'main';
const fixed = ['README.md', 'LICENSE', 'app/index.html', 'app/tsconfig.json', 'app/pnpm-lock.yaml'];
const trees = ['app/src', 'app/public'];
const owned = (path) => fixed.includes(path) || path === 'app/package.json' || trees.some(tree => path.startsWith(`${tree}/`));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const git = (cwd, ...args) => execFileSync('git', args, { cwd, maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
const write = (path, content) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), content); };
function walk(path) {
  return readdirSync(join(root, path), { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(`${path}/${entry.name}`) : [`${path}/${entry.name}`]);
}
function verify(manifest) {
  if (manifest.repository !== repository || manifest.branch !== branch || !/^[a-f0-9]{40}$/.test(manifest.commit)) throw new Error('upstream.json의 원본 정보가 올바르지 않습니다.');
  for (const [path, hash] of Object.entries(manifest.files)) {
    if (!owned(path) || path.includes('..') || digest(readFileSync(join(root, path))) !== hash) throw new Error(`원본 파일이 변경되었습니다: ${path}. 데모 코드는 app/demo에서 수정해 주세요.`);
  }
  for (const tree of trees) for (const path of walk(tree)) if (!(path in manifest.files)) throw new Error(`원본 폴더에 추가된 파일이 있습니다: ${path}`);
}
const previous = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : null;
if (process.argv.includes('--check')) {
  if (!previous) throw new Error('먼저 npm run sync를 실행해 주세요.');
  verify(previous);
  console.log(`원본 일치 확인: ${previous.commit}`);
} else {
  if (previous) verify(previous);
  const temp = mkdtempSync(join(tmpdir(), 'hongsi-upstream-'));
  try {
    git(temp, 'init', '--quiet');
    git(temp, 'fetch', '--quiet', '--depth=1', repository, `refs/heads/${branch}`);
    const commit = git(temp, 'rev-parse', 'FETCH_HEAD').toString().trim();
    if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('원본 커밋을 확인하지 못했습니다.');
    const entries = git(temp, 'ls-tree', '-rz', '--full-tree', commit, '--', ...fixed, ...trees, 'app/package.json').toString().split('\0').filter(Boolean);
    const files = new Map();
    for (const entry of entries) {
      const [meta, path] = entry.split('\t');
      if (!owned(path) || path.includes('..') || !/^100(644|755) blob /.test(meta)) throw new Error(`허용하지 않는 원본 파일: ${path}`);
      files.set(path, git(temp, 'show', `${commit}:${path}`));
    }
    for (const path of [...fixed, 'app/package.json', 'app/src/main.ts']) if (!files.has(path)) throw new Error(`필수 원본 파일 누락: ${path}`);
    if (!files.get('app/index.html').toString().includes('src="/src/main.ts"')) throw new Error('원본 시작 경로가 바뀌었습니다. 데모 진입점을 확인해 주세요.');
    const pkg = JSON.parse(files.get('app/package.json'));
    pkg.name = 'hongsi-demo-app';
    pkg.engines = { ...pkg.engines, node: '24.x' };
    pkg.scripts = { dev: 'vite --port 5174', check: 'svelte-check --tsconfig ./tsconfig.demo.json', build: 'vite build', preview: 'vite preview --host 127.0.0.1 --port 5274' };
    files.set('app/package.json', Buffer.from(`${JSON.stringify(pkg, null, 2)}\n`));
    for (const tree of trees) rmSync(join(root, tree), { recursive: true, force: true });
    for (const [path, bytes] of files) write(path, bytes);
    write('upstream.json', `${JSON.stringify({ repository, branch, commit, files: Object.fromEntries([...files].sort(([a], [b]) => a.localeCompare(b)).map(([path, bytes]) => [path, digest(bytes)])) }, null, 2)}\n`);
    console.log(`원본 동기화: ${commit} (${files.size}개 파일)`);
  } finally { rmSync(temp, { recursive: true, force: true }); }
}
