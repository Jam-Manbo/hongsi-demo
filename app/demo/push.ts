import { ApiError } from './errors';
import { seconds } from './data';

type Device = { consented: boolean; registered: boolean; classroomAlerts: boolean; classroomEpoch: string; expiresAt: number };
const key = 'hongsi-demo:push';
function devices(): Record<string, Device> {
  try { return JSON.parse(localStorage.getItem(key) ?? '{}'); } catch { return {}; }
}
export function pushRequest(method: string, url: URL, body: Record<string, unknown>) {
  const all = devices();
  const id = String(body.deviceId ?? url.searchParams.get('device') ?? '');
  const current = all[id]?.expiresAt > seconds() ? all[id] : undefined;
  const save = () => localStorage.setItem(key, JSON.stringify(all));
  if (url.pathname === '/api/push/status' && method === 'GET') {
    return { registered: current?.registered ?? false, consented: current?.consented ?? false, classroomAlerts: current?.classroomAlerts ?? false,
      available: { web: true, fcm: false, apns: false }, publicKey: 'BA', expiresAt: current?.expiresAt ?? null,
      lastPollAt: current?.consented ? seconds() : null, scheduled: 0, nextAt: null, error: null, schoolError: null, pollMinutes: 5 };
  }
  if (url.pathname === '/api/push/device' && method === 'DELETE') {
    delete all[id]; save();
    return { ok: true };
  }
  if (url.pathname === '/api/background/session' && method === 'POST') {
    if (!id || body.consent !== true) throw new ApiError(400, 'invalid', '백그라운드 동기화에 동의해 주세요.');
    all[id] = { consented: true, registered: false, classroomAlerts: false, classroomEpoch: '', ...current, expiresAt: seconds() + 14 * 86400 };
    save(); return { expiresAt: all[id].expiresAt };
  }
  if (url.pathname === '/api/background/renew' && method === 'POST') {
    if (!current?.consented) throw new ApiError(409, 'background_required', '백그라운드 동기화를 켜 주세요.');
    current.expiresAt = seconds() + 14 * 86400;
    save(); return { expiresAt: current.expiresAt };
  }
  if ((url.pathname === '/api/push/device' && method === 'POST') || (url.pathname === '/api/push/preferences' && method === 'PUT')) {
    if (!current?.consented) throw new ApiError(409, 'background_required', '백그라운드 동기화를 켜 주세요.');
    current.registered = true;
    current.classroomAlerts = body.classroomAlerts === true;
    current.classroomEpoch = String(body.classroomEpoch ?? current.classroomEpoch);
    save(); return { ok: true, expiresAt: current.expiresAt };
  }
  throw new ApiError(404, 'demo_route', '이 기능은 데모에서 준비되지 않았어요.');
}
