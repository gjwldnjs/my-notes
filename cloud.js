// 로그인(Firebase Auth)과 메모 동기화(Firestore)
//
// 서버 구조: users/{로그인한 사람 uid}/nodes/{메모 id}
//   메모·폴더 문서  : 이름·위치·시각·본문 (data는 JSON 글자로)
//   지운 항목 문서  : { id, deletedAt }
//   '__settings'   : 설정
//   모든 문서에 serverAt(서버가 찍는 시각)이 있어서, 지난번 이후 바뀐 것만 받아 온다.
// 보안 규칙(firestore.rules)으로 자기 uid 아래만 읽고 쓸 수 있다.
//
// 합치는 규칙은 GitHub 때와 같다: 항목마다 이름·위치(metaAt), 본문(contentAt) 중 더 최근 것이 이긴다.

import * as F from './vendor/firebase.js';
import { firebaseConfig } from './firebase-config.js';
import * as S from './store.js';
import { state } from './store.js';

// 개발용: 주소에 ?emu 를 붙이면 내 컴퓨터의 가짜 Firebase(에뮬레이터)에 연결
const EMU = new URLSearchParams(location.search).has('emu');
const cfg = EMU ? { apiKey: 'demo-key', projectId: 'demo-my-notes', authDomain: 'localhost' } : firebaseConfig;
const ready = !!(cfg && cfg.apiKey);
let auth = null, db = null;
if (ready) {
  const app = F.initializeApp(cfg, S.PROFILE ? 'profile-' + S.PROFILE : '[DEFAULT]');
  auth = F.getAuth(app);
  db = F.initializeFirestore(app, { localCache: F.memoryLocalCache() });
  if (EMU) {
    F.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    F.connectFirestoreEmulator(db, '127.0.0.1', 8080);
  }
}
export const isReady = () => ready;

// ---- 상태 표시 ----
let status = { kind: 'off', msg: '' };
let onStatus = () => {};
export function onSyncStatus(fn) { onStatus = fn; fn(status); }
export const getStatus = () => status;
function setStatus(kind, msg = '') { status = { kind, msg, at: Date.now() }; onStatus(status); }

const stamp = (n) => `${n.metaAt}|${n.contentAt}`;
const untouchedSeed = (n) => n.metaAt <= 0 && n.contentAt <= 0;

// 아직 서버에 안 올라간 항목 수
export function unpushedCount() {
  if (!user) return 0;
  const P = state.sync.pushed || {};
  let c = 0;
  for (const n of Object.values(state.nodes)) if (!n.pending && !untouchedSeed(n) && P[n.id] !== stamp(n)) c++;
  for (const [id, ts] of Object.entries(state.deleted)) if (!state.nodes[id] && P[id] !== `del:${ts}`) c++;
  if (state.settingsAt && P.__settings !== state.settingsAt) c++;
  return c;
}

function refresh() {
  if (!ready || !user) return setStatus('off');
  if (status.kind === 'error' && errorSticky) return;
  if (navigator.onLine === false) return setStatus('offline');
  if (!firstSnap || pushing) return setStatus('syncing');
  setStatus(unpushedCount() ? 'pending' : 'ok');
}

function explain(e) {
  const c = e?.code || '';
  if (c === 'permission-denied') return '서버가 막았어요. Firestore 보안 규칙이 적용됐는지 확인해 주세요.';
  if (c === 'unavailable') return '서버에 연결할 수 없어요. 인터넷이 돌아오면 자동으로 다시 해요.';
  if (c === 'resource-exhausted') return '오늘 무료 사용량을 다 썼어요. 내일 다시 동기화돼요. 메모는 이 기기에 안전하게 있어요.';
  if (c === 'unauthenticated') return '로그인이 풀렸어요. 다시 로그인해 주세요.';
  return `동기화 오류: ${e?.message || e}`;
}

// ---- 로그인한 사람 ----
let user = null;
const userSubs = new Set();
export const currentUser = () => user;
export function onUser(fn) { userSubs.add(fn); fn(user); }

export function start() {
  if (!ready) { setStatus('off'); return; }
  F.onAuthStateChanged(auth, async (u) => {
    stopListen();
    user = u;
    if (u) await adopt(u);
    userSubs.forEach((f) => f(user));
    if (u) listen();
    else setStatus('off');
  });
  window.addEventListener('online', () => { if (user) schedulePush(0); refresh(); });
  window.addEventListener('offline', refresh);
}

