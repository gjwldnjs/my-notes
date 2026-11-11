// 내 메모장 — 월별 캘린더 위젯 (아이폰 Scriptable 앱용)
// 큰 위젯(4×4): 이번 달 달력 + 일정 / 중간 위젯: 다가오는 일정 / 작은 위젯: 오늘
// D-day 위젯: 홈 화면 위젯을 길게 눌러 "위젯 편집" → Parameter 칸에 dday 라고 적으면 D-day 목록으로 바뀐다 (크기 상관없음)
// 처음 한 번 Scriptable 앱 안에서 실행해서, 메모장 앱 설정의 "아이폰 위젯 연결 코드"를 붙여 넣으세요.

const KEY = 'my-notes-widget';

// ---- 공휴일 (앱의 holidays.js와 같은 표) ----
// 쉬지 않는 날들. 종류: memorial(국경일·기념일) · pop(대중 기념일) · season(절기·음력)
// memorial·pop 은 해마다 같은 날(월-일), season 은 해마다 달라서 연도별로 적는다 (2026~2027)
const YEARLY = {
  memorial: {
    '04-05': '식목일', '04-19': '4·19혁명기념일', '05-01': '근로자의 날', '05-08': '어버이날', '05-15': '스승의 날',
    '05-18': '5·18민주화운동기념일', '06-25': '6·25전쟁일', '07-17': '제헌절', '10-01': '국군의 날',
    '11-03': '학생독립운동기념일', '11-17': '순국선열의 날',
  },
  pop: {
    '02-14': '발렌타인데이', '03-14': '화이트데이', '04-14': '블랙데이', '10-31': '핼러윈', '11-11': '빼빼로데이',
    '12-24': '크리스마스이브', '12-31': '섣달그믐',
  },
};
const SEASON = {
  '2026-01-05': '소한', '2026-01-20': '대한', '2026-02-04': '입춘', '2026-02-19': '우수', '2026-03-03': '정월대보름', '2026-03-05': '경칩',
  '2026-03-20': '춘분', '2026-04-05': '청명', '2026-04-20': '곡우', '2026-05-05': '입하', '2026-05-21': '소만', '2026-06-06': '망종',
  '2026-06-21': '하지', '2026-07-07': '소서', '2026-07-15': '초복', '2026-07-23': '대서', '2026-07-25': '중복', '2026-08-07': '입추',
  '2026-08-14': '말복', '2026-08-23': '처서', '2026-09-08': '백로', '2026-09-23': '추분', '2026-10-08': '한로', '2026-10-23': '상강',
  '2026-11-07': '입동', '2026-11-22': '소설', '2026-12-07': '대설', '2026-12-22': '동지',
  '2027-01-05': '소한', '2027-01-20': '대한', '2027-02-04': '입춘', '2027-02-19': '우수', '2027-02-20': '정월대보름', '2027-03-06': '경칩',
  '2027-03-21': '춘분', '2027-04-05': '청명', '2027-04-20': '곡우', '2027-05-06': '입하', '2027-05-21': '소만', '2027-06-06': '망종',
  '2027-06-21': '하지', '2027-07-07': '소서', '2027-07-20': '초복', '2027-07-23': '대서', '2027-07-30': '중복', '2027-08-08': '입추',
  '2027-08-09': '말복', '2027-08-23': '처서', '2027-09-08': '백로', '2027-09-23': '추분', '2027-10-08': '한로', '2027-10-24': '상강',
  '2027-11-07': '입동', '2027-11-22': '소설', '2027-12-07': '대설', '2027-12-22': '동지',
};
const DAY_KINDS = [['memorial', '국경일·기념일'], ['pop', '대중 기념일'], ['season', '절기·음력']];
// 그날의 기념일 목록. show: 설정 { memorial: true, pop: false, ... } (없으면 모두 표시)
function observancesOf(key, show) {
  const out = [];
  const md = key.slice(5);
  for (const [k] of DAY_KINDS) {
    if (show && show[k] === false) continue;
    const name = k === 'season' ? SEASON[key] : YEARLY[k][md];
    if (name) out.push({ name, kind: k });
  }
  return out;
}

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
  line: dyn('#e7e3da', '#3a3835'),
  sun: dyn('#c4473b', '#ea8a7f'),
  sat: dyn('#3b6fc2', '#7fa6e8'),
  accent: dyn('#2f6f5e', '#7cc0a7'),
  accentInk: dyn('#ffffff', '#0f1f19'),
  soon: dyn('#d9822b', '#f0a65a'),
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

