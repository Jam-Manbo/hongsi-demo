import { seed, type DemoData } from './data';
import { ApiError } from './errors';
const DATA = 'hongsi-demo:data:v3';
const AUTH = 'hongsi-demo:auth';
const CACHE_REVISION = 'hongsi-demo:response-cache-revision';
const HOUR = 3_600_000;
const hour = () => Math.floor(Date.now() / HOUR);
const revision = () => `6:${hour()}`;
let memory: DemoData | null = null;
let memoryAuth: { remembered: boolean } | null = null;
function read(storage: Storage, key: string) { try { return JSON.parse(storage.getItem(key) ?? 'null'); } catch { return null; } }
function clearRecords(keepAuth: boolean) {
  memory = null;
  if (!keepAuth) memoryAuth = null;
  for (const storage of [localStorage, sessionStorage]) {
    try {
      for (const key of Object.keys(storage)) {
        if (keepAuth && key === AUTH) continue;
        if (key.startsWith('hongsi-demo:') || key.startsWith('hc:')) storage.removeItem(key);
      }
    } catch { }
  }
}
function refreshResponseCache() {
  try {
    if (localStorage.getItem(CACHE_REVISION) === revision()) return;
    clearRecords(true);
    localStorage.setItem(CACHE_REVISION, revision());
  } catch { }
}
export function data() {
  refreshResponseCache();
  if (memory?.hour === hour()) return memory;
  const saved = read(localStorage, DATA);
  memory = saved?.version === 3 && saved.hour === hour() && Array.isArray(saved.calendar?.items) && Array.isArray(saved.todos) && Array.isArray(saved.attendance) && Array.isArray(saved.receipts) && saved.preferences && saved.jobs ? saved : seed();
  for (const item of memory!.calendar.items) item.alertLeads ??= null;
  for (const todo of memory!.todos) todo.alertLeads ??= null;
  return memory!;
}
export function persist() {
  try { localStorage.setItem(DATA, JSON.stringify(data())); }
  catch { throw new ApiError(400, 'storage', '체험 내용을 저장할 공간이 부족해요. 데모를 초기화해 주세요.'); }
}
export function auth() { return memoryAuth ?? read(sessionStorage, AUTH) ?? read(localStorage, AUTH); }
export function login(remembered: boolean) {
  logout(); memoryAuth = { remembered };
  try { (remembered ? localStorage : sessionStorage).setItem(AUTH, JSON.stringify(memoryAuth)); } catch { }
}
export function logout() {
  memoryAuth = null;
  try { sessionStorage.removeItem(AUTH); localStorage.removeItem(AUTH); } catch { }
}
export function resetDemo() {
  clearRecords(false);
  location.replace('/');
}
export function startHourlyReset() {
  const openedHour = hour();
  let timer = 0;
  let reloading = false;
  const refresh = () => {
    if (reloading) return;
    window.clearTimeout(timer);
    if (hour() !== openedHour) {
      reloading = true;
      refreshResponseCache();
      location.reload();
      return;
    }
    timer = window.setTimeout(refresh, (openedHour + 1) * HOUR - Date.now() + 10);
  };
  window.addEventListener('focus', refresh);
  window.addEventListener('pageshow', refresh);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });
  window.addEventListener('storage', event => {
    if (event.key === CACHE_REVISION && event.newValue && event.newValue !== `6:${openedHour}`) refresh();
  });
  refresh();
}
