// 내 메모장 — 월별 캘린더 위젯 (아이폰 Scriptable 앱용)
// 큰 위젯(4×4): 이번 달 달력 + 일정 / 중간 위젯: 다가오는 일정 / 작은 위젯: 오늘
// 처음 한 번 Scriptable 앱 안에서 실행해서 저장소·토큰·앱 주소를 넣으세요.

const KEY = 'my-notes-widget';
const API = 'https://api.github.com';

// ---- 공휴일 (앱의 holidays.js와 같은 표) ----
const HOLIDAYS = {
  '2026-01-01': '신정', '2026-02-16': '설날 연휴', '2026-02-17': '설날', '2026-02-18': '설날 연휴',
  '2026-03-01': '삼일절', '2026-03-02': '대체공휴일', '2026-05-05': '어린이날', '2026-05-24': '부처님오신날',
  '2026-05-25': '대체공휴일', '2026-06-03': '지방선거일', '2026-06-06': '현충일', '2026-08-15': '광복절',
  '2026-08-17': '대체공휴일', '2026-09-24': '추석 연휴', '2026-09-25': '추석', '2026-09-26': '추석 연휴',
  '2026-10-03': '개천절', '2026-10-05': '대체공휴일', '2026-10-09': '한글날', '2026-12-25': '성탄절',
  '2027-01-01': '신정', '2027-02-05': '설날 연휴', '2027-02-06': '설날', '2027-02-07': '설날 연휴',
  '2027-02-08': '대체공휴일', '2027-03-01': '삼일절', '2027-05-05': '어린이날', '2027-05-13': '부처님오신날',
  '2027-06-06': '현충일', '2027-08-15': '광복절', '2027-08-16': '대체공휴일', '2027-09-14': '추석 연휴',
  '2027-09-15': '추석', '2027-09-16': '추석 연휴', '2027-10-03': '개천절', '2027-10-04': '대체공휴일',
  '2027-10-09': '한글날', '2027-10-11': '대체공휴일', '2027-12-25': '성탄절', '2027-12-27': '대체공휴일',
};

// ---- 색 ----
const dyn = (light, dark) => Color.dynamic(new Color(light), new Color(dark));
const C = {
  bg: dyn('#ffffff', '#1c1c1e'),
  text: dyn('#24221e', '#ebe9e4'),
  muted: dyn('#8d887d', '#8f8a80'),
  faint: dyn('#c9c4b8', '#4a4740'),
  sun: dyn('#c4473b', '#ea8a7f'),
  sat: dyn('#3b6fc2', '#7fa6e8'),
  accent: dyn('#2f6f5e', '#7cc0a7'),
  accentInk: dyn('#ffffff', '#0f1f19'),
};
const EV = {
  green: ['#2f7d5f', '#6cc29f'], blue: ['#3b6fc2', '#7fa6e8'], red: ['#c4473b', '#ea8a7f'],
  yellow: ['#b9860f', '#e2b84f'], purple: ['#7a55b8', '#b598e6'],
};
const evColor = (c, alpha = 1) => { const [l, d] = EV[c] || EV.green; return Color.dynamic(new Color(l, alpha), new Color(d, alpha)); };

// ---- 날짜 ----
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseKey = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, k) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + k);
const dayDiff = (a, b) => Math.round((parseKey(b) - parseKey(a)) / 86400000);
const WD = ['일', '월', '화', '수', '목', '금', '토'];

// 앱(calendar.js)과 같은 규칙으로 반복·여러 날 일정 펼치기
function startsOn(ev, s, sk) {
  if (sk < ev.date || (ev.skip || []).includes(sk)) return false;
  const o = parseKey(ev.date);
  switch (ev.repeat) {
    case 'weekly': return dayDiff(ev.date, sk) % 7 === 0;
    case 'monthly': return s.getDate() === o.getDate();
    case 'yearly': return s.getDate() === o.getDate() && s.getMonth() === o.getMonth();
    default: return sk === ev.date;
  }
}
function eventsOn(events, key) {
  const day = parseKey(key);
  const out = [];
  for (const ev of events || []) {
    const span = ev.end && ev.end > ev.date ? dayDiff(ev.date, ev.end) : 0;
    for (let k = 0; k <= span; k++) {
      const s = addDays(day, -k);
      if (startsOn(ev, s, ymd(s))) { out.push({ ev, first: k === 0 }); break; }
    }
  }
  return out.sort((a, b) => (a.ev.time || '').localeCompare(b.ev.time || '') || (a.ev.title || '').localeCompare(b.ev.title || ''));
}

