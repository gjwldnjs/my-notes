// GitHub 비공개 저장소와 동기화
//
// 저장소 안의 모습
//   _index.json          : 앱이 쓰는 목록(폴더 구조·순서·시각). 직접 고치지 않는다.
//   01. 업무일지/...      : 폴더는 폴더로, 메모는 .md 파일로 (사람이 읽기 좋은 사본)
//   _휴지통/...
//
// 한 번 동기화 = ① 원격 최신 목록을 받아 항목별로 더 최근 것을 합치고
//               ② 이 기기에 바뀐 게 있으면 전체 트리를 새 커밋 하나로 올린다.
// 그 사이 다른 기기가 먼저 올렸으면(충돌) ①부터 다시 한다.

import * as S from './store.js';
import { state } from './store.js';

const CFG_KEY = 'gh-config';
export function getConfig() {
  try { return JSON.parse(localStorage.getItem(CFG_KEY) || 'null'); } catch { return null; }
}
export function setConfig(c) {
  if (c) localStorage.setItem(CFG_KEY, JSON.stringify(c));
  else localStorage.removeItem(CFG_KEY);
}
export const configured = () => !!getConfig()?.token;

// ---- 상태 표시 ----
let status = { kind: 'off', msg: '' };
let onStatus = () => {};
export function onSyncStatus(fn) { onStatus = fn; fn(status); }
export const getStatus = () => status;
function setStatus(kind, msg = '') { status = { kind, msg, at: Date.now() }; onStatus(status); }
export function markPending() { if (configured() && status.kind !== 'syncing') setStatus(navigator.onLine === false ? 'offline' : 'pending'); }
export function refreshStatus() {
  if (!configured()) setStatus('off');
  else if (navigator.onLine === false) setStatus('offline');
  else if (status.kind === 'off') setStatus(state.sync.dirty ? 'pending' : 'ok');
}

