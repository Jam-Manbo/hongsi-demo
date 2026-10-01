import type { AttendanceCourse, CalendarData, CalendarItem, MealDay, SeatsData, Timetable, Todo, SeatSession, Attachment } from '../src/lib/types';

export const PROFILE = { name: '사용자1', studentId: 'DEMO', department: '학과1', hasPicture: false };
export const seconds = () => Math.floor(Date.now() / 1000);
export function today() { return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10); }
export function dayAt(offset: number, hour = 23, minute = 59) {
  return Math.floor(Date.parse(`${today()}T00:00:00+09:00`) / 1000) + offset * 86400 + hour * 3600 + minute * 60;
}
export const courses = Array.from({ length: 6 }, (_, i) => ({ id: i + 1, name: `과목${i + 1}`, code: `DEMO-${i + 1}` }));
export const finished = (i: CalendarItem) => i.status === 'submitted' || i.status === 'done';
export const sampleFile = (name: string): Attachment => ({ name, size: 128, mime: 'text/plain' });
export function calendarSeed(): CalendarData {
  const items: CalendarItem[] = [];
  const offsets = [0, 1, 2, 3, 5, 7, -1, -3, 0, 10, 14, null];
  offsets.forEach((offset, index) => {
    const n = index + 1, submitted = [3, 9].includes(n);
    const due = offset === null ? null : dayAt(offset);
    const status = submitted ? 'submitted' : offset !== null && offset < 0 ? 'overdue' : 'not_submitted';
    items.push({ key: `assign:${n}`, kind: 'assignment', courseId: index % 6 + 1, title: `과제${n}`,
      start: dayAt(-7, 9, 0), due, status, done: submitted, doneOverride: null, alert: true,
      url: `/mod/assign/view.php?id=${n}`, introHtml: `<p>과목${index % 6 + 1}의 과제${n} 안내입니다.</p><p>첨부된 안내 자료를 확인하고 파일을 제출해 보세요. 데모에서 선택한 파일은 서버로 전송되지 않습니다.</p>`,
      attachments: [sampleFile(`과제${n}_안내.txt`)], watch: null, lateUntil: due === null ? null : due + 7 * 86400,
      modified: seconds() - 3600, firstSeen: null, firstDue: null, firstIntroHtml: null, changeCount: 0,
      submit: { files: true, maxFiles: 3, maxBytes: 20 * 1024 * 1024, text: false, drafts: false, statement: n === 4 } });
  });
  [0, 1, 2, 4, 6, 9, -2, 12].forEach((offset, index) => {
    const n = index + 1, status = n === 3 ? 'done' : n === 2 ? 'partial' : offset < 0 ? 'missed' : n === 8 ? 'upcoming' : 'todo';
    items.push({ key: `vod:${n}`, kind: 'vod', courseId: index % 6 + 1, title: `강의${n}`,
      start: dayAt(n === 8 ? 5 : -3, 9, 0), due: dayAt(offset), status, done: status === 'done', doneOverride: null, alert: true,
      url: `/mod/vod/view.php?id=${n}`, introHtml: `<p>과목${index % 6 + 1}의 강의${n}입니다.</p><p>시청 시간과 이수 상태를 보여 주는 가상 강의입니다.</p>`,
      attachments: [], watch: { required: '30분', watched: status === 'done' ? '30분' : status === 'partial' ? '12분' : '0분', mark: status === 'done' ? '출석' : '' },
      lateUntil: null, modified: null, firstSeen: null, firstDue: null, firstIntroHtml: null, changeCount: 0, submit: null });
  });
  return { courses, items, fetchedAt: seconds() };
}
export function todoSeed(): Todo[] {
  return [0, 1, 3, -1].map((offset, i) => ({ id: i + 1, title: `할 일${i + 1}`, note: `할 일${i + 1}의 메모입니다. 자유롭게 수정해 보세요.`,
    courseId: i === 1 ? 1 : null, parentKey: i === 1 ? 'assign:1' : null, dueAt: dayAt(offset, 0, 0), allDay: true, doneAt: null, notify: true }));
}
export function timetableSeed(): Timetable {
  const weekday = (new Date(Date.now() + 9 * 3600_000).getUTCDay() + 6) % 7;
  return { slots: courses.flatMap((c, i) => [{ code: c.code, name: c.name, weekday: i === 0 ? weekday : (weekday + Math.floor(i / 2)) % 5,
    start: `${10 + i % 3 * 2}:00`, periods: [2 + i % 3 * 2, 3 + i % 3 * 2], room: `강의실${i + 1}` }]) };
}
export function attendanceSeed(): AttendanceCourse[] {
  return courses.map((c, i) => {
    const weeks = Array.from({ length: 15 }, (_, w) => ({ week: w + 1, sessions: Array.from({ length: 2 }, (_, s) => {
      const date = new Date((dayAt((w - 4) * 7 - 1, 0, 0)) * 1000 + 9 * 3600_000);
      const kind = w > 3 ? 'planned' : w === 2 && i === 1 ? 'absent' : w === 1 && s === 0 && i === 2 ? 'late' : 'present';
      return { date: `${date.getUTCMonth() + 1}/${date.getUTCDate()}`, kind, mark: { planned: '예정', absent: '결석', late: '지각', present: '출석' }[kind] };
    }) }));
    const summary = { present: 0, late: 0, absent: 0, excused: 0, none: 0, planned: 0 };
    for (const w of weeks) for (const s of w.sessions) summary[s.kind as keyof typeof summary]++;
    return { code: c.code, name: c.name, published: i !== 5, notice: i === 5 ? '출석부가 공개되지 않았습니다.' : null, weeks, summary } as AttendanceCourse;
  });
}
export function seatsSeed(): SeatsData {
  return { fetchedAt: seconds(), watching: true, buildings: ['T', 'G', 'R'].map((id, b) => ({ id, name: `건물${b + 1}`,
    rooms: Array.from({ length: 3 }, (_, r) => {
      const grid = Array.from({ length: 8 }, (_, row) => Array.from({ length: 12 }, (_, col) => {
        if (col === 5 || col === 6) return null;
        const no = row * 10 + (col < 5 ? col : col - 2) + 1;
        return { no, state: (no + b + r) % 13 === 0 ? 'blocked' : (no + b * 3 + r) % 4 === 0 ? 'used' : 'free' } as const;
      }));
      const cells = grid.flat().filter(c => c !== null);
      return { no: r + 1, name: `제${r + 1}열람실`, grid, total: cells.length, used: cells.filter(c => c.state === 'used').length, free: cells.filter(c => c.state === 'free').length };
    }) })) };
}
export function mealsSeed(): MealDay[] {
  const weekday = (new Date(Date.now() + 9 * 3600_000).getUTCDay() + 6) % 7;
  return Array.from({ length: 5 }, (_, i) => {
    const at = new Date(dayAt(i - weekday, 12, 0) * 1000 + 9 * 3600_000);
    return { date: at.toISOString().slice(0, 10), weekday: ['일', '월', '화', '수', '목', '금', '토'][at.getUTCDay()],
      places: [1, 2].map(p => ({ name: p === 1 ? '기숙사식당1' : '교직원식당2', meals: ['아침', '점심A', '점심B', '저녁'].map((name, m) => ({ name,
        start: m === 0 ? '08:00' : m === 3 ? '17:00' : '11:30', end: m === 0 ? '09:00' : m === 3 ? '19:00' : '14:00',
        price: p === 1 ? '5,800원' : '9,000원', items: Array.from({ length: 6 }, (_, n) => `메뉴${p}-${m + 1}-${n + 1}`) })) })) };
  });
}
export type DemoData = { version: 2; hour: number; day: string; calendar: CalendarData; todos: Todo[]; attendance: AttendanceCourse[]; attended: boolean; seat: SeatSession | null; seen: string[]; submissions: Record<string, Attachment[]> };
export function seed(): DemoData {
  return { version: 2, hour: Math.floor(Date.now() / 3_600_000), day: today(), calendar: calendarSeed(), todos: todoSeed(), attendance: attendanceSeed(), attended: false, seat: null, seen: [],
    submissions: { '3': [sampleFile('과제3_제출.txt')], '9': [sampleFile('과제9_제출.txt')] } };
}
