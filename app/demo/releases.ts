const releases = [
  { id: '3', version: '0.2.0-beta.1', prerelease: true, isLatest: false, notes: '베타 버전의 변경사항 예시입니다.\n새 기능을 미리 확인할 수 있어요.' },
  { id: '2', version: '0.1.2', prerelease: false, isLatest: true, notes: '홈에서 바로 출결할 수 있어요.\n캘린더와 마감 알림 설정을 개선했어요.' },
  { id: '1', version: '0.1.1', prerelease: false, isLatest: false, notes: '시간표와 열람실 화면을 개선했어요.\n앱의 안정성을 개선했어요.' },
].map((release, index) => ({ ...release, tag: `v${release.version}`, versionCode: 100 + Number(release.id),
  publishedAt: new Date(Date.now() - index * 7 * 86400_000).toISOString(),
  url: `https://hongsi-demo.invalid/releases/${release.version}/hongsi.apk`,
  notesUrl: `https://hongsi-demo.invalid/releases/${release.version}/release_notes.md`,
  size: (26 + Number(release.id)) * 1024 * 1024, sha256: '0'.repeat(64),
}));

export function publicResponse(path: string): Response | null {
  if (path === '/api/health') return Response.json({ ok: true });
  if (path === '/api/app-update') return Response.json(releases.find(release => release.isLatest));
  if (path === '/api/app-releases') return Response.json({ url: 'https://github.com/Jam-Manbo/hongsi/releases', releases });
  const match = /^\/api\/app-releases\/(\d+)$/.exec(path);
  if (!match) return null;
  const release = releases.find(release => release.id === match[1]);
  return release ? Response.json(release) : Response.json({ error: { code: 'not_found', message: '버전을 찾지 못했어요.' } }, { status: 404 });
}
