import { ApiError } from './errors';
import { seconds } from './data';

type Device = { changeAlerts: boolean; expiresAt: number };
const key = 'hongsi-demo:push';
function devices(): Record<string, Device> {
  try { return JSON.parse(localStorage.getItem(key) ?? '{}'); } catch { return {}; }
}
export function pushRequest(method: string, url: URL, body: Record<string, unknown>) {
  const all = devices();
  const id = String(body.deviceId ?? url.searchParams.get('device') ?? '');
  const current = all[id];
  if (url.pathname === '/api/push/status' && method === 'GET') {
    const registered = !!current && current.expiresAt > seconds();
    return { registered, consented: registered, changeAlerts: current?.changeAlerts ?? true,
      available: { web: true, fcm: false, apns: false }, publicKey: 'BA', expiresAt: registered ? current.expiresAt : null,
      lastPollAt: null, scheduled: 0, nextAt: null, error: null, schoolError: null, pollMinutes: 15 };
  }
  if (url.pathname === '/api/push/device' && method === 'DELETE') {
    if (id === 'all') localStorage.removeItem(key);
    else { delete all[id]; localStorage.setItem(key, JSON.stringify(all)); }
    return { ok: true };
  }
  if ((url.pathname === '/api/push/device' || url.pathname === '/api/push/renew') && method === 'POST') {
    const expiresAt = seconds() + 14 * 86400;
    all[id] = { changeAlerts: typeof body.changeAlerts === 'boolean' ? body.changeAlerts : current?.changeAlerts ?? true, expiresAt };
    localStorage.setItem(key, JSON.stringify(all));
    return { expiresAt };
  }
  if (url.pathname === '/api/push/preferences' && method === 'PUT' && current) {
    current.changeAlerts = typeof body.changeAlerts === 'boolean' ? body.changeAlerts : current.changeAlerts;
    localStorage.setItem(key, JSON.stringify(all));
    return { ok: true };
  }
  throw new ApiError(404, 'demo_route', '이 기능은 데모에서 준비되지 않았어요.');
}
