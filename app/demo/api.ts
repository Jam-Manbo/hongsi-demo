import type { Attachment, AttendanceReceipt, CalendarState, FileSource, SeatPeriod, SubmissionJob, SubmissionView, TodoInput } from '../src/shared/types';
import { PROFILE, activeLecture, courses, currentCourses, currentTerm, today, seconds, finished, mealsSeed, seatsSeed, timetableSeed, sampleFile } from './data';
import { auth, data, login, logout, persist } from './storage';
import { pushRequest } from './push';
import { ApiError } from './errors';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
function invalid(message: string): never { throw new ApiError(400, 'invalid', message); }
function item(cmid: number) { const found = data().calendar.items.find(i => i.key === `assign:${cmid}`); if (!found) throw new ApiError(404, 'not_found', '과제를 찾지 못했어요.'); return found; }
function view(cmid: number): SubmissionView {
  const i = item(cmid), closed = i.lateUntil !== null && i.lateUntil < seconds();
  return { info: { status: i.status === 'submitted' ? 'submitted' : 'not_submitted', canEdit: !closed, locked: closed, files: data().submissions[String(cmid)] ?? [], modified: i.modified },
    config: i.submit!, due: i.due, cutoff: i.lateUntil, late: i.due !== null && i.due < seconds(), closed };
}
function seatHours(period: SeatPeriod) { return period === 'exam' ? 4 : period === 'vacation' ? 8 : 6; }
function activeSeat() {
  const seat = data().seat;
  if (seat && seat.expiresAt <= seconds()) { data().seat = null; persist(); return null; }
  return seat;
}
function finishLinkedTodos(key: string) {
  for (const todo of data().todos) if (todo.parentKey === key && todo.doneAt === null) todo.doneAt = seconds();
}
function validateAlertLeads(value: unknown): number[] | null {
  if (value == null) return null;
  if (!Array.isArray(value) || value.length > 5 || new Set(value).size !== value.length || value.some(min => ![1440, 180, 60, 10, 0].includes(min))) invalid('알림 시간이 올바르지 않아요.');
  return [...value];
}
function validateTodo(body: TodoInput): TodoInput {
  const title = String(body.title ?? '').trim();
  if (!title) invalid('할 일 제목을 입력해 주세요.');
  if (title.length > 200) invalid('제목은 200자 이하로 입력해 주세요.');
  if (body.courseId !== null && !courses.some(c => c.id === body.courseId)) invalid('과목을 확인해 주세요.');
  if (!Number.isFinite(body.due)) invalid('날짜를 선택해 주세요.');
  const note = String(body.note ?? '');
  if (note.length > 2000) invalid('메모는 2000자까지 입력할 수 있어요.');
  return { title, note, courseId: body.courseId, parentKey: body.parentKey, due: body.due, allDay: !!body.allDay, notify: !!body.notify, alertLeads: validateAlertLeads(body.alertLeads) };
}
function handle(method: string, path: string, body: any = {}): unknown {
  const url = new URL(path, 'https://demo.invalid');
  const route = decodeURIComponent(url.pathname), d = data();
  if (method === 'POST' && route === '/api/auth/login') {
    if (String(body.id).trim().toLowerCase() !== 'demo' || body.password !== 'demo') throw new ApiError(401, 'login_rejected', '아이디와 비밀번호에 demo를 입력해 주세요.');
    login(!!body.remember); return { profile: PROFILE };
  }
  if (method === 'POST' && ['/api/auth/logout', '/api/auth/logout-all'].includes(route)) { logout(); localStorage.removeItem('hongsi-demo:push'); return { ok: true }; }
  if (!auth()) throw new ApiError(401, 'login_required', '데모에 로그인해 주세요.');
  if (route === '/api/auth/recover' && method === 'POST') return { ok: true };
  if (route.startsWith('/api/push/') || route.startsWith('/api/background/')) return pushRequest(method, url, body);
  if (route === '/api/me') return { profile: PROFILE, remembered: auth().remembered };
  if (route === '/api/preferences') {
    if (method === 'PATCH') {
      if ('mealPlace' in body) { if (!['dorm', 'staff'].includes(body.mealPlace)) invalid('식당을 확인해 주세요.'); d.preferences.mealPlace = body.mealPlace; }
      if ('timetableDisplay' in body) { if (!['full', 'fit'].includes(body.timetableDisplay)) invalid('시간표 표시 방식을 확인해 주세요.'); d.preferences.timetableDisplay = body.timetableDisplay; }
      if ('semesterDisplay' in body) { if (!['current', 'all'].includes(body.semesterDisplay)) invalid('학기 표시 방식을 확인해 주세요.'); d.preferences.semesterDisplay = body.semesterDisplay; }
      if ('alertLeads' in body) d.preferences.alertLeads = validateAlertLeads(body.alertLeads) ?? [60];
      d.preferences.updatedAt = Math.max(Date.now(), d.preferences.updatedAt + 1);
    }
    return d.preferences;
  }
  if (route === '/api/calendar/state') return {
    checks: Object.fromEntries(d.calendar.items.filter(i => i.doneOverride !== null).map(i => [i.key, i.doneOverride!])),
    alertsOff: d.calendar.items.filter(i => !i.alert).map(i => i.key),
    alertLeads: Object.fromEntries(d.calendar.items.filter(i => i.alertLeads !== null).map(i => [i.key, i.alertLeads!])),
  } satisfies CalendarState;
  if (route === '/api/calendar') {
    for (const i of d.calendar.items) {
      if (i.kind === 'assignment' && i.status !== 'submitted') i.status = i.due !== null && i.due < seconds() ? 'overdue' : 'not_submitted';
      i.done = i.doneOverride ?? finished(i);
    }
    const semesterDisplay = url.searchParams.get('semester') === 'all' ? 'all' : 'current';
    const visibleCourses = semesterDisplay === 'all' ? courses : currentCourses;
    const items = d.calendar.items.filter(i => visibleCourses.some(c => c.id === i.courseId)).sort((a, b) => (a.due ?? Infinity) - (b.due ?? Infinity));
    return { ...d.calendar, courses: visibleCourses, items, semesterDisplay, currentTerm, fetchedAt: seconds() };
  }
  let m = /^\/api\/calendar\/items\/(.+)\/(done|alert|alert-leads|verify)$/.exec(route);
  if (m) {
    const i = d.calendar.items.find(i => i.key === m![1]);
    if (!i) throw new ApiError(404, 'not_found', '항목을 찾지 못했어요.');
    if (m[2] === 'done') { i.doneOverride = typeof body.done === 'boolean' ? body.done : null; i.done = i.doneOverride ?? finished(i); if (i.done) finishLinkedTodos(i.key); return { key: i.key, done: i.done }; }
    if (m[2] === 'alert') { i.alert = !!body.on; return { key: i.key, on: i.alert }; }
    if (m[2] === 'alert-leads') { i.alertLeads = validateAlertLeads(body.leads); return { key: i.key, leads: i.alertLeads }; }
    return { key: i.key, status: i.status, finished: finished(i) };
  }
  m = /^\/api\/assign\/(\d+)\/submission\/jobs\/([a-f0-9]{32})$/.exec(route);
  if (m) {
    const cmid = Number(m[1]), id = m[2], key = `${cmid}:${id}`;
    if (method === 'GET' || d.jobs[key]) {
      const job = d.jobs[key];
      if (!job) throw new ApiError(404, 'not_found', '제출 내역을 찾지 못했어요.');
      return job;
    }
    if (method === 'POST') {
      const result = handle('POST', `/api/assign/${cmid}/submission`, body) as SubmissionView;
      const files: Attachment[] = body.files;
      const total = files.reduce((sum, file) => sum + (file.size ?? 0), 0);
      const job: SubmissionJob = { id, revision: 1, status: 'complete', result, error: null,
        progress: { stage: 'verify', fileName: null, fileCount: files.length, uploadedFiles: files.length, sentBytes: total, totalBytes: total } };
      d.jobs[key] = job;
      return job;
    }
  }
  m = /^\/api\/assign\/(\d+)\/submission$/.exec(route);
  if (m) {
    const cmid = Number(m[1]), current = view(cmid);
    if (method === 'GET') return current;
    if (current.closed) invalid('제출 기간이 끝났어요.');
    if (current.late && !body.lateConfirmed) invalid('마감 후 제출에 동의해 주세요.');
    if (current.config.statement && !body.acceptStatement) invalid('제출 서약을 확인해 주세요.');
    const old = current.info.files.filter(f => body.keep.includes(f.name)), added: Attachment[] = body.files;
    const files = [...new Map([...old, ...added].map(f => [f.name, f])).values()];
    if (!files.length) invalid('파일을 추가해 주세요.');
    if (files.length > current.config.maxFiles) invalid(`파일은 최대 ${current.config.maxFiles}개까지 제출할 수 있어요.`);
    if (files.some(f => (f.size ?? 0) > current.config.maxBytes)) invalid('파일당 용량 제한을 초과했어요.');
    if (files.reduce((n, f) => n + (f.size ?? 0), 0) > 100 * 1024 * 1024) invalid('합계 100MB를 초과했어요.');
    d.submissions[String(cmid)] = files;
    const i = item(cmid); i.status = 'submitted'; i.done = true; i.doneOverride = true; i.modified = seconds();
    finishLinkedTodos(i.key);
    return view(cmid);
  }
  if (route === '/api/timetable') return timetableSeed();
  if (route === '/api/attendance/active') return { items: d.attended ? [] : [activeLecture()], message: null };
  if (route === '/api/attendance/receipts') {
    if (method === 'PUT') {
      const receipt = body.receipt as AttendanceReceipt;
      if (body.account !== PROFILE.studentId || receipt?.lecture?.key !== activeLecture().key || receipt.date !== today() || !['present', 'late', 'excused'].includes(receipt.kind)) invalid('출석 기록을 확인해 주세요.');
      d.receipts = [...d.receipts.filter(r => r.lecture.key !== receipt.lecture.key), receipt];
      return { ok: true };
    }
    return d.receipts.filter(r => r.date === today());
  }
  if (route === '/api/attendance/submit') {
    if (body.code !== '1234') return { message: '출결번호가 일치하지 않습니다.', receipt: null, synced: false };
    if (body.lectureKey !== activeLecture().key) invalid('수업을 확인해 주세요.');
    if (!d.attended) {
      d.attended = true;
      const date = new Date(Date.now() + 9 * 3600_000);
      d.attendance[0].weeks[4].sessions = [0, 1].map(index => ({ date: `${date.getUTCMonth() + 1}/${date.getUTCDate()}`, kind: index === 0 ? 'present' : 'planned', mark: index === 0 ? '출석' : '예정' }));
      d.attendance[0].summary.present++; d.attendance[0].summary.planned--;
    }
    const receipt: AttendanceReceipt = { lecture: activeLecture(), date: today(), kind: 'present', confirmedAt: Date.now() };
    d.receipts = [receipt];
    return { message: '출석확인이 완료되었습니다.[출석]', receipt, synced: true };
  }
  if (route === '/api/attendance/status') return d.attendance;
  if (route === '/api/attendance/course') return d.attendance.find(c => c.code === url.searchParams.get('code')) ?? d.attendance[0];
  if (route === '/api/todos') {
    if (method === 'GET') return d.todos;
    if (body.parentKey) {
      const parent = d.calendar.items.find(i => i.key === body.parentKey);
      if (!parent) invalid('연결할 과제·강의를 확인할 수 없어요.');
      if (parent.done) throw new ApiError(409, 'conflict', '완료된 일정에는 할 일을 추가할 수 없어요.');
      body = { ...body, courseId: parent.courseId };
    }
    const t = { ...validateTodo(body), id: Math.max(0, ...d.todos.map(t => t.id)) + 1, doneAt: null };
    d.todos.push(t); return t;
  }
  m = /^\/api\/todos\/(\d+)(\/done)?$/.exec(route);
  if (m) {
    const index = d.todos.findIndex(t => t.id === Number(m![1]));
    if (index < 0) throw new ApiError(404, 'not_found', '할 일을 찾지 못했어요.');
    if (method === 'DELETE') { d.todos.splice(index, 1); return { ok: true }; }
    if (m[2]) {
      const parent = d.calendar.items.find(i => i.key === d.todos[index].parentKey);
      d.todos[index].doneAt = body.done || parent?.done ? d.todos[index].doneAt ?? seconds() : null;
    } else {
      const existing = d.todos[index];
      if (body.parentKey !== existing.parentKey || (existing.parentKey && body.courseId !== existing.courseId)) invalid('연결된 과제·강의는 변경할 수 없어요.');
      d.todos[index] = { ...existing, ...validateTodo(body) };
    }
    return d.todos[index];
  }
  if (route === '/api/meals') return mealsSeed();
  if (route === '/api/seats') {
    const seats = seatsSeed(), seat = activeSeat();
    if (seat) {
      const room = seats.buildings.find(b => b.id === seat.building)?.rooms.find(r => r.no === seat.roomNo);
      const cell = room?.grid.flat().find(c => c?.no === seat.seatNo);
      if (cell && room && cell.state === 'free') { cell.state = 'used'; room.free--; room.used++; }
    }
    return seats;
  }
  if (route === '/api/seats/recent') return [{ seatNo: 4, at: seconds() - 120 }, { seatNo: 8, at: seconds() - 240 }];
  if (route === '/api/seats/session') {
    if (method === 'GET') return { session: activeSeat() };
    if (method === 'PATCH') {
      const seat = activeSeat(); if (!seat) invalid('입실 기록이 없어요.');
      seat.startedAt = body.startedAt; seat.period = body.period; seat.validityHours = seatHours(body.period); seat.expiresAt = body.startedAt + seat.validityHours * 3600; seat.startSource = 'adjusted';
      return { session: seat };
    }
    if (activeSeat()) invalid('먼저 이용 중인 좌석을 반납해 주세요.');
    const building = seatsSeed().buildings.find(b => b.id === body.building), room = building?.rooms.find(r => r.no === body.roomNo), cell = room?.grid.flat().find(c => c?.no === body.seatNo);
    if (!building || !room || !cell || cell.state === 'blocked') invalid('이 좌석은 이용할 수 없어요.');
    const hours = seatHours(body.period);
    d.seat = { id: seconds(), building: building.id, buildingName: building.name, roomNo: room.no, roomName: room.name, seatNo: body.seatNo, period: body.period,
      startedAt: seconds(), startSource: 'manual', expiresAt: seconds() + hours * 3600, extendCount: 0, endedAt: null, seatState: 'used', validityHours: hours };
    return { session: d.seat };
  }
  if (route === '/api/seats/session/extend') {
    const seat = activeSeat(); if (!seat) invalid('만료된 좌석 이용입니다.');
    seat.expiresAt = seconds() + seat.validityHours * 3600; seat.extendCount++; return { session: seat };
  }
  if (route === '/api/seats/session/end') { d.seat = null; return { session: null }; }
  if (route === '/api/notifications') return [
    { url: '/mod/ubboard/article.php?id=101&bwid=1', course: '과목1', section: '공지사항', message: '공지사항1', kind: 'ubboard_notice', when: '방금' },
    { url: '/mod/assign/view.php?id=2', course: '과목2', section: '과제', message: '과제2가 등록되었습니다.', kind: 'assign', when: '10분 전' },
    { url: '/mod/vod/view.php?id=1', course: '과목1', section: '강의', message: '강의1이 등록되었습니다.', kind: 'vod', when: '30분 전' },
    { url: '/mod/folder/view.php?id=201', course: '과목3', section: '자료', message: '강의자료1', kind: 'folder', when: '1시간 전' },
    { url: '/mod/ubboard/article.php?id=102&bwid=2', course: '과목2', section: '공지사항', message: '공지사항2', kind: 'ubboard_notice', when: '2시간 전' } ];
  if (route === '/api/notices/seen') { if (method === 'POST') d.seen = [...new Set([...d.seen, ...body.urls])]; return { urls: d.seen, ok: true }; }
  m = /^\/api\/board\/(\d+)\/(\d+)$/.exec(route);
  if (m) { const n = Number(m[2]); return { cmid: Number(m[1]), bwid: n, board: '공지사항', title: `공지사항${n}`, writer: `교수${n}`, posted: seconds() - n * 3600,
    html: `<p>과목${n}의 공지사항${n}입니다.</p><p>수업 일정과 과제 안내를 이곳에서 확인할 수 있어요.</p><p>이 내용과 첨부파일은 홍시 체험을 위한 가상 자료입니다.</p>`, attachments: [sampleFile(`공지사항${n}_첨부.txt`)] }; }
  m = /^\/api\/modules\/(\d+)$/.exec(route);
  if (m) return { cmid: Number(m[1]), courseId: 3, modname: 'folder', name: '강의자료1', files: [sampleFile('강의자료1.txt'), sampleFile('강의자료2.txt')], link: null };
  throw new ApiError(404, 'demo_route', '이 기능은 데모에서 준비되지 않았어요.');
}
export async function demoRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (!path.startsWith('/api/auth/')) await new Promise(resolve => setTimeout(resolve, method === 'GET' ? 60 : 140));
  const result = handle(method.toUpperCase(), path, body);
  if (method !== 'GET' && !path.startsWith('/api/auth/')) persist();
  return clone(result) as T;
}
export function demoFile(src: FileSource) {
  const title = src.kind === 'assign' ? `과제${src.cmid}` : src.kind === 'board' ? `공지사항${src.bwid}` : `강의자료${src.index + 1}`;
  return new Blob([`${title}\n\n홍시 데모용 샘플 파일입니다.\n실제 학교 자료가 아닙니다.\n`], { type: 'text/plain;charset=utf-8' });
}
