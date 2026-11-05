// 메모 데이터(트리)와 이 기기 안의 저장소(IndexedDB)
//
// 노드 하나 = 폴더 또는 메모.
//   metaAt    : 이름·위치·휴지통 여부가 마지막으로 바뀐 시각
//   contentAt : 본문(content)·부가 데이터(data)가 마지막으로 바뀐 시각
// 두 기기에서 동시에 고쳐도, 동기화할 때 항목마다 더 최근 것을 고른다.

// 주소에 ?p=이름 을 붙이면 같은 브라우저에서도 따로 떨어진 저장공간·로그인을 쓴다 (한 컴퓨터에서 두 계정을 동시에)
export const PROFILE = new URLSearchParams(location.search).get('p') || '';
const DB_NAME = 'my-notes' + (PROFILE ? '-' + PROFILE : '');
let dbp;
function db() {
  return (dbp ||= new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
}
async function kvGet(k) {
  const d = await db();
  return new Promise((res, rej) => {
    const q = d.transaction('kv').objectStore('kv').get(k);
    q.onsuccess = () => res(q.result);
    q.onerror = () => rej(q.error);
  });
}
async function kvSet(k, v) {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction('kv', 'readwrite');
    t.objectStore('kv').put(v, k);
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
  });
}

export const META_FIELDS = ['type', 'kind', 'name', 'parent', 'pos', 'created', 'metaAt', 'trashed'];

export function defaultSettings() {
  return {
    showNumbers: true,
    workFolder: 'seed-work',
    diaryFolder: 'seed-diary',
    memoFolder: 'seed-memo',
    suppNote: 'seed-supp',
    calNote: 'seed-cal',
    workTemplate: '## 오늘 할 일\n- [ ] \n\n## 한 일\n- \n\n## 메모\n\n\n## 내일 할 일\n- [ ] ',
    diaryTemplate: '## 오늘 있었던 일\n\n\n## 기분·생각\n\n\n## 고마웠던 것\n- ',
  };
}

export const state = {
  nodes: {},
  deleted: {}, // 완전히 지운 항목: id → 지운 시각 (다른 기기에도 알리기 위함)
  settings: defaultSettings(),
  settingsAt: 0,
  // owner: 이 기기 메모의 주인(로그인 계정 uid). pushed: 서버에 올린 항목별 표시. serverAt: 받아 온 마지막 서버 시각
  sync: { owner: null, pushed: {}, serverAt: 0, dirty: false, editVersion: 0 },
};

// 처음 쓰는 기기에 만들어 두는 기본 폴더. 고정 id라서 여러 기기에서 만들어도 하나로 합쳐진다.
function seed() {
  const n = (id, type, kind, name, pos) => ({
    id, type, kind, name, parent: null, pos, created: 0, metaAt: 0, contentAt: 0, content: '', data: null, trashed: null,
  });
  const supp = n('seed-supp', 'note', 'supp', '영양제', 4);
  supp.data = { items: [], log: {} };
  return [n('seed-work', 'folder', null, '업무일지', 1), n('seed-diary', 'folder', null, '일기', 2), n('seed-memo', 'folder', null, '메모', 3), supp, seedCal()];
}
function seedCal() {
  return { id: 'seed-cal', type: 'note', kind: 'cal', name: '캘린더', parent: null, pos: 5, created: 0, metaAt: 0, contentAt: 0, content: '', data: { events: [] }, trashed: null };
}

export async function load() {
  let saved = null;
  try { saved = await kvGet('state'); } catch (e) { console.error('기기 저장소 읽기 실패', e); }
  if (saved && saved.nodes) {
    state.nodes = saved.nodes;
    for (const [id, n] of Object.entries(state.nodes)) if (!n.id) n.id = id;
    state.deleted = saved.deleted || {};
    state.settings = { ...defaultSettings(), ...saved.settings };
    state.settingsAt = saved.settingsAt || 0;
    state.sync = { ...state.sync, ...saved.sync };
    // 캘린더가 생기기 전부터 쓰던 기기에도 캘린더를 넣어 준다 (고정 id라 기기끼리 합쳐짐)
    if (!state.nodes['seed-cal'] && !state.deleted['seed-cal']) state.nodes['seed-cal'] = seedCal();
  } else {
    for (const n of seed()) state.nodes[n.id] = n;
  }
  state.sync.pushed ||= {};
}

