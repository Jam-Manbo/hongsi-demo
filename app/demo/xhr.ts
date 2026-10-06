import { mockFetch } from './transport';

export function installUploadMock() {
  class DemoUpload extends EventTarget {
    onprogress: ((event: ProgressEvent) => void) | null = null;
    progress(loaded: number, total: number) {
      const event = new ProgressEvent('progress', { lengthComputable: true, loaded, total });
      this.onprogress?.(event);
      this.dispatchEvent(event);
    }
  }
  class DemoXMLHttpRequest extends EventTarget {
    status = 0;
    response: unknown = null;
    responseType = '';
    timeout = 0;
    readyState = 0;
    upload = new DemoUpload();
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    ontimeout: (() => void) | null = null;
    onabort: (() => void) | null = null;
    private url = '';
    private controller: AbortController | null = null;
    open(method: string, raw: string) {
      const url = new URL(raw, location.href);
      if (method.toUpperCase() !== 'POST' || url.origin !== location.origin || !/^\/api\/assign\/\d+\/submission\/jobs\/[a-f0-9]{32}$/i.test(url.pathname)) {
        throw new Error('데모에서는 이 요청을 지원하지 않아요.');
      }
      this.url = url.href;
      this.readyState = 1;
    }
    getResponseHeader(name: string) { return name.toLowerCase() === 'content-type' ? 'application/json' : null; }
    send(body: FormData) {
      if (this.readyState !== 1 || !(body instanceof FormData)) throw new Error('제출할 파일을 확인해 주세요.');
      const controller = new AbortController();
      this.controller = controller;
      const total = body.getAll('file').reduce((sum, file) => sum + (file instanceof File ? file.size : 0), 0);
      this.upload.progress(0, total);
      void mockFetch(this.url, { method: 'POST', body, signal: controller.signal }).then(async response => {
        const data = await response.json();
        if (controller.signal.aborted) return;
        this.status = response.status;
        this.response = data;
        this.readyState = 4;
        this.upload.progress(total, total);
        this.controller = null;
        this.onload?.();
        this.dispatchEvent(new Event('load'));
      }).catch(() => {
        if (controller.signal.aborted) return;
        this.controller = null;
        this.onerror?.();
        this.dispatchEvent(new Event('error'));
      });
    }
    abort() {
      if (!this.controller) return;
      this.controller.abort();
      this.controller = null;
      this.onabort?.();
      this.dispatchEvent(new Event('abort'));
    }
  }
  Object.defineProperty(window, 'XMLHttpRequest', { value: DemoXMLHttpRequest, configurable: false, writable: false });
}