// ---- 설정 ----
function loadCfg() {
  if (!Keychain.contains(KEY)) return null;
  try { return JSON.parse(Keychain.get(KEY)); } catch (e) { return null; }
}
async function setup(old) {
  const a = new Alert();
  a.title = '내 메모장 위젯 설정';
  a.message = '메모장 앱 설정에 넣은 것과 같은 저장소와 토큰을 넣으세요. 앱 주소는 위젯을 누르면 열릴 주소예요.';
  a.addTextField('저장소 (아이디/my-notes-data)', old ? `${old.owner}/${old.repo}` : '');
  a.addSecureTextField('토큰 (github_pat_...)', old ? old.token : '');
  a.addTextField('앱 주소 (https://아이디.github.io/my-notes/)', old ? old.appUrl : '');
  a.addAction('저장');
  a.addCancelAction('취소');
  if ((await a.present()) === -1) return old;
  const [owner, repo] = a.textFieldValue(0).trim().replace(/^https?:\/\/github\.com\//, '').split('/');
  let appUrl = a.textFieldValue(2).trim();
  if (appUrl && !appUrl.endsWith('/')) appUrl += '/';
  const cfg = { owner, repo, token: a.textFieldValue(1).trim(), appUrl, apiBase: old && old.apiBase };
  Keychain.set(KEY, JSON.stringify(cfg));
  return cfg;
}

// ---- GitHub에서 읽기 (실패하면 지난번 저장본) ----
const fm = FileManager.local();
const cachePath = fm.joinPath(fm.documentsDirectory(), 'my-notes-widget-cache.json');

async function ghRaw(cfg, path) {
  const r = new Request(`${cfg.apiBase || API}/repos/${cfg.owner}/${cfg.repo}${path}`);
  r.headers = { Authorization: `Bearer ${cfg.token}`, Accept: 'application/vnd.github.raw+json' };
  const text = await r.loadString();
  const code = r.response && r.response.statusCode;
  if (code && code >= 400) throw new Error(code === 401 ? '토큰이 올바르지 않아요' : code === 404 ? '저장소나 파일을 찾을 수 없어요' : `GitHub 오류 ${code}`);
  return text;
}
function parseData(text) {
  const m = text.match(/<!-- my-notes-data\n([\s\S]*?)\n-->\s*$/);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch (e) { return null; }
}

async function loadData(cfg) {
  try {
    const idx = JSON.parse(await ghRaw(cfg, '/contents/_index.json'));
    const st = idx.settings || {};
    const calId = st.calNote || 'seed-cal';
    const cal = idx.nodes[calId];
    let events = [];
    if (cal && cal.sha && !cal.trashed) events = (parseData(await ghRaw(cfg, `/git/blobs/${cal.sha}`)) || {}).events || [];
    // 업무일지·일기를 실제로 쓴 날 (템플릿만 있는 날은 시각이 1)
    const written = { work: [], diary: [] };
    for (const n of Object.values(idx.nodes)) {
      if (n.type !== 'note' || n.trashed || !(n.contentAt > 1)) continue;
      const m = String(n.id).match(/^(.*)~(\d{4}-\d{2}-\d{2})$/);
      if (!m) continue;
      if (m[1] === st.workFolder) written.work.push(m[2]);
      if (m[1] === st.diaryFolder) written.diary.push(m[2]);
    }
    const data = { events, written, at: Date.now() };
    fm.writeString(cachePath, JSON.stringify(data));
    return { data, offline: false };
  } catch (e) {
    if (fm.fileExists(cachePath)) return { data: JSON.parse(fm.readString(cachePath)), offline: true, error: e.message };
    return { data: { events: [], written: { work: [], diary: [] } }, offline: true, error: e.message };
  }
}

// ---- 위젯 크기 (아이폰 화면별 큰 위젯 크기, 포인트) ----
function largeSize() {
  const s = Device.screenSize();
  const w = Math.min(s.width, s.height), h = Math.max(s.width, s.height);
  if (w >= 428) return [364, 382];
  if (w >= 414) return [360, 379];
  if (w >= 390) return [338, 354];
  if (w >= 375 && h >= 800) return [329, 345];
  if (w >= 375) return [321, 324];
  return [292, 311];
}

function txt(stack, s, size, color, { bold = false, align } = {}) {
  const t = stack.addText(String(s));
  t.font = bold ? Font.boldSystemFont(size) : Font.systemFont(size);
  t.textColor = color;
  t.lineLimit = 1;
  t.minimumScaleFactor = 0.7;
  if (align === 'center') t.centerAlignText();
  return t;
}
// Scriptable 가로 상자 안에서 가운데 두기: 양옆에 빈칸
function centered(stack, s, size, color, opt) {
  stack.addSpacer();
  const t = txt(stack, s, size, color, opt);
  stack.addSpacer();
  return t;
}

// ---- 큰 위젯: 이번 달 달력 ----
function buildLarge(w, data, cfg, note) {
  const [W, H] = largeSize();
  const P = 12;
  w.setPadding(P, P, P, P);
  const now = new Date();
  const today = ymd(now);
  const y = now.getFullYear(), m = now.getMonth() + 1;
  const first = new Date(y, m - 1, 1);
  const days = new Date(y, m, 0).getDate();
  const weeks = Math.ceil((first.getDay() + days) / 7);
  const cw = Math.floor((W - P * 2) / 7);
  const headH = 22, wdH = 14;
  const rowH = Math.floor((H - P * 2 - headH - wdH - 4) / weeks);
  const maxEv = rowH >= 54 ? 3 : 2;
  const work = new Set(data.written.work), diary = new Set(data.written.diary);

  const head = w.addStack();
  head.size = new Size(W - P * 2, headH);
  head.centerAlignContent();
  txt(head, `${m}월`, 17, C.text, { bold: true });
  head.addSpacer(6);
  txt(head, `${y}`, 12, C.muted);
  head.addSpacer();
  if (note) txt(head, note, 9, C.muted);

  const wd = w.addStack();
  wd.size = new Size(W - P * 2, wdH);
  WD.forEach((d, i) => {
    const c = wd.addStack();
    c.size = new Size(cw, wdH);
    c.centerAlignContent();
    centered(c, d, 9, i === 0 ? C.sun : i === 6 ? C.sat : C.muted, { bold: true, align: 'center' });
  });
  w.addSpacer(4);

  for (let r = 0; r < weeks; r++) {
    const row = w.addStack();
    row.size = new Size(W - P * 2, rowH);
    for (let c = 0; c < 7; c++) {
      const d = new Date(y, m - 1, 1 - first.getDay() + r * 7 + c);
      const key = ymd(d);
      const inMonth = d.getMonth() === m - 1;
      const hol = HOLIDAYS[key];
      const cell = row.addStack();
      cell.size = new Size(cw, rowH);
      cell.layoutVertically();
      cell.topAlignContent();
      cell.setPadding(1, 1, 0, 1);
      if (cfg.appUrl) cell.url = `${cfg.appUrl}#cal=${key}`;

      // 날짜 숫자 + 쓴 날 점
      const top = cell.addStack();
      top.size = new Size(cw - 2, 15);
      top.centerAlignContent();
      const num = top.addStack();
      num.size = new Size(15, 15);
      num.centerAlignContent();
      if (key === today) { num.backgroundColor = C.accent; num.cornerRadius = 7.5; }
      const color = key === today ? C.accentInk : !inMonth ? C.faint : (c === 0 || hol) ? C.sun : c === 6 ? C.sat : C.text;
      centered(num, d.getDate(), 9.5, color, { bold: true, align: 'center' });
      if (inMonth && (work.has(key) || diary.has(key))) {
        top.addSpacer(2);
        const dot = top.addStack();
        dot.size = new Size(4, 4);
        dot.cornerRadius = 2;
        dot.backgroundColor = C.accent;
      }
      top.addSpacer();

      if (!inMonth) { cell.addSpacer(); continue; }
      const list = eventsOn(data.events, key);
      list.slice(0, list.length > maxEv ? maxEv - 1 : maxEv).forEach((o) => {
        cell.addSpacer(1.5);
        const b = cell.addStack();
        b.size = new Size(cw - 3, 10);
        b.backgroundColor = evColor(o.ev.color, o.first ? 0.22 : 0.12);
        b.cornerRadius = 2;
        b.setPadding(0, 2, 0, 1);
        b.centerAlignContent();
        txt(b, o.ev.title || '·', 7.5, C.text);
        b.addSpacer();
      });
      if (list.length > maxEv) { cell.addSpacer(1); txt(cell, `+${list.length - maxEv + 1}`, 7, C.muted); }
      cell.addSpacer();
    }
  }
}

// ---- 중간 위젯: 오늘부터 2주 일정 ----
function buildMedium(w, data, cfg, note) {
  w.setPadding(14, 16, 14, 16);
  const now = new Date();
  const head = w.addStack();
  head.centerAlignContent();
  txt(head, `${now.getMonth() + 1}월 ${now.getDate()}일 ${WD[now.getDay()]}요일`, 15, C.text, { bold: true });
  head.addSpacer();
  if (note) txt(head, note, 9, C.muted);
  w.addSpacer(8);
  let shown = 0;
  for (let k = 0; k < 14 && shown < 5; k++) {
    const d = addDays(now, k);
    const key = ymd(d);
    for (const o of eventsOn(data.events, key)) {
      if (shown >= 5) break;
      const line = w.addStack();
      line.centerAlignContent();
      if (cfg.appUrl) line.url = `${cfg.appUrl}#cal=${key}`;
      const bar = line.addStack();
      bar.size = new Size(3, 14);
      bar.cornerRadius = 1.5;
      bar.backgroundColor = evColor(o.ev.color);
      line.addSpacer(6);
      txt(line, k === 0 ? '오늘' : k === 1 ? '내일' : `${d.getMonth() + 1}/${d.getDate()}(${WD[d.getDay()]})`, 11, k === 0 ? C.accent : C.muted, { bold: true });
      line.addSpacer(6);
      txt(line, `${o.ev.time ? o.ev.time + ' ' : ''}${o.ev.title}`, 12, C.text);
      line.addSpacer();
      w.addSpacer(5);
      shown++;
    }
  }
  if (!shown) txt(w, '2주 안에 일정이 없어요', 12, C.muted);
  w.addSpacer();
}

// ---- 작은 위젯: 오늘 ----
function buildSmall(w, data) {
  w.setPadding(14, 14, 14, 14);
  const now = new Date();
  const key = ymd(now);
  txt(w, `${WD[now.getDay()]}요일`, 12, now.getDay() === 0 || HOLIDAYS[key] ? C.sun : C.muted, { bold: true });
  txt(w, now.getDate(), 34, C.text, { bold: true });
  if (HOLIDAYS[key]) txt(w, HOLIDAYS[key], 10, C.sun);
  w.addSpacer(4);
  const list = eventsOn(data.events, key);
  list.slice(0, 3).forEach((o) => txt(w, `${o.ev.time ? o.ev.time + ' ' : ''}${o.ev.title}`, 10.5, evColor(o.ev.color)));
  if (!list.length) txt(w, '오늘 일정 없음', 10.5, C.muted);
  w.addSpacer();
}

// ---- 실행 ----
async function main() {
  let cfg = loadCfg();
  let fam = config.widgetFamily || 'large';
  if (!config.runsInWidget) {
    if (!cfg) cfg = await setup(null);
    else {
      const a = new Alert();
      a.title = '내 메모장 위젯';
      a.addAction('큰 위젯 미리보기');
      a.addAction('중간 위젯 미리보기');
      a.addAction('설정 다시 하기');
      a.addCancelAction('닫기');
      const i = await a.present();
      if (i === 2) cfg = await setup(cfg);
      if (i === -1) { Script.complete(); return; }
      fam = i === 1 ? 'medium' : 'large';
    }
  }
  const w = new ListWidget();
  w.backgroundColor = C.bg;
  if (!cfg || !cfg.token) {
    txt(w, 'Scriptable 앱에서 이 스크립트를 한 번 실행해 설정하세요', 12, C.muted);
  } else {
    const { data, offline, error } = await loadData(cfg);
    const note = offline ? (error ? `⚠ ${error}` : '오프라인') : null;
    if (fam === 'small') buildSmall(w, data);
    else if (fam === 'medium') buildMedium(w, data, cfg, note);
    else buildLarge(w, data, cfg, note);
    if (cfg.appUrl) w.url = `${cfg.appUrl}#cal`;
  }
  // 30분마다 새로 그림 (실제 간격은 iOS가 정함)
  w.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000);
  if (config.runsInWidget) Script.setWidget(w);
  else if (fam === 'medium') await w.presentMedium();
  else await w.presentLarge();
  Script.complete();
}

await main();