// ---- D-day (앱의 dday.js와 같은 계산) ----
const DREPEAT = { m1: '매월', m3: '3개월마다', m6: '6개월마다', y1: '매년' };
const DSTEP = { m1: 1, m3: 3, m6: 6, y1: 12 };
function addMonths(base, n) {
  const y = base.getFullYear(), m = base.getMonth() + n;
  return new Date(y, m, Math.min(base.getDate(), new Date(y, m + 1, 0).getDate()));
}
function ddayInfo(it, t) {
  const fmtD = (d) => `${d.getMonth() + 1}/${d.getDate()}(${WD[d.getDay()]})`;
  const diff = (a, b) => Math.round((b - a) / 86400000);
  const base = parseKey(it.date);
  if (it.mode === 'since') {
    const n = diff(base, t) + 1;
    if (n < 1) return { big: `D-${1 - n}`, sub: `${fmtD(base)} 부터`, sort: 1 - n, cls: '' };
    const next100 = Math.ceil((n + 1) / 100) * 100;
    const d100 = addDays(base, next100 - 1);
    let yr = t.getFullYear() - base.getFullYear();
    let anniv = addMonths(base, yr * 12);
    if (anniv <= t) anniv = addMonths(base, ++yr * 12);
    const [nm, when] = d100 < anniv ? [`${next100}일`, d100] : [`${yr}주년`, anniv];
    return { big: `${n.toLocaleString()}일째`, sub: `${nm}까지 ${diff(t, when)}일`, sort: -1e9, cls: 'since' };
  }
  let when = base;
  const k = DSTEP[it.repeat];
  if (k && base < t) { let i = 0; while (when < t) when = addMonths(base, ++i * k); }
  const left = diff(t, when);
  const big = left > 0 ? `D-${left}` : left === 0 ? 'D-Day' : `D+${-left}`;
  const rep = DREPEAT[it.repeat] ? ` · ${DREPEAT[it.repeat]}` : '';
  return { big, sub: `${fmtD(when)}${rep}`, sort: left < 0 ? 1e9 - left : left, cls: left < 0 ? 'past' : left <= 3 ? 'soon' : '' };
}
const ddayColor = (cls) => (cls === 'since' ? C.sun : cls === 'soon' ? C.soon : cls === 'past' ? C.muted : C.accent);

// ---- 설정 ----
function loadCfg() {
  if (!Keychain.contains(KEY)) return null;
  try { return JSON.parse(Keychain.get(KEY)); } catch (e) { return null; }
}
// 메모장 앱 → 설정 → "아이폰 위젯 연결 코드"를 붙여 넣는다
function decodeCode(code) {
  const s = code.trim();
  const raw = typeof Data !== 'undefined' && Data.fromBase64String ? Data.fromBase64String(s).toRawString() : decodeURIComponent(escape(atob(s)));
  const c = JSON.parse(raw);
  if (!c.uid || !c.refreshToken || !c.projectId) throw new Error('연결 코드가 올바르지 않아요');
  if (c.appUrl && !c.appUrl.endsWith('/')) c.appUrl += '/';
  return c;
}
async function setup(old) {
  const a = new Alert();
  a.title = '내 메모장 위젯 연결';
  a.message = '메모장 앱 → ⚙ 설정 → "아이폰 위젯 연결 코드" → 복사한 코드를 붙여 넣으세요.';
  a.addTextField('연결 코드', '');
  a.addAction('저장');
  a.addCancelAction('취소');
  if ((await a.present()) === -1) return old;
  try {
    const cfg = decodeCode(a.textFieldValue(0));
    Keychain.set(KEY, JSON.stringify(cfg));
    return cfg;
  } catch (e) {
    const b = new Alert();
    b.title = '연결하지 못했어요';
    b.message = `${e.message}\n코드를 처음부터 끝까지 다시 복사해 주세요.`;
    b.addAction('확인');
    await b.present();
    return old;
  }
}

// ---- Firebase에서 읽기 (실패하면 지난번 저장본) ----
const fm = FileManager.local();
const cachePath = fm.joinPath(fm.documentsDirectory(), 'my-notes-widget-cache.json');

async function idToken(cfg) {
  const base = cfg.emu ? `${cfg.emu.auth}/securetoken.googleapis.com` : 'https://securetoken.googleapis.com';
  const r = new Request(`${base}/v1/token?key=${cfg.apiKey}`);
  r.method = 'POST';
  r.headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
  r.body = `grant_type=refresh_token&refresh_token=${encodeURIComponent(cfg.refreshToken)}`;
  const j = await r.loadJSON();
  if (!j.id_token) throw new Error('연결이 끊겼어요. 앱에서 새 연결 코드를 받아 주세요');
  return j.id_token;
}

