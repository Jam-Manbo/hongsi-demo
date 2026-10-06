import { mockFetch, fileSource } from './transport';
import { demoFile } from './api';
import { auth } from './storage';
import { LIVE_SITE } from './links';
import { installUploadMock } from './xhr';

export function installBrowserMocks(showGuide: () => void) {
  Object.defineProperty(window, 'fetch', { value: mockFetch, configurable: false, writable: false });
  const permissionKey = 'hongsi-demo:notification-permission';
  class DemoNotification extends EventTarget {
    static get permission() { return localStorage.getItem(permissionKey) === 'granted' ? 'granted' : 'default'; }
    static async requestPermission() { localStorage.setItem(permissionKey, 'granted'); return 'granted'; }
    onclick: (() => void) | null = null;
    constructor(public title: string, public options?: NotificationOptions) { super(); }
    close() {}
  }
  Object.defineProperty(window, 'Notification', { value: DemoNotification });
  const subscription = { toJSON: () => ({ endpoint: 'https://hongsi-demo.invalid/push', keys: { p256dh: 'demo', auth: 'demo' } }), unsubscribe: async () => true };
  const registration = { pushManager: { getSubscription: async () => subscription, subscribe: async () => subscription }, showNotification: async () => {}, getNotifications: async () => [], unregister: async () => true };
  const serviceWorker = Object.assign(new EventTarget(), { register: async () => registration, ready: Promise.resolve(registration), getRegistration: async () => registration, getRegistrations: async () => [] });
  Object.defineProperty(navigator, 'serviceWorker', { value: serviceWorker });
  Object.defineProperty(window, 'PushManager', { value: class {} });
  Object.defineProperty(navigator, 'geolocation', { value: {
    getCurrentPosition(success: PositionCallback) { setTimeout(() => success({ timestamp: Date.now(), coords: { latitude: 0, longitude: 0, accuracy: 0, altitude: null, altitudeAccuracy: null, heading: null, speed: null } } as GeolocationPosition), 80); },
    watchPosition() { return 0; }, clearWatch() {},
  } });
  Object.defineProperty(navigator, 'sendBeacon', { value: () => false });
  installUploadMock();
  const open = window.open.bind(window);
  const allowedExternal = (url: URL) => url.protocol === 'https:' && ['github.com', 'ko-fi.com', 'developer.apple.com', new URL(LIVE_SITE).hostname].includes(url.hostname);
  function file(path: string) {
    const source = fileSource(path);
    if (!source) return false;
    if (!auth()) { showGuide(); return true; }
    const blob = URL.createObjectURL(demoFile(source));
    open(blob, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(blob), 60_000);
    return true;
  }
  window.open = (raw, target, features) => {
    if (!raw) return null;
    const url = new URL(String(raw), location.href);
    if (url.origin === location.origin && file(url.pathname)) return null;
    if (url.protocol === 'blob:' || allowedExternal(url)) return open(String(raw), target, features);
    showGuide();
    return null;
  };
  window.addEventListener('click', event => {
    if (event.defaultPrevented || !(event.target instanceof Element)) return;
    const anchor = event.target.closest('a[href]');
    if (!anchor) return;
    const url = new URL(anchor.getAttribute('href')!, location.href);
    if (url.protocol === 'blob:' || allowedExternal(url)) return;
    if (url.origin === location.origin && !/^\/(api|mod|course|login)\//.test(url.pathname)) return;
    event.preventDefault();
    if (url.origin === location.origin && file(url.pathname)) return;
    showGuide();
  });
}
