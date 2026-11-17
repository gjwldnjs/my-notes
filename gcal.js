// 구글 캘린더 양방향 동기화
//
// 연결: 구글 로그인 창에서 "캘린더 일정 보기·수정" 권한을 받아 1시간짜리 출입증(access token)을 얻는다.
//       출입증은 이 기기에만 저장. 1시간이 지나면 캘린더 화면의 "구글 다시 연결"을 한 번 눌러야 한다.
// 한 번 동기화할 때:
//   1) 받아 오기: 지난번 이후 구글에서 바뀐 일정(지운 것 포함)을 앱 캘린더에 반영
//   2) 올리기  : 앱에서 새로 만들거나 고친 일정을 구글에 반영, 앱에서 지운 일정은 구글에서도 지움
// 일정마다 구글 짝의 번호(gId)와 마지막으로 맞춘 시각(st)을 적어 둔다. 앱에서 고친 시각(mt)이 st보다 늦으면 "올릴 것".
// 같은 일정을 양쪽에서 다 고쳤으면 더 나중에 고친 쪽이 이긴다.
// 이 표시는 캘린더 자료 안에 저장되므로, 출입증이 없는 다른 기기에서 고친 것도 다음 동기화 때 함께 올라간다.

import * as F from './vendor/firebase.js';
import { firebaseConfig } from './firebase-config.js';
import * as S from './store.js';
import { state } from './store.js';
import { ymd } from './dom.js';

const API = 'https://www.googleapis.com/calendar/v3';
const SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const TOKEN_KEY = 'gcal-token' + (S.PROFILE ? '-' + S.PROFILE : '');
const CAL = 'primary'; // 구글의 기본 캘린더
const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Seoul';
const PAST_DAYS = 180; // 처음 받아 올 때 이만큼 지난 일정부터

// 앱 색 ↔ 구글 색 번호
const TO_G = { green: '10', blue: '9', red: '11', yellow: '5', purple: '3' };
const FROM_G = { 1: 'purple', 2: 'green', 3: 'purple', 4: 'red', 5: 'yellow', 6: 'red', 7: 'blue', 8: 'blue', 9: 'blue', 10: 'green', 11: 'red' };

// ---- 상태 (화면에 보여 줄 것) ----
let status = { busy: false, at: 0, error: '' };
const subs = new Set();
export const onStatus = (fn) => { subs.add(fn); return () => subs.delete(fn); };
const setStatus = (p) => { status = { ...status, ...p }; subs.forEach((f) => f(status)); };
export const getStatus = () => status;

export const isOn = () => !!state.settings.gcal?.on;
export const email = () => state.settings.gcal?.email || '';