// 이 기기의 메모가 누구 것인지 정리
async function adopt(u) {
  if (state.sync.owner && state.sync.owner !== u.uid) await S.wipeLocal(); // 다른 계정 메모가 남아 있으면 지움
  if (state.sync.owner !== u.uid) {
    // 처음 로그인한 기기: 지금 있는 메모는 이 계정으로 올라간다
    state.sync.owner = u.uid;
    state.sync.pushed = {};
    state.sync.serverAt = 0;
    S.persist(true);
  }
}

// ---- 받기 (실시간) ----
let unsub = null;
let firstSnap = false;
let errorSticky = false;

function listen() {
  firstSnap = false;
  errorSticky = false;
  setStatus('syncing');
  const since = F.Timestamp.fromMillis(Math.max(0, (state.sync.serverAt || 0) - 2000));
  const q = F.query(F.collection(db, 'users', user.uid, 'nodes'), F.where('serverAt', '>=', since));
  unsub = F.onSnapshot(q, (snap) => {
    const list = snap.docChanges()
      .filter((c) => c.type !== 'removed' && !c.doc.metadata.hasPendingWrites)
      .map((c) => c.doc.data());
    if (list.length) mergeRemote(list);
    if (!firstSnap) { firstSnap = true; schedulePush(0); }
    refresh();
  }, (err) => {
    console.error(err);
    errorSticky = true;
    setStatus('error', explain(err));
  });
}
function stopListen() { unsub?.(); unsub = null; firstSnap = false; }

function mergeRemote(list) {
  const L = state;
  const P = L.sync.pushed;
  let maxServer = L.sync.serverAt || 0;
  for (const r of list) {
    const sa = r.serverAt?.toMillis?.() || 0;
    if (sa > maxServer) maxServer = sa;
    if (!r.id) continue;
    if (r.id === '__settings') {
      if ((r.settingsAt || 0) > (L.settingsAt || 0)) { L.settings = { ...L.settings, ...r.settings }; L.settingsAt = r.settingsAt; }
      if (L.settingsAt === r.settingsAt) P.__settings = r.settingsAt;
      continue;
    }
    if (r.deletedAt) {
      L.deleted[r.id] = Math.max(L.deleted[r.id] || 0, r.deletedAt);
      const n = L.nodes[r.id];
      if (n && Math.max(n.metaAt, n.contentAt) <= r.deletedAt) delete L.nodes[r.id];
      if (!L.nodes[r.id]) P[r.id] = `del:${L.deleted[r.id]}`;
      continue;
    }
    if ((L.deleted[r.id] || 0) >= Math.max(r.metaAt, r.contentAt)) continue;
    let n = L.nodes[r.id];
    if (!n) n = L.nodes[r.id] = { id: r.id, content: '', data: null, metaAt: -1, contentAt: -1 };
    if (r.metaAt > n.metaAt) for (const k of S.META_FIELDS) n[k] = r[k] ?? null;
    if (r.contentAt > n.contentAt) {
      n.content = r.content || '';
      try { n.data = r.data ? JSON.parse(r.data) : null; } catch { n.data = null; }
      n.contentAt = r.contentAt;
    }
    if (n.metaAt === r.metaAt && n.contentAt === r.contentAt) P[r.id] = stamp(n);
  }
  L.sync.serverAt = maxServer;
  S.repair();
  S.persist();
  S.emit('remote');
}

// ---- 올리기 ----
let pushT = null, pushing = false, again = false;
export function schedulePush(ms = 1500) {
  if (!user) return;
  clearTimeout(pushT);
  pushT = setTimeout(push, ms);
  if (!pushing && firstSnap) setStatus(navigator.onLine === false ? 'offline' : 'pending');
}

const toDoc = (n) => ({
  id: n.id, type: n.type, kind: n.kind ?? null, name: n.name ?? '', parent: n.parent ?? null, pos: n.pos ?? 0,
  created: n.created ?? 0, metaAt: n.metaAt, contentAt: n.contentAt, trashed: n.trashed ?? null,
  content: n.content ?? '', data: n.data ? JSON.stringify(n.data) : null,
});

