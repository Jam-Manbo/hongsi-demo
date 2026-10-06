import { demoRequest, demoFile } from './api';
import { ApiError } from './errors';
import { auth } from './storage';
import { publicResponse } from './releases';
import type { FileSource } from '../src/lib/types';

export function fileSource(path: string): FileSource | null {
  let m = /^\/api\/files\/(\d+)\/(\d+)$/.exec(path);
  if (m) return { kind: 'assign', cmid: +m[1], index: +m[2] };
  m = /^\/api\/modules\/(\d+)\/files\/(\d+)$/.exec(path);
  if (m) return { kind: 'module', cmid: +m[1], index: +m[2] };
  m = /^\/api\/board\/(\d+)\/(\d+)\/files\/(\d+)$/.exec(path);
  if (m) return { kind: 'board', cmid: +m[1], bwid: +m[2], index: +m[3] };
  return null;
}
function formBody(form: FormData) {
  return { keep: form.getAll('keep').map(String), lateConfirmed: form.get('lateConfirmed') === '1', acceptStatement: form.get('acceptStatement') === '1',
    files: form.getAll('file').filter((v): v is File => v instanceof File).map(file => ({ name: file.name, size: file.size, mime: file.type })) };
}
export const mockFetch: typeof fetch = async (input, init) => {
  const raw = input instanceof Request ? input.url : String(input);
  const url = new URL(raw, location.href);
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
  const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
  signal?.throwIfAborted();
  try {
    if (url.origin !== location.origin || !url.pathname.startsWith('/api/')) throw new ApiError(403, 'demo_network_blocked', '데모에서는 외부 서버에 연결하지 않아요.');
    if (method === 'GET') { const response = publicResponse(url.pathname); if (response) return response; }
    const source = fileSource(url.pathname);
    if (source && method === 'GET') {
      if (!auth()) throw new ApiError(401, 'login_required', '데모에 로그인해 주세요.');
      return new Response(demoFile(source), { headers: { 'Content-Type': 'text/plain;charset=utf-8' } });
    }
    let body: unknown = undefined;
    if (init?.body instanceof FormData) body = formBody(init.body);
    else if (typeof init?.body === 'string') body = JSON.parse(init.body);
    else if (input instanceof Request && method !== 'GET' && method !== 'HEAD') {
      const request = input.clone();
      body = request.headers.get('content-type')?.includes('multipart/form-data') ? formBody(await request.formData()) : await request.json();
    } else if (init?.body != null) throw new ApiError(400, 'demo_body', '데모가 지원하지 않는 요청 형식이에요.');
    const result = await demoRequest(method, `${url.pathname}${url.search}`, body);
    signal?.throwIfAborted();
    if (url.pathname === '/api/auth/login') window.dispatchEvent(new Event('hongsi-demo-login'));
    return Response.json(result);
  } catch (error) {
    if (signal?.aborted) throw error;
    const known = error instanceof ApiError;
    return Response.json({ error: { code: known ? error.code : 'demo_error', message: known ? error.message : '데모 요청을 처리하지 못했어요.' } }, { status: known ? error.status : 400 });
  }
};