// ---- 출입증 ----
function readToken() {
  try { const t = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null'); return t && t.exp > Date.now() + 60e3 ? t : null; } catch { return null; }
}
export const hasToken = () => !!readToken();

// 구글 로그인 창 (누른 직후에만 열 수 있다: 브라우저가 저절로 뜨는 창은 막음)
export async function connect() {
  const app = F.initializeApp(firebaseConfig, 'gcal-' + (S.PROFILE || 'main'));
  const auth = F.getAuth(app);
  const p = new F.GoogleAuthProvider();
  p.addScope(SCOPE);
  p.setCustomParameters(email() ? { login_hint: email() } : { prompt: 'select_account' });
  const res = await F.signInWithPopup(auth, p);
  const cred = F.GoogleAuthProvider.credentialFromResult(res);
  if (!cred?.accessToken) throw new Error('구글에서 권한을 받지 못했어요');
  try { localStorage.setItem(TOKEN_KEY, JSON.stringify({ token: cred.accessToken, exp: Date.now() + 55 * 60e3 })); } catch {}
  const mail = res.user?.email || '';
  F.signOut(auth).catch(() => {}); // 출입증만 쓰고 이 보조 로그인은 바로 닫는다
  if (!isOn() || email() !== mail) S.setSettings({ gcal: { on: true, email: mail } });
  setStatus({ error: '' });
  return mail;
}

// 연결 끊기: 앞으로 주고받지 않음. 이미 맞춰 둔 일정은 양쪽에 그대로 남는다
export function disconnect() {
  try { localStorage.removeItem(TOKEN_KEY); } catch {}
  S.setSettings({ gcal: { on: false } });
  const n = calNode();
  if (n) {
    const d = structuredClone(n.data || {});
    for (const e of d.events || []) { delete e.gId; delete e.gUp; delete e.st; delete e.gRule; delete e.dur; delete e.gEx; }
    delete d.gdel; delete d.gsync;
    S.setData(n.id, d);
  }
  setStatus({ at: 0, error: '' });
}

class NeedAuth extends Error {}
async function api(method, path, body) {
  const t = readToken();
  if (!t) throw new NeedAuth('구글 연결 시간이 지났어요');
  const r = await fetch(API + path, {
    method,
    headers: { Authorization: `Bearer ${t.token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (r.status === 401) { try { localStorage.removeItem(TOKEN_KEY); } catch {} throw new NeedAuth('구글 연결 시간이 지났어요'); }
  if (r.status === 404 || r.status === 410) return { gone: true };
  if (r.status === 204) return {};
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = j?.error?.message || `구글 오류 ${r.status}`;
    throw new Error(/has not been used|is disabled/i.test(msg) ? '구글 Cloud에서 Calendar API를 켜야 해요' : msg);
  }
  return j;
}

// ---- 날짜 변환 ----
const p2 = (n) => String(n).padStart(2, '0');
const parseKey = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (key, k) => { const d = parseKey(key); d.setDate(d.getDate() + k); return ymd(d); };
const hm = (d) => `${p2(d.getHours())}:${p2(d.getMinutes())}`;
const localISO = (d) => `${ymd(d)}T${hm(d)}:00`;
const compact = (key, time) => key.replace(/-/g, '') + (time ? `T${time.replace(':', '')}00` : '');

function stripHtml(s) {
  return String(s || '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ').trim();
}

// 구글 반복 규칙 → 앱 반복. 앱이 못 따라 하는 규칙(격주, 몇 번만, 여러 요일 등)은 ok:false
function parseRule(rec) {
  let repeat = 'none', ok = true;
  const skip = [];
  for (const line of rec || []) {
    if (line.startsWith('RRULE:')) {
      const p = Object.fromEntries(line.slice(6).split(';').map((x) => x.split('=')));
      const f = { DAILY: 'daily', WEEKLY: 'weekly', MONTHLY: 'monthly', YEARLY: 'yearly' }[p.FREQ];
      const extra = Object.keys(p).filter((k) => !['FREQ', 'WKST', 'BYDAY', 'BYMONTHDAY', 'BYMONTH'].includes(k) && !(k === 'INTERVAL' && p[k] === '1'));
      if (!f || extra.length || (p.BYDAY && (p.BYDAY.includes(',') || /\d/.test(p.BYDAY)))) ok = false;
      else repeat = f;
    } else if (line.startsWith('EXDATE')) {
      for (const v of (line.split(':')[1] || '').split(',')) {
        const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?/);
        if (!m) continue;
        skip.push(m[7] ? ymd(new Date(Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5]))) : `${m[1]}-${m[2]}-${m[3]}`);
      }
    } else ok = false;
  }
  return { repeat, skip, ok };
}

// 구글 일정 → 앱 일정의 내용 부분
function fromG(g) {
  const out = { title: (g.summary || '').trim() || '(제목 없음)', memo: stripHtml(g.description), color: FROM_G[g.colorId] || 'blue' };
  if (g.start?.date) {
    out.date = g.start.date;
    const last = addDays(g.end?.date || g.start.date, -1);
    out.end = last > out.date ? last : '';
    out.time = '';
    out.dur = null;
  } else {
    const s = new Date(g.start.dateTime), e = new Date(g.end?.dateTime || g.start.dateTime);
    out.date = ymd(s);
    out.time = hm(s);
    out.end = ymd(e) > out.date ? ymd(e) : '';
    out.dur = Math.max(0, Math.round((e - s) / 60e3));
  }
  const r = parseRule(g.recurrence);
  out.repeat = r.ok ? r.repeat : 'none';
  out.gRule = r.ok ? null : (g.recurrence || null); // 앱이 못 따라 하는 반복은 원래 규칙을 그대로 보관
  out.skip = r.skip;
  return out;
}

// 앱 일정 → 구글 일정
function toG(ev) {
  const g = { summary: ev.title || '(제목 없음)', description: ev.memo || '', colorId: TO_G[ev.color || 'green'] };
  if (!ev.time) {
    g.start = { date: ev.date };
    g.end = { date: addDays(ev.end || ev.date, 1) };
  } else {
    const [hh, mm] = ev.time.split(':').map(Number);
    const s = parseKey(ev.date); s.setHours(hh, mm);
    // 끝 시각: 구글에서 온 일정은 원래 길이(dur), 앱에서 만든 건 1시간. 여러 날 일정이면 끝나는 날까지는 늘린다
    let e = new Date(s.getTime() + (ev.dur ?? 60) * 60e3);
    if (ev.end) { const x = parseKey(ev.end); x.setHours(hh, mm); if (x > e) e = x; }
    g.start = { dateTime: localISO(s), timeZone: TZ };
    g.end = { dateTime: localISO(e), timeZone: TZ };
  }
  const freq = { daily: 'DAILY', weekly: 'WEEKLY', monthly: 'MONTHLY', yearly: 'YEARLY' }[ev.repeat];
  if (freq) {
    g.recurrence = [`RRULE:FREQ=${freq}`];
    // 구글에서 그 회차만 옮긴 날(gEx)은 빼고 적는다: 적으면 구글이 옮긴 회차까지 지워 버린다
    const ex = (ev.skip || []).filter((k) => !(ev.gEx || []).includes(k));
    if (ex.length) g.recurrence.push(ev.time ? `EXDATE;TZID=${TZ}:${ex.map((k) => compact(k, ev.time)).join(',')}` : `EXDATE;VALUE=DATE:${ex.map((k) => compact(k)).join(',')}`);
  } else if (ev.gRule) g.recurrence = ev.gRule;
  else g.recurrence = [];
  g.extendedProperties = { private: { mnId: ev.id } };
  return g;
}

// ---- 동기화 ----
const calNode = () => { const n = S.get(state.settings.calNote); return n && !S.inTrash(n.id) && !n.pending ? n : null; };
// 늘 최신 자료에 고친다 (기다리는 사이 화면에서 고친 것을 덮어쓰지 않게)
function edit(fn) {
  const n = calNode();
  if (!n) return;
  const d = structuredClone(n.data || {});
  d.events ||= [];
  if (fn(d) !== false) S.setData(n.id, d);
}

let running = null, again = false;
export function sync() {
  if (running) { again = true; return running; }
  running = (async () => {
    try {
      do { again = false; await syncOnce(); } while (again);
      setStatus({ busy: false, at: Date.now(), error: '' });
    } catch (e) {
      setStatus({ busy: false, error: e instanceof NeedAuth ? 'auth' : (e.message || String(e)) });
    } finally { running = null; }
  })();
  return running;
}

async function syncOnce() {
  if (!isOn() || !calNode()) return;
  if (!readToken()) throw new NeedAuth('구글 연결 시간이 지났어요');
  setStatus({ busy: true });
  const startedAt = new Date().toISOString();
  const last = calNode().data?.gsync?.at;

  // 1) 받아 오기
  const got = [];
  let page = '';
  do {
    const q = new URLSearchParams({ showDeleted: 'true', maxResults: '250', singleEvents: 'false' });
    if (last) q.set('updatedMin', new Date(Date.parse(last) - 2 * 60e3).toISOString());
    else q.set('timeMin', new Date(Date.now() - PAST_DAYS * 864e5).toISOString());
    if (page) q.set('pageToken', page);
    const j = await api('GET', `/calendars/${CAL}/events?${q}`);
    got.push(...(j.items || []));
    page = j.nextPageToken || '';
  } while (page);

  const now = Date.now();
  edit((d) => {
    const byG = new Map(d.events.filter((e) => e.gId).map((e) => [e.gId, e]));
    const byId = new Map(d.events.map((e) => [e.id, e]));
    const gone = new Set(d.gdel || []);
    let changed = false;
    // 반복 일정 원본을 먼저, 그 회차만 바꾼 것(예외)은 나중에
    got.sort((a, b) => (a.recurringEventId ? 1 : 0) - (b.recurringEventId ? 1 : 0));
    for (const g of got) {
      if (gone.has(g.id)) continue; // 앱에서 지워서 곧 구글에서도 지울 것
      if (g.recurringEventId) {
        // 반복 일정 중 한 회차만 지우거나 고친 것: 원본에서 그날을 빼고, 고친 회차는 따로 한 개 일정으로
        const master = byG.get(g.recurringEventId);
        const o = g.originalStartTime;
        const day = o ? (o.date || ymd(new Date(o.dateTime))) : null;
        if (master && day && !(master.skip || []).includes(day)) { master.skip = [...(master.skip || []), day]; changed = true; }
        if (master && day && g.status !== 'cancelled' && !(master.gEx || []).includes(day)) { master.gEx = [...(master.gEx || []), day]; changed = true; }
        if (g.status === 'cancelled') {
          const cur = byG.get(g.id);
          if (cur) { d.events = d.events.filter((e) => e !== cur); changed = true; }
          continue;
        }
      }
      const own = byG.get(g.id) || byId.get(g.extendedProperties?.private?.mnId);
      if (g.status === 'cancelled') {
        if (own) { d.events = d.events.filter((e) => e !== own); byG.delete(g.id); changed = true; }
        continue;
      }
      if (own) {
        if (own.gUp === g.updated && own.gId === g.id) continue;
        const dirty = (own.mt || 0) > (own.st || 0);
        if (dirty && own.mt > Date.parse(g.updated)) { own.gId = g.id; continue; } // 앱에서 더 나중에 고침 → 올리기에서 덮는다
        const f = fromG(g);
        if (own.gEx?.length) f.skip = [...new Set([...f.skip, ...own.gEx])]; // 옮긴 회차의 원래 날은 계속 빼 둔다
        Object.assign(own, f, { gId: g.id, gUp: g.updated, st: now });
        if (!own.gRule) delete own.gRule;
        byG.set(g.id, own);
      } else {
        const ev = { id: S.uid(), ...fromG(g), gId: g.id, gUp: g.updated, st: now };
        if (!ev.gRule) delete ev.gRule;
        d.events.push(ev);
        byG.set(g.id, ev);
      }
      changed = true;
    }
    return changed;
  });

  // 2) 올리기: 앱에서 지운 것
  for (const gid of [...(calNode().data?.gdel || [])]) {
    await api('DELETE', `/calendars/${CAL}/events/${encodeURIComponent(gid)}`);
    edit((d) => { d.gdel = (d.gdel || []).filter((x) => x !== gid); if (!d.gdel.length) delete d.gdel; });
  }
  // 앱에서 새로 만들었거나 고친 것
  const todo = (calNode().data?.events || []).filter((e) => !e.gId || (e.mt || 0) > (e.st || 0));
  for (const ev of todo) {
    let res = ev.gId ? await api('PATCH', `/calendars/${CAL}/events/${encodeURIComponent(ev.gId)}`, toG(ev)) : null;
    if (!ev.gId || res?.gone) res = await api('POST', `/calendars/${CAL}/events`, toG(ev)); // 구글에서 사라졌으면 새로 만든다
    const at = Date.now();
    edit((d) => {
      const cur = d.events.find((e) => e.id === ev.id);
      if (!cur) { (d.gdel ||= []).push(res.id); return; } // 올리는 사이 앱에서 지웠다 → 다음에 구글에서도 지움
      cur.gId = res.id;
      cur.gUp = res.updated;
      if ((cur.mt || 0) <= (ev.mt || 0)) cur.st = at; // 올리는 사이 또 고쳤으면 다음에 다시 올린다
    });
  }

  edit((d) => { d.gsync = { at: startedAt }; });
}

// 캘린더를 고치면 잠깐 뒤 자동으로 (출입증이 살아 있을 때만)
let timer = 0;
export function schedule(ms = 2500) {
  if (!isOn() || !readToken()) return;
  clearTimeout(timer);
  timer = setTimeout(() => sync(), ms);
}
// 앱을 다시 볼 때·5분마다 받아 오기
export function startAuto() {
  const tick = () => { if (document.visibilityState === 'visible' && isOn() && readToken() && Date.now() - status.at > 60e3) sync(); };
  document.addEventListener('visibilitychange', tick);
  setInterval(tick, 5 * 60e3);
  setTimeout(tick, 1500);
}

// 앱에서 일정을 지울 때: 구글 짝이 있으면 지울 목록에 넣는다
export function noteDelete(d, ev) {
  if (ev?.gId) (d.gdel ||= []).push(ev.gId);
}