// 로그아웃하거나 다른 계정으로 바꿀 때: 이 기기의 메모를 모두 지우고 처음 상태로
export async function wipeLocal() {
  state.nodes = {};
  for (const n of seed()) state.nodes[n.id] = n;
  state.deleted = {};
  state.settings = defaultSettings();
  state.settingsAt = 0;
  state.sync = { owner: null, pushed: {}, serverAt: 0, dirty: false, editVersion: 0 };
  await persist(true);
  emit('remote');
}

let saveTimer = null;
export function persist(now = false) {
  clearTimeout(saveTimer);
  const run = () => kvSet('state', {
    nodes: state.nodes, deleted: state.deleted, settings: state.settings, settingsAt: state.settingsAt, sync: state.sync,
  }).catch((e) => console.error('기기 저장 실패', e));
  if (now) return run();
  saveTimer = setTimeout(run, 300);
}

// ---- 변경 알림 ----
const subs = new Set();
export const subscribe = (fn) => subs.add(fn);
export const emit = (reason = 'local') => subs.forEach((f) => f(reason));
let onDirty = () => {};
export const setOnDirty = (fn) => (onDirty = fn);

// quiet: 본문 타이핑처럼 목록을 다시 그릴 필요가 없는 변경
export function changed(quiet = false) {
  state.sync.dirty = true;
  state.sync.editVersion++;
  persist();
  if (!quiet) emit('local');
  onDirty();
}

// ---- 트리 조회 ----
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export const get = (id) => (id ? state.nodes[id] : null) || null;
const byPos = (a, b) => a.pos - b.pos || a.created - b.created || (a.id < b.id ? -1 : 1);

export function kids(pid, withTrashed = false) {
  const out = [];
  if (pid === undefined) return out;
  for (const n of Object.values(state.nodes)) {
    if ((n.parent ?? null) === (pid ?? null) && (withTrashed || !n.trashed)) out.push(n);
  }
  return out.sort(byPos);
}

export function ancestors(id) {
  const out = [];
  const seen = new Set();
  let n = get(get(id)?.parent);
  while (n && !seen.has(n.id)) { seen.add(n.id); out.unshift(n); n = get(n.parent); }
  return out;
}

export function inTrash(id) {
  const seen = new Set();
  let n = get(id);
  while (n && !seen.has(n.id)) {
    if (n.trashed) return true;
    seen.add(n.id);
    n = get(n.parent);
  }
  return false;
}

// id가 folderId 자신이거나 그 안에 있으면 true
export function isInside(id, folderId) {
  const seen = new Set();
  let n = get(id);
  while (n && !seen.has(n.id)) {
    if (n.id === folderId) return true;
    seen.add(n.id);
    n = get(n.parent);
  }
  return false;
}

export function descendants(id) {
  const out = [];
  const seen = new Set([id]);
  const walk = (pid) => kids(pid, true).forEach((k) => { if (seen.has(k.id)) return; seen.add(k.id); out.push(k); walk(k.id); });
  walk(id);
  return out;
}

export function endPos(pid) {
  const k = kids(pid, true);
  return k.length ? Math.max(...k.map((n) => n.pos)) + 1 : 1;
}

// ---- 변경 ----
export function create({ type, kind = null, name, parent = null, pos, id, content = '', data = null, at }) {
  const now = Date.now();
  const t = at ?? now;
  const n = {
    id: id || uid(), type, kind: type === 'note' ? kind || 'md' : null, name, parent, pos: pos ?? endPos(parent),
    created: now, metaAt: t, contentAt: t, content, data, trashed: null,
  };
  state.nodes[n.id] = n;
  changed();
  return n;
}

export function rename(id, name) {
  const n = get(id);
  if (!n || n.name === name) return;
  n.name = name;
  n.metaAt = Date.now();
  changed();
}

