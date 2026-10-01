import { createHmac, timingSafeEqual } from 'node:crypto';

const reply = (status, message) => Response.json({ message }, { status, headers: { 'Cache-Control': 'no-store' } });
export default {
  async fetch(request) {
    if (request.method !== 'POST') return reply(405, 'POST required');
    const secret = process.env.UPSTREAM_WEBHOOK_SECRET;
    const token = process.env.GITHUB_DISPATCH_TOKEN;
    const repository = process.env.DEMO_REPOSITORY;
    if (!secret || !token || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? '')) return reply(503, 'Webhook is not configured');
    const signature = request.headers.get('x-hub-signature-256') ?? '';
    if (!/^sha256=[a-f0-9]{64}$/.test(signature)) return reply(401, 'Invalid signature');
    const reader = request.body?.getReader();
    if (!reader) return reply(400, 'Body required');
    const chunks = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 1024 * 1024) { await reader.cancel(); return reply(413, 'Payload too large'); }
        chunks.push(value);
      }
      const bytes = Buffer.concat(chunks);
      const expected = createHmac('sha256', secret).update(bytes).digest();
      if (!timingSafeEqual(expected, Buffer.from(signature.slice(7), 'hex'))) return reply(401, 'Invalid signature');
      const event = request.headers.get('x-github-event');
      if (event === 'ping') return reply(200, 'Webhook ready');
      const payload = JSON.parse(bytes.toString('utf8'));
      if (event !== 'push' || payload.repository?.full_name !== 'Jam-Manbo/hongsi' || payload.ref !== 'refs/heads/main' || payload.deleted) return reply(202, 'Event ignored');
      if (!/^[a-f0-9]{40}$/.test(payload.after ?? '')) return reply(400, 'Invalid commit');
      const response = await fetch(`https://api.github.com/repos/${repository}/dispatches`, {
        method: 'POST', signal: AbortSignal.timeout(10_000),
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28' },
        body: JSON.stringify({ event_type: 'upstream-main-push', client_payload: { upstreamSha: payload.after } }),
      });
      return response.ok ? reply(202, 'Demo sync requested') : reply(502, 'GitHub dispatch failed');
    } catch (error) { return reply(error instanceof SyntaxError ? 400 : 502, 'Webhook request failed'); }
  },
};