// ---- GitHub API ----
async function gh(cfg, method, path, body) {
  let res;
  try {
    res = await fetch(`${cfg.apiBase || 'https://api.github.com'}/repos/${cfg.owner}/${cfg.repo}${path}`, {
      method,
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        Accept: 'application/vnd.github+json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    const err = new Error('network');
    err.network = true;
    throw err;
  }
  if (!res.ok) {
    let msg = '';
    try { msg = (await res.json()).message || ''; } catch {}
    const err = new Error(`GitHub ${res.status} ${msg}`);
    err.status = res.status;
    err.ghMessage = msg;
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

function explain(e) {
  if (e.network) return '인터넷에 연결되지 않았어요. 지금 내용은 이 기기에 저장돼 있고, 연결되면 자동으로 올려요.';
  if (e.status === 401) return '토큰이 올바르지 않거나 만료됐어요. 설정에서 새 토큰을 넣어 주세요.';
  if (e.status === 403) return /rate limit/i.test(e.ghMessage || '') ? 'GitHub 요청 한도를 넘었어요. 잠시 뒤 다시 시도해요.' : '토큰 권한이 부족해요. 이 저장소의 Contents 읽기·쓰기 권한이 필요해요.';
  if (e.status === 404) return '저장소를 찾을 수 없어요. 저장소 이름과 토큰이 접근할 수 있는 저장소인지 확인해 주세요.';
  return `동기화 오류: ${e.message}`;
}

const utf8 = new TextEncoder();
function b64encode(text) {
  let bin = '';
  for (const b of utf8.encode(text)) bin += String.fromCharCode(b);
  return btoa(bin);
}
function b64decode(b64) {
  const bin = atob(b64.replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}
async function blobText(cfg, sha) {
  const b = await gh(cfg, 'GET', `/git/blobs/${sha}`);
  return b.encoding === 'base64' ? b64decode(b.content) : b.content;
}

// git이 파일에 붙이는 지문(SHA-1)을 직접 계산 → 이미 올라가 있는 파일은 다시 안 보낸다
export async function gitSha(text) {
  const body = utf8.encode(text);
  const head = utf8.encode(`blob ${body.length}\0`);
  const all = new Uint8Array(head.length + body.length);
  all.set(head);
  all.set(body, head.length);
  const d = await crypto.subtle.digest('SHA-1', all);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---- 메모 ↔ 파일 ----
const DATA_RE = /\n*<!-- my-notes-data\n([\s\S]*?)\n-->\s*$/;
export function serialize(n) {
  let s = n.content || '';
  if (n.data) s += `\n\n<!-- my-notes-data\n${JSON.stringify(n.data).replace(/--/g, '-\\u002d')}\n-->\n`;
  return s;
}
export function parseFile(text) {
  const m = text.match(DATA_RE);
  if (!m) return { content: text, data: null };
  let data = null;
  try { data = JSON.parse(m[1]); } catch {}
  return { content: text.slice(0, m.index), data };
}

const safeName = (s) => (s || '제목 없음').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').replace(/^\.+/, '').trim().slice(0, 80) || '제목 없음';
const pad2 = (i) => String(i).padStart(2, '0');

const README = `# 내 메모장 데이터

이 저장소는 **내 메모장** 앱이 자동으로 관리해요.

- 폴더·파일 이름 앞 번호는 앱 안의 순서예요.
- \`_index.json\`은 앱이 쓰는 목록 파일이에요. 직접 고치지 마세요.
- 여기서 .md 파일을 직접 고쳐도 앱에는 반영되지 않아요. 수정은 앱에서 해 주세요.
`;

// ---- 합치기 ----
async function pool(items, size, fn) {
  let i = 0;
  const run = async () => { while (i < items.length) { const it = items[i++]; await fn(it); } };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, run));
}

async function mergeRemote(cfg, ri) {
  const L = state;
  if ((ri.settingsAt || 0) > (L.settingsAt || 0)) {
    L.settings = { ...L.settings, ...ri.settings };
    L.settingsAt = ri.settingsAt;
  }
  for (const [id, ts] of Object.entries(ri.deleted || {})) {
    L.deleted[id] = Math.max(L.deleted[id] || 0, ts);
    const n = L.nodes[id];
    if (n && Math.max(n.metaAt, n.contentAt) <= ts) delete L.nodes[id];
  }
  const need = [];
  for (const [key, r0] of Object.entries(ri.nodes || {})) {
    const r = r0.id ? r0 : { ...r0, id: key };
    if (!r.id || r.id === 'undefined' || r.id === 'null') continue;
    if ((L.deleted[r.id] || 0) >= Math.max(r.metaAt, r.contentAt)) continue;
    let n = L.nodes[r.id];
    if (!n) {
      n = L.nodes[r.id] = { id: r.id, content: '', data: null };
      for (const k of S.META_FIELDS) n[k] = r[k] ?? null;
      n.contentAt = r.type === 'note' ? -1 : r.contentAt;
      if (r.type === 'note') { n.pending = true; n.pendingAt = r.contentAt; n.sha = r.sha; }
    } else if (r.metaAt > n.metaAt) {
      for (const k of S.META_FIELDS) n[k] = r[k] ?? null;
    }
    if (r.type === 'note' && r.contentAt > n.contentAt && r.sha) need.push(r);
  }
  await pool(need, 6, async (r) => {
    const { content, data } = parseFile(await blobText(cfg, r.sha));
    const n = L.nodes[r.id];
    if (n && r.contentAt > n.contentAt) {
      n.content = content;
      n.data = data;
      n.contentAt = r.contentAt;
      n.sha = r.sha;
      delete n.pending;
      delete n.pendingAt;
    }
  });
  if (S.repair()) { L.sync.dirty = true; }
  S.persist();
  S.emit('remote');
}

// ---- 올릴 트리 만들기 ----
async function buildTree(known) {
  const entries = [];
  const shaById = {};
  const idx = { format: 1, app: 'my-notes', settings: state.settings, settingsAt: state.settingsAt, deleted: state.deleted, nodes: {} };

  const addNode = async (n, path) => {
    const meta = {};
    for (const k of S.META_FIELDS) meta[k] = n[k] ?? null;
    meta.id = n.id;
    meta.contentAt = n.contentAt;
    if (n.type === 'note') {
      if (n.pending) { // 아직 못 받은 메모: 원격 것을 그대로 유지
        meta.sha = n.sha || null;
        meta.contentAt = n.pendingAt ?? -1;
        if (n.sha) entries.push({ path: path + '.md', mode: '100644', type: 'blob', sha: n.sha });
      } else {
        const text = serialize(n);
        const sha = await gitSha(text);
        meta.sha = sha;
        shaById[n.id] = sha;
        entries.push(known.has(sha)
          ? { path: path + '.md', mode: '100644', type: 'blob', sha }
          : { path: path + '.md', mode: '100644', type: 'blob', content: text });
      }
    }
    idx.nodes[n.id] = meta;
  };
  const seen = new Set();
  const walk = async (pid, dir) => {
    const list = S.kids(pid).filter((n) => n.id && !seen.has(n.id));
    list.forEach((n) => seen.add(n.id));
    for (let i = 0; i < list.length; i++) {
      const n = list[i];
      const path = `${dir}${pad2(i + 1)}. ${safeName(n.name)}`;
      await addNode(n, path);
      if (n.type === 'folder') await walk(n.id, path + '/');
    }
  };
  await walk(null, '');
  const trashed = Object.values(state.nodes).filter((n) => n.trashed).sort((a, b) => a.trashed - b.trashed);
  for (let i = 0; i < trashed.length; i++) {
    const n = trashed[i];
    if (seen.has(n.id)) continue;
    seen.add(n.id);
    const path = `_휴지통/${pad2(i + 1)}. ${safeName(n.name)}`;
    await addNode(n, path);
    if (n.type === 'folder') await walk(n.id, path + '/');
  }
  entries.push({ path: '_index.json', mode: '100644', type: 'blob', content: JSON.stringify(idx) });
  entries.push({ path: 'README.md', mode: '100644', type: 'blob', content: README });
  return { entries, shaById };
}

// ---- 동기화 한 번 ----
const isPhone = () => /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
function stamp() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

async function syncOnce(cfg) {
  if (!cfg.branch) {
    const info = await gh(cfg, 'GET', '');
    cfg.branch = info.default_branch || 'main';
    setConfig(cfg);
  }
  const br = cfg.branch;
  let head = null;
  try {
    head = (await gh(cfg, 'GET', `/git/ref/heads/${encodeURIComponent(br)}`)).object.sha;
  } catch (e) {
    if (e.status !== 404 && e.status !== 409) throw e;
  }
  if (!head) {
    await gh(cfg, 'GET', ''); // 저장소 자체에 접근 가능한지 먼저 확인 (안 되면 404)
    const r = await gh(cfg, 'PUT', '/contents/README.md', { message: '메모장 저장소 시작', content: b64encode(README), branch: br });
    head = r.commit.sha;
    state.sync.baseCommit = null;
  }

  const known = new Set(Object.values(state.nodes).map((n) => n.sha).filter(Boolean));
  let hasIndex = head === state.sync.baseCommit;
  if (head !== state.sync.baseCommit) {
    const commit = await gh(cfg, 'GET', `/git/commits/${head}`);
    const tree = await gh(cfg, 'GET', `/git/trees/${commit.tree.sha}`);
    const ent = tree.tree.find((t) => t.path === '_index.json');
    if (ent) {
      hasIndex = true;
      const ri = JSON.parse(await blobText(cfg, ent.sha));
      for (const r of Object.values(ri.nodes || {})) if (r.sha) known.add(r.sha);
      await mergeRemote(cfg, ri);
    }
  }

  if (!state.sync.dirty && hasIndex) {
    state.sync.baseCommit = head;
    S.persist();
    return true;
  }

  const ver = state.sync.editVersion;
  let { entries, shaById } = await buildTree(known);
  let t;
  try {
    t = await gh(cfg, 'POST', '/git/trees', { tree: entries });
  } catch (e) {
    if (e.status !== 422) throw e;
    // 저장소가 초기화됐거나 다시 만들어져서 있어야 할 파일이 없음 → 전부 다시 올린다
    ({ entries, shaById } = await buildTree(new Set()));
    t = await gh(cfg, 'POST', '/git/trees', { tree: entries });
  }
  const c = await gh(cfg, 'POST', '/git/commits', { message: `메모 저장 ${stamp()} (${isPhone() ? '휴대폰' : 'PC'})`, tree: t.sha, parents: [head] });
  try {
    await gh(cfg, 'PATCH', `/git/refs/heads/${encodeURIComponent(br)}`, { sha: c.sha, force: false });
  } catch (e) {
    if (e.status === 422 || e.status === 409) return false; // 다른 기기가 먼저 올림 → 다시
    throw e;
  }
  for (const [id, sha] of Object.entries(shaById)) if (state.nodes[id]) state.nodes[id].sha = sha;
  state.sync.baseCommit = c.sha;
  if (state.sync.editVersion === ver) state.sync.dirty = false;
  S.persist();
  return true;
}

let running = false;
let again = false;
export async function syncNow() {
  const cfg = getConfig();
  if (!cfg?.token) { setStatus('off'); return; }
  if (navigator.onLine === false) { setStatus('offline'); return; }
  if (running) { again = true; return; }
  running = true;
  setStatus('syncing');
  try {
    let ok = false;
    for (let i = 0; i < 4 && !ok; i++) ok = await syncOnce(cfg);
    if (!ok) throw new Error('다른 기기와 동시에 저장이 겹쳐요. 잠시 뒤 자동으로 다시 시도해요.');
    setStatus(state.sync.dirty ? 'pending' : 'ok');
  } catch (e) {
    console.error(e);
    setStatus(e.network ? 'offline' : 'error', explain(e));
  } finally {
    running = false;
    if (again) { again = false; setTimeout(syncNow, 300); }
  }
}

// 설정 화면의 "연결 확인"
export async function testConfig(cfg) {
  const info = await gh(cfg, 'GET', '').catch((e) => { throw new Error(explain(e)); });
  if (!info.private) return { ok: true, warn: '이 저장소는 공개(public) 상태예요. 일기가 다른 사람에게 보일 수 있으니 비공개로 바꾸는 걸 권해요.' };
  return { ok: true };
}