export function move(id, parent, pos) {
  const n = get(id);
  if (!n) return;
  if (parent && isInside(parent, id)) return; // 자기 안으로는 못 옮김
  n.parent = parent ?? null;
  n.pos = pos ?? endPos(parent);
  n.metaAt = Date.now();
  changed();
}

export function setContent(id, content) {
  const n = get(id);
  if (!n || n.content === content) return;
  n.content = content;
  n.contentAt = Date.now();
  changed(true);
}

export function setData(id, data) {
  const n = get(id);
  if (!n) return;
  n.data = data;
  n.contentAt = Date.now();
  changed(true);
}

export function trash(id) {
  const n = get(id);
  if (!n) return;
  n.trashed = Date.now();
  n.metaAt = Date.now();
  changed();
}

export function restore(id) {
  const n = get(id);
  if (!n) return;
  n.trashed = null;
  if (n.parent && (!get(n.parent) || inTrash(n.parent))) { n.parent = null; n.pos = endPos(null); }
  n.metaAt = Date.now();
  changed();
}

export function purge(id) {
  const now = Date.now();
  for (const n of [get(id), ...descendants(id)]) {
    if (!n) continue;
    delete state.nodes[n.id];
    state.deleted[n.id] = now;
  }
  changed();
}

export function setSettings(patch) {
  Object.assign(state.settings, patch);
  state.settingsAt = Date.now();
  changed();
}

// 동기화 뒤 부모가 사라졌거나 서로를 품는 고리가 생기면 최상위로 꺼낸다
export function repair() {
  let fixed = false;
  for (const n of Object.values(state.nodes)) {
    if (n.parent && !state.nodes[n.parent]) { n.parent = null; fixed = true; }
  }
  for (const n of Object.values(state.nodes)) {
    const seen = new Set([n.id]);
    let p = state.nodes[n.parent];
    while (p) {
      if (seen.has(p.id)) { n.parent = null; n.metaAt = Date.now(); fixed = true; break; }
      seen.add(p.id);
      p = state.nodes[p.parent];
    }
  }
  return fixed;
}

// ---- 태그·검색 ----
const TAG_RE = /(^|[\s(（,])#([\p{L}_][\p{L}\p{N}_\-/]*)/gu;

export function stripCode(src) {
  return src.replace(/```[\s\S]*?(```|$)/g, ' ').replace(/`[^`\n]*`/g, ' ');
}

export function tagsOf(src) {
  const set = new Set();
  for (const m of stripCode(src || '').matchAll(TAG_RE)) set.add(m[2]);
  return [...set];
}

export function allTags() {
  const count = new Map();
  for (const n of Object.values(state.nodes)) {
    if (n.type !== 'note' || inTrash(n.id)) continue;
    for (const t of tagsOf(n.content)) count.set(t, (count.get(t) || 0) + 1);
  }
  return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'));
}

export function search(q) {
  q = q.trim();
  if (!q) return [];
  const live = Object.values(state.nodes).filter((n) => !inTrash(n.id));
  if (q.startsWith('#') && !q.includes(' ')) {
    const tag = q.slice(1).toLowerCase();
    return live
      .filter((n) => n.type === 'note' && tagsOf(n.content).some((t) => t.toLowerCase().startsWith(tag)))
      .sort((a, b) => b.contentAt - a.contentAt)
      .slice(0, 60)
      .map((n) => ({ n, hit: '#' + q.slice(1) }));
  }
  const toks = q.toLowerCase().split(/\s+/).filter(Boolean);
  const out = [];
  for (const n of live) {
    const name = (n.name || '').toLowerCase();
    const body = n.type === 'note' ? (n.content || '').toLowerCase() : '';
    if (!toks.every((t) => name.includes(t) || body.includes(t))) continue;
    const score = toks.filter((t) => name.includes(t)).length * 10 + (n.type === 'folder' ? 1 : 0);
    out.push({ n, score, hit: toks.find((t) => body.includes(t)) });
  }
  return out.sort((a, b) => b.score - a.score || Math.max(b.n.contentAt, b.n.metaAt) - Math.max(a.n.contentAt, a.n.metaAt)).slice(0, 60);
}