// Firestore 값 → 보통 값
function val(v) {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(val);
  if ('mapValue' in v) return fields(v.mapValue.fields || {});
  if ('timestampValue' in v) return v.timestampValue;
  return null;
}
const fields = (f) => Object.fromEntries(Object.entries(f || {}).map(([k, v]) => [k, val(v)]));

async function fsRequest(cfg, token, path, body) {
  const root = cfg.emu ? `${cfg.emu.firestore}/v1` : 'https://firestore.googleapis.com/v1';
  const r = new Request(`${root}/projects/${cfg.projectId}/databases/(default)/documents/users/${cfg.uid}${path}`);
  r.headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  if (body) { r.method = 'POST'; r.body = JSON.stringify(body); }
  const j = await r.loadJSON();
  const code = r.response && r.response.statusCode;
  if (code === 404) return null;
  if (code && code >= 400) throw new Error(code === 403 ? '읽을 권한이 없어요. 새 연결 코드를 받아 주세요' : `서버 오류 ${code}`);
  return j;
}

async function loadData(cfg) {
  try {
    const token = await idToken(cfg);
    const sDoc = await fsRequest(cfg, token, '/nodes/__settings');
    const st = sDoc ? (fields(sDoc.fields).settings || {}) : {};
    const calId = st.calNote || 'seed-cal';
    const showDays = st.showDays || null;
    const workF = st.workFolder || 'seed-work';
    const diaryF = st.diaryFolder || 'seed-diary';
    const cal = await fsRequest(cfg, token, `/nodes/${encodeURIComponent(calId)}`);
    let events = [];
    if (cal) {
      const c = fields(cal.fields);
      if (!c.trashed && c.data) { try { events = JSON.parse(c.data).events || []; } catch (e) {} }
    }
    // 이번 달·지난 달 업무일지·일기 중 실제로 쓴 날 (템플릿만 있는 날은 시각이 1)
    const now = new Date();
    const months = [now, new Date(now.getFullYear(), now.getMonth() - 1, 1)].map((d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`);
    const parents = months.flatMap((m) => [`${workF}~${m}`, `${diaryF}~${m}`]);
    const rows = await fsRequest(cfg, token, ':runQuery', {
      structuredQuery: {
        from: [{ collectionId: 'nodes' }],
        where: { fieldFilter: { field: { fieldPath: 'parent' }, op: 'IN', value: { arrayValue: { values: parents.map((p) => ({ stringValue: p })) } } } },
        select: { fields: [{ fieldPath: 'id' }, { fieldPath: 'contentAt' }, { fieldPath: 'trashed' }] },
      },
    });
    const written = { work: [], diary: [] };
    for (const row of rows || []) {
      if (!row.document) continue;
      const n = fields(row.document.fields);
      if (n.trashed || !(n.contentAt > 1)) continue;
      const m = String(n.id).match(/^(.*)~(\d{4}-\d{2}-\d{2})$/);
      if (!m) continue;
      if (m[1] === workF) written.work.push(m[2]);
      if (m[1] === diaryF) written.diary.push(m[2]);
    }
    const dRows = await fsRequest(cfg, token, ':runQuery', {
      structuredQuery: {
        from: [{ collectionId: 'nodes' }],
        where: { fieldFilter: { field: { fieldPath: 'kind' }, op: 'EQUAL', value: { stringValue: 'dday' } } },
        select: { fields: [{ fieldPath: 'id' }, { fieldPath: 'data' }, { fieldPath: 'trashed' }] },
      },
    });
    const ddays = [];
    for (const row of dRows || []) {
      if (!row.document) continue;
      const n = fields(row.document.fields);
      if (n.trashed || !n.data) continue;
      try { for (const it of JSON.parse(n.data).items || []) ddays.push({ ...it, note: n.id }); } catch (e) {}
    }
    const data = { events, written, showDays, ddays, at: Date.now() };
    fm.writeString(cachePath, JSON.stringify(data));
    return { data, offline: false };
  } catch (e) {
    if (fm.fileExists(cachePath)) return { data: JSON.parse(fm.readString(cachePath)), offline: true, error: e.message };
    return { data: { events: [], written: { work: [], diary: [] } }, offline: true, error: e.message };
  }
}

// ---- 위젯 크기 (아이폰 화면별 큰 위젯 크기, 포인트) ----
// 화면 폭(pt) → 큰 위젯 [가로, 세로]. 표에 없는 폰이면 가장 가까운 값을 쓰고, 남는 자리는 빈칸이 흡수한다.
function largeSize() {
  const s = Device.screenSize();
  const w = Math.min(s.width, s.height), h = Math.max(s.width, s.height);
  if (w >= 428) return [364, 382]; // Pro Max, Plus
  if (w >= 414) return [360, 379]; // 11, XR, 11 Pro Max
  if (w >= 402) return [364, 382]; // 16 Pro, 17 Pro
  if (w >= 390) return [338, 354]; // 12~16 기본, 14 Pro, 15 Pro
  if (w >= 375 && h >= 800) return [329, 345]; // X, 11 Pro, mini
  if (w >= 375) return [321, 324]; // SE, 8
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
// 가로 상자 안에서 가운데 두기: 양옆에 늘어나는 빈칸. 아이폰은 빈칸에도 최소 8pt를 주므로 폭 30pt 이상인 상자에서만 쓸 것
function centered(stack, s, size, color, opt) {
  stack.addSpacer();
  const t = txt(stack, s, size, color, opt);
  stack.addSpacer();
  return t;
}

// ---- 큰 위젯: 이번 달 달력 (네이버 캘린더 위젯과 비슷한 짜임) ----
function buildLarge(w, data, cfg, note) {
  const [W, H] = largeSize();
  const P = 9;
  w.setPadding(P, P, P, P);
  const IW = W - P * 2; // 안쪽 폭
  const now = new Date();
  const today = ymd(now);
  const y = now.getFullYear(), m = now.getMonth() + 1;
  const first = new Date(y, m - 1, 1);
  const days = new Date(y, m, 0).getDate();
  const weeks = Math.ceil((first.getDay() + days) / 7);
  const cw = Math.floor(IW / 7);
  const NUM = 18; // 날짜 숫자 줄 높이 (오늘 동그라미 지름)
  const CHIP = 13, GAP = 2; // 일정 칩 높이·간격
  const headH = 24, wdH = 16;
  // 한 주에 들어갈 일정 줄 수: 남는 높이로 계산 (2~3줄)
  const rowSpace = (H - P * 2 - headH - wdH - 6) / weeks;
  const maxEv = Math.max(2, Math.min(3, Math.floor((rowSpace - NUM - 10) / (CHIP + GAP))));
  const work = new Set(data.written.work), diary = new Set(data.written.diary);

  // 머리: 가운데 "2026. 11."  오른쪽 끝에 상태
  const head = w.addStack();
  head.size = new Size(IW, headH);
  head.centerAlignContent();
  head.addSpacer();
  txt(head, `${y}. ${m}.`, 16, C.text, { bold: true });
  head.addSpacer();
  if (note) txt(head, note, 9, C.muted);
  w.addSpacer(2);

  // 요일
  const wd = w.addStack();
  wd.size = new Size(IW, wdH);
  WD.forEach((d, i) => {
    const c = wd.addStack();
    c.size = new Size(cw, wdH);
    c.centerAlignContent();
    centered(c, d, 10.5, i === 0 ? C.sun : i === 6 ? C.sat : C.muted);
  });

  for (let r = 0; r < weeks; r++) {
    // 주 사이 가는 구분선 (첫 주 위에는 없음), 남는 높이는 구분선 위 빈칸이 고르게 가져간다
    if (r > 0) {
      w.addSpacer();
      const line = w.addStack();
      line.size = new Size(IW, 0.5);
      line.backgroundColor = C.line;
      w.addSpacer(3);
    } else w.addSpacer(3);

    const row = w.addStack();
    row.size = new Size(IW, 0); // 높이는 내용에 맞게
    row.topAlignContent();
    for (let c = 0; c < 7; c++) {
      const d = new Date(y, m - 1, 1 - first.getDay() + r * 7 + c);
      const key = ymd(d);
      const inMonth = d.getMonth() === m - 1;
      const hol = HOLIDAYS[key];
      const cell = row.addStack();
      cell.size = new Size(cw, 0);
      cell.layoutVertically();
      cell.setPadding(0, 1, 0, 1);
      if (cfg.appUrl) cell.url = `${cfg.appUrl}#cal=${key}`;

      // 날짜 숫자 (가운데) — 일지·일기 쓴 날은 오른쪽에 작은 점. 양쪽에 같은 폭을 두어 숫자가 늘 가운데 온다
      const top = cell.addStack();
      top.size = new Size(cw - 2, NUM);
      top.centerAlignContent();
      // 크기를 정한 가로 묶음은 내용이 좁으면 iOS가 가운데에 놓는다 → 여백 계산 없이 양쪽 6pt 상자만 두면 숫자가 정확히 가운데
      const padL = top.addStack(); padL.size = new Size(6, NUM);
      const num = top.addStack();
      num.size = new Size(NUM, NUM);
      num.centerAlignContent();
      if (key === today) { num.backgroundColor = C.accent; num.cornerRadius = NUM / 2; }
      const color = key === today ? C.accentInk : !inMonth ? C.faint : (c === 0 || hol) ? C.sun : c === 6 ? C.sat : C.text;
      txt(num, d.getDate(), 12, color, { bold: key === today });
      const padR = top.addStack(); padR.size = new Size(6, NUM); padR.centerAlignContent();
      if (inMonth && (work.has(key) || diary.has(key))) {
        padR.addSpacer(2);
        const dot = padR.addStack();
        dot.size = new Size(4, 4);
        dot.cornerRadius = 2;
        dot.backgroundColor = C.accent;
      }

      // 일정 칩: 공휴일 이름도 한 줄 차지. 줄 수는 늘 같게 채워 모든 주의 높이를 맞춘다
      const items = [];
      if (inMonth && hol) items.push({ title: hol, color: null, first: true });
      if (inMonth) for (const o of observancesOf(key, data.showDays)) items.push({ title: o.name, color: null, first: true, obs: true });
      if (inMonth) for (const o of eventsOn(data.events, key)) items.push({ title: o.ev.title || '·', color: o.ev.color || 'green', first: o.first });
      const shown = items.length > maxEv ? maxEv - 1 : Math.min(items.length, maxEv);
      for (let i = 0; i < maxEv; i++) {
        cell.addSpacer(GAP);
        const b = cell.addStack();
        b.size = new Size(cw - 2, CHIP);
        b.centerAlignContent();
        if (i < shown) {
          const it = items[i];
          const col = it.color ? evColor(it.color) : it.obs ? C.muted : C.sun;
          b.backgroundColor = it.color ? evColor(it.color, 0.18) : Color.dynamic(new Color('#000000', 0.05), new Color('#ffffff', 0.08));
          b.cornerRadius = 3;
          const bar = b.addStack();
          bar.size = new Size(it.first ? 2 : 0.01, CHIP);
          bar.backgroundColor = col;
          b.addSpacer(2);
          const t = txt(b, it.title, 9.5, it.color ? C.text : it.obs ? C.muted : C.sun);
          t.minimumScaleFactor = 0.8;
          // 짧은 제목은 iOS가 칩 가운데로 보내므로 뒤에 빈칸을 두어 왼쪽에 붙인다 (긴 제목은 어차피 꽉 차서 그대로)
          const est = [...String(it.title)].reduce((a, ch) => a + (ch.charCodeAt(0) > 0x2e80 ? 9.5 : 5.3), 0);
          if (est < cw - 2 - 4 - 8) b.addSpacer();
        } else if (i === shown && items.length > maxEv) {
          b.addSpacer(4);
          txt(b, `+${items.length - shown}`, 9, C.muted);
          b.addSpacer();
        }
      }
    }
  }
  w.addSpacer(2);
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

// ---- D-day 위젯: 가까운 순 (며칠째는 맨 위). 작은 크기는 첫 항목을 크게 ----
function buildDday(w, data, cfg, fam, note) {
  const t = parseKey(ymd(new Date()));
  const list = (data.ddays || []).map((it) => ({ it, info: ddayInfo(it, t) })).sort((a, b) => a.info.sort - b.info.sort);
  const link = (o) => (cfg.appUrl ? `${cfg.appUrl}#dday=${encodeURIComponent(o.it.note || '')}` : null);
  if (!list.length) {
    w.setPadding(14, 14, 14, 14);
    txt(w, 'D-day', 13, C.text, { bold: true });
    w.addSpacer(6);
    const t2 = txt(w, '메모장 앱의 D-day에서 항목을 추가하세요', 11, C.muted);
    t2.lineLimit = 3;
    w.addSpacer();
    return;
  }
  if (fam === 'small') {
    const o = list[0];
    w.setPadding(14, 14, 14, 14);
    if (link(o)) w.url = link(o);
    const nm = txt(w, o.it.name, 12, C.muted, { bold: true });
    nm.lineLimit = 2;
    w.addSpacer(4);
    const big = txt(w, o.info.big, 30, ddayColor(o.info.cls), { bold: true });
    big.minimumScaleFactor = 0.5;
    w.addSpacer(2);
    txt(w, o.info.sub, 10.5, C.muted);
    w.addSpacer();
    if (list[1]) {
      const r = w.addStack();
      r.centerAlignContent();
      txt(r, list[1].info.big, 10.5, ddayColor(list[1].info.cls), { bold: true });
      r.addSpacer(4);
      txt(r, list[1].it.name, 10.5, C.muted);
    }
    return;
  }
  const large = fam === 'large';
  w.setPadding(14, 16, 14, 16);
  const head = w.addStack();
  head.centerAlignContent();
  txt(head, 'D-day', 15, C.text, { bold: true });
  head.addSpacer();
  if (note) txt(head, note, 9, C.muted);
  w.addSpacer(large ? 10 : 6);
  const max = large ? 9 : 4;
  list.slice(0, max).forEach((o, i) => {
    if (i) w.addSpacer(large ? 9 : 5);
    const r = w.addStack();
    r.centerAlignContent();
    if (link(o)) r.url = link(o);
    const num = r.addStack();
    num.size = new Size(large ? 86 : 76, 0);
    const n = txt(num, o.info.big, large ? 18 : 15, ddayColor(o.info.cls), { bold: true });
    n.minimumScaleFactor = 0.6;
    num.addSpacer();
    r.addSpacer(6);
    const col = r.addStack();
    col.layoutVertically();
    txt(col, o.it.name, large ? 13.5 : 12.5, o.info.cls === 'past' ? C.muted : C.text, { bold: true });
    if (large) txt(col, o.info.sub, 10.5, C.muted);
    r.addSpacer();
    if (!large) txt(r, o.info.sub, 10, C.muted);
  });
  if (list.length > max) { w.addSpacer(4); txt(w, `외 ${list.length - max}개`, 10, C.muted); }
  w.addSpacer();
}

// ---- 실행 ----
async function main() {
  let cfg = loadCfg();
  let fam = config.widgetFamily || 'large';
  // 위젯 편집의 Parameter 칸에 dday(또는 디데이) → D-day 위젯
  let mode = /^\s*(d-?day|디데이)\s*$/i.test(args.widgetParameter || '') ? 'dday' : 'cal';
  if (!config.runsInWidget) {
    if (!cfg) cfg = await setup(null);
    else {
      const a = new Alert();
      a.title = '내 메모장 위젯';
      a.addAction('큰 위젯 미리보기');
      a.addAction('중간 위젯 미리보기');
      a.addAction('D-day 위젯 미리보기 (중간)');
      a.addAction('D-day 위젯 미리보기 (작은)');
      a.addAction('설정 다시 하기');
      a.addCancelAction('닫기');
      const i = await a.present();
      if (i === 4) cfg = await setup(cfg);
      if (i === -1) { Script.complete(); return; }
      fam = i === 1 || i === 2 ? 'medium' : i === 3 ? 'small' : 'large';
      if (i === 2 || i === 3) mode = 'dday';
    }
  }
  const w = new ListWidget();
  w.backgroundColor = C.bg;
  if (!cfg || !cfg.refreshToken) {
    txt(w, 'Scriptable 앱에서 이 스크립트를 한 번 실행해 설정하세요', 12, C.muted);
  } else {
    const { data, offline, error } = await loadData(cfg);
    const note = offline ? (data.events.length || data.written.work.length || (data.ddays || []).length ? '오프라인' : `⚠ ${error}`) : null;
    if (mode === 'dday') {
      if (cfg.appUrl) w.url = `${cfg.appUrl}#dday`;
      buildDday(w, data, cfg, fam, note);
    } else {
      if (fam === 'small') buildSmall(w, data);
      else if (fam === 'medium') buildMedium(w, data, cfg, note);
      else buildLarge(w, data, cfg, note);
      if (cfg.appUrl) w.url = `${cfg.appUrl}#cal`;
    }
  }
  // 30분마다 새로 그림 (실제 간격은 iOS가 정함)
  w.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000);
  if (config.runsInWidget) Script.setWidget(w);
  else if (fam === 'medium') await w.presentMedium();
  else if (fam === 'small') await w.presentSmall();
  else await w.presentLarge();
  Script.complete();
}

await main();
