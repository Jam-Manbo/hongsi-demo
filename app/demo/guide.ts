import { auth, resetDemo } from './storage';
import { LIVE_SITE, LIVE_DOWNLOAD } from './links';
import './guide.css';

export function installGuide() {
  const panel = document.createElement('section');
  panel.id = 'hongsi-demo-guide';
  panel.setAttribute('aria-label', 'DEMO 체험 안내');
  panel.innerHTML = `<button class="demo-guide-toggle" type="button" aria-expanded="false" aria-controls="hongsi-demo-guide-content"><span>DEMO 체험 안내</span><svg class="demo-guide-close" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button><div id="hongsi-demo-guide-content" class="demo-guide-body" aria-hidden="true" inert><p class="demo-guide-credentials">아이디 <b>demo</b> · 비밀번호 <b>demo</b> · 출결번호 <b>1234</b></p><div class="demo-guide-copy"><p>DEMO 사이트의 모든 데이터는 가상으로 만들어진 데이터이며, 실제 서버와 연결되지 않습니다.</p><p>위치, 알림, 파일 제출은 모두 가상의 동작이며 실제로 저장하거나 전송하지 않습니다.</p><p>체험 기록은 이 브라우저에만 적용되며 매시간마다 초기화됩니다.</p></div><div class="demo-guide-actions"><a class="demo-guide-primary" href="${LIVE_SITE}" target="_blank" rel="noopener noreferrer">실제 웹사이트로 이동<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M7 7h10v10" /></svg></a><a class="demo-guide-primary" href="${LIVE_DOWNLOAD}" target="_blank" rel="noopener noreferrer">앱 다운로드 페이지로 이동<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M7 7h10v10" /></svg></a><button class="demo-guide-reset" type="button">체험 기록 초기화</button></div></div>`;
  const toggle = panel.querySelector<HTMLButtonElement>('.demo-guide-toggle')!;
  const body = panel.querySelector<HTMLDivElement>('.demo-guide-body')!;
  let open = false;
  const resize = () => {
    panel.style.height = `${open ? toggle.offsetHeight + body.offsetHeight + 4 : 48}px`;
  };
  const setOpen = (next: boolean) => {
    open = next;
    panel.classList.toggle('is-open', next);
    toggle.setAttribute('aria-expanded', String(next));
    toggle.setAttribute('aria-label', next ? 'DEMO 체험 안내 닫기' : 'DEMO 체험 안내');
    body.inert = !next;
    body.setAttribute('aria-hidden', String(!next));
    if (!next && body.contains(document.activeElement)) toggle.focus({ preventScroll: true });
    resize();
  };
  toggle.addEventListener('click', () => setOpen(!open));
  panel.querySelector('.demo-guide-reset')!.addEventListener('click', resetDemo);
  panel.addEventListener('keydown', event => {
    if (event.key === 'Escape' && open) { event.stopPropagation(); setOpen(false); toggle.focus({ preventScroll: true }); }
  });
  document.addEventListener('pointerdown', event => {
    if (open && event.target instanceof Node && !panel.contains(event.target)) setOpen(false);
  });
  window.addEventListener('hongsi-demo-login', () => setOpen(false));
  document.body.append(panel);
  new ResizeObserver(resize).observe(body);
  setOpen(!auth());
  return () => { setOpen(true); toggle.focus({ preventScroll: true }); };
}