async function push() {
  if (!user || !firstSnap) return;
  if (pushing) { again = true; return; }
  pushing = true;
  const uid = user.uid;
  try {
    const P = state.sync.pushed;
    const ops = [];
    for (const n of Object.values(state.nodes)) {
      if (n.pending || untouchedSeed(n)) continue;
      const st = stamp(n);
      if (P[n.id] !== st) ops.push({ id: n.id, st, data: toDoc(n) });
    }
    for (const [id, ts] of Object.entries(state.deleted)) {
      if (state.nodes[id]) continue;
      const st = `del:${ts}`;
      if (P[id] !== st) ops.push({ id, st, data: { id, deletedAt: ts } });
    }
    if (state.settingsAt && P.__settings !== state.settingsAt) {
      ops.push({ id: '__settings', st: state.settingsAt, data: { id: '__settings', settings: state.settings, settingsAt: state.settingsAt } });
    }
    if (!ops.length) return;
    setStatus('syncing');
    for (let i = 0; i < ops.length; i += 400) {
      const part = ops.slice(i, i + 400);
      const b = F.writeBatch(db);
      for (const o of part) b.set(F.doc(db, 'users', uid, 'nodes', o.id), { ...o.data, serverAt: F.serverTimestamp() });
      await b.commit();
      if (!user || user.uid !== uid) return;
      for (const o of part) P[o.id] = o.st;
      S.persist();
    }
    errorSticky = false;
  } catch (e) {
    console.error(e);
    errorSticky = e?.code !== 'unavailable';
    setStatus(e?.code === 'unavailable' ? 'offline' : 'error', explain(e));
  } finally {
    pushing = false;
    if (again) { again = false; schedulePush(300); } else refresh();
  }
}

// 지금 바로 올리기 (설정 화면·Ctrl+S)
export function syncNow() { errorSticky = false; schedulePush(0); }

// ---- 로그인·로그아웃 ----
export async function signInGoogle() {
  const p = new F.GoogleAuthProvider();
  p.setCustomParameters({ prompt: 'select_account' });
  return F.signInWithPopup(auth, p);
}
export const signInEmail = (email, pw) => F.signInWithEmailAndPassword(auth, email, pw);
export const signUpEmail = (email, pw) => F.createUserWithEmailAndPassword(auth, email, pw);
export const resetPassword = (email) => F.sendPasswordResetEmail(auth, email);

// 로그아웃: 남은 것 올리고(최대 6초), 이 기기의 메모를 지운다 (다음 사람이 못 보게)
export async function logout() {
  clearTimeout(pushT);
  if (unpushedCount()) await Promise.race([push(), new Promise((r) => setTimeout(r, 6000))]);
  const left = unpushedCount();
  stopListen();
  await F.signOut(auth);
  await S.wipeLocal();
  return left;
}

export function authError(e) {
  const c = e?.code || '';
  const M = {
    'auth/invalid-credential': '이메일이나 비밀번호가 맞지 않아요.',
    'auth/wrong-password': '비밀번호가 맞지 않아요.',
    'auth/user-not-found': '가입하지 않은 이메일이에요.',
    'auth/email-already-in-use': '이미 가입한 이메일이에요. 로그인해 주세요.',
    'auth/weak-password': '비밀번호는 6자 이상이어야 해요.',
    'auth/invalid-email': '이메일 형식이 맞지 않아요.',
    'auth/missing-password': '비밀번호를 넣어 주세요.',
    'auth/popup-blocked': '팝업이 막혔어요. 브라우저에서 팝업을 허용하거나 이메일로 로그인해 주세요.',
    'auth/popup-closed-by-user': '로그인 창이 닫혔어요.',
    'auth/cancelled-popup-request': '로그인 창이 닫혔어요.',
    'auth/network-request-failed': '인터넷 연결을 확인해 주세요.',
    'auth/unauthorized-domain': '이 주소는 로그인이 허용되지 않았어요. Firebase 승인된 도메인에 추가해야 해요.',
    'auth/operation-not-allowed': '이 로그인 방법이 아직 꺼져 있어요. Firebase에서 사용 설정해야 해요.',
    'auth/too-many-requests': '시도가 너무 많아요. 잠시 뒤 다시 해 주세요.',
  };
  return M[c] || `로그인 오류: ${e?.message || e}`;
}

// ---- 아이폰 위젯 연결 코드 ----
// 위젯이 이 계정의 캘린더를 읽을 수 있게 하는 열쇠. 남에게 주면 안 된다.
export function widgetCode(appUrl) {
  const u = auth?.currentUser;
  if (!u) return null;
  const json = JSON.stringify({
    v: 1, projectId: cfg.projectId, apiKey: cfg.apiKey, uid: u.uid, refreshToken: u.refreshToken, appUrl,
    ...(EMU ? { emu: { auth: 'http://127.0.0.1:9099', firestore: 'http://127.0.0.1:8080' } } : {}),
  });
  return btoa(unescape(encodeURIComponent(json)));
}
