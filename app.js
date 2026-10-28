// 내 메모장 — 화면
import { h, icon, iconBtn, esc, pad, WD, ymd, fmtTime, toast } from './dom.js';
import * as S from './store.js';
import { state } from './store.js';
import * as Sync from './sync.js';
import { suppEl } from './supp.js';

const $ = (s, el = document) => el.querySelector(s);
const mq = window.matchMedia('(max-width: 760px)');
const isMobile = () => mq.matches;

// ---------- 화면 상태 (기기마다 따로) ----------
const ui = { path: [], note: null, mode: null };
try { Object.assign(ui, JSON.parse(localStorage.getItem('ui') || '{}')); } catch {}
ui.mode = null;
const saveUi = () => { try { localStorage.setItem('ui', JSON.stringify({ path: ui.path, note: ui.note })); } catch {} };
let renaming = null;

function validateUi() {
  if (ui.note) {
    const n = S.get(ui.note);
    if (!n || n.type !== 'note' || S.inTrash(n.id)) ui.note = null;
    else ui.path = S.ancestors(n.id).map((a) => a.id);
  }
  const p = [];
  let parent = null;
  for (const id of ui.path) {
    const n = S.get(id);
    if (!n || n.type !== 'folder' || n.trashed || (n.parent ?? null) !== parent) break;
    p.push(id);
    parent = id;
  }
  ui.path = p;
}

function render() {
  validateUi();
  renderColumns();
  renderEditor();
  renderMobile();
  syncHistory();
  saveUi();
}

function scrollColsEnd() {
  requestAnimationFrame(() => { const c = $('#columns'); c.scrollLeft = c.scrollWidth; });
}

function openFolder(id) {
  ui.path = [...S.ancestors(id).map((a) => a.id), id];
  ui.note = null;
  render();
  scrollColsEnd();
}

function openNote(id, mode) {
  if (!S.get(id)) return;
  ui.path = S.ancestors(id).map((a) => a.id);
  ui.note = id;
  ui.mode = mode || null;
  ed.id = null; // 다시 그리기
  render();
  scrollColsEnd();
}

// ---------- 열(컬럼) ----------
const typeIcon = (n) => (n.type === 'folder' ? 'folder' : n.kind === 'supp' ? 'pill' : 'note');

function renderColumns() {
  if (renaming) return;
  const wrap = $('#columns');
  const scrolls = [...wrap.querySelectorAll('.col-list')].map((l) => l.scrollTop);
  const ids = [null, ...ui.path];
  wrap.replaceChildren(...ids.map((fid, i) => columnEl(fid, i)));
  wrap.querySelectorAll('.col-list').forEach((l, i) => { if (scrolls[i]) l.scrollTop = scrolls[i]; });
}

let dragId = null;
const clearDrop = () => document.querySelectorAll('.drop-into,.drop-before,.drop-after,.drop-end').forEach((el) => el.classList.remove('drop-into', 'drop-before', 'drop-after', 'drop-end'));

function columnEl(fid, depth) {
  const folder = S.get(fid);
  const items = S.kids(fid);
  const list = h('ul', { class: 'col-list' });
  items.forEach((n, i) => list.append(itemEl(n, i, depth)));
  if (!items.length) list.append(h('li', { class: 'col-empty' }, '비어 있어요.', h('br'), '＋ 버튼으로 메모나 폴더를 추가하세요.'));

  list.addEventListener('dragover', (e) => {
    if (!dragId || (fid && S.isInside(fid, dragId))) return;
    e.preventDefault();
    clearDrop();
    list.classList.add('drop-end');
  });
  list.addEventListener('dragleave', (e) => { if (e.target === list) list.classList.remove('drop-end'); });
  list.addEventListener('drop', (e) => {
    if (!dragId) return;
    e.preventDefault();
    clearDrop();
    S.move(dragId, fid);
  });

  return h('section', { class: 'col' },
    h('div', { class: 'col-head' },
      h('span', { class: 'col-title' }, folder ? folder.name : '전체'),
      iconBtn('plus', '새로 만들기', (e) => addMenu(e.currentTarget, fid))),
    list);
}

function itemEl(n, i, depth) {
  const inPath = n.id === ui.path[depth] || n.id === ui.note;
  const deepest = ui.note ? n.id === ui.note : n.id === ui.path.at(-1);
  const isFolder = n.type === 'folder';
  const li = h('li', {
    class: `item ${n.type} ${inPath ? (deepest ? 'active' : 'onpath') : ''}`,
    'data-id': n.id,
    draggable: isMobile() ? null : 'true',
    title: n.name || '제목 없음',
  },
  state.settings.showNumbers ? h('span', { class: 'num' }, `${i + 1}.`) : null,
  icon(typeIcon(n), 'ic-type'),
  h('span', { class: `name ${n.name ? '' : 'untitled'}` }, n.name || '제목 없음'),
  isFolder ? h('span', { class: 'count' }, S.kids(n.id).length || '') : null,
  iconBtn('more', '더 보기', (e) => { e.stopPropagation(); itemMenu(e.currentTarget, n); }, 'more'),
  isFolder ? icon('chev', 'chev') : null);

  li.addEventListener('click', (e) => {
    if (e.target.closest('.more, .rename')) return;
    if (isFolder) { ui.path = ui.path.slice(0, depth).concat(n.id); ui.note = null; }
    else { ui.path = ui.path.slice(0, depth); ui.note = n.id; }
    render();
    scrollColsEnd();
  });
  li.addEventListener('dblclick', (e) => { if (!e.target.closest('.more')) startRename(n.id); });
  li.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    itemMenu({ getBoundingClientRect: () => ({ left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY }) }, n);
  });

  // 끌어서 옮기기
  const zone = (e) => {
    const r = li.getBoundingClientRect();
    const y = (e.clientY - r.top) / r.height;
    if (isFolder && y > 0.28 && y < 0.72) return 'into';
    return y < 0.5 ? 'before' : 'after';
  };
  li.addEventListener('dragstart', (e) => {
    dragId = n.id;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', n.id);
    li.classList.add('dragging');
  });
  li.addEventListener('dragend', () => { dragId = null; li.classList.remove('dragging'); clearDrop(); });
  li.addEventListener('dragover', (e) => {
    if (!dragId || dragId === n.id) return;
    const z = zone(e);
    if (z === 'into' ? S.isInside(n.id, dragId) : n.parent && S.isInside(n.parent, dragId)) return;
    e.preventDefault();
    e.stopPropagation();
    clearDrop();
    li.classList.add(`drop-${z}`);
  });
  li.addEventListener('drop', (e) => {
    if (!dragId || dragId === n.id) return;
    e.preventDefault();
    e.stopPropagation();
    const z = zone(e);
    const id = dragId;
    clearDrop();
    dropOn(id, n, z);
  });
  return li;
}

function dropOn(id, target, z) {
  if (z === 'into') {
    S.move(id, target.id);
    toast(`'${target.name}' 폴더로 옮겼어요`);
    return;
  }
  const pid = target.parent ?? null;
  const sibs = S.kids(pid).filter((s) => s.id !== id);
  const i = sibs.findIndex((s) => s.id === target.id);
  let pos;
  if (z === 'before') { const prev = sibs[i - 1]; pos = prev ? (prev.pos + target.pos) / 2 : target.pos - 1; }
  else { const next = sibs[i + 1]; pos = next ? (target.pos + next.pos) / 2 : target.pos + 1; }
  S.move(id, pid, pos);
}

function shift(n, d) {
  const sibs = S.kids(n.parent ?? null);
  const i = sibs.findIndex((s) => s.id === n.id);
  const other = sibs[i + d];
  if (!other) return;
  let a = other.pos, b = n.pos;
  if (a === b) a = b + d * 0.5;
  S.move(other.id, other.parent ?? null, b);
  S.move(n.id, n.parent ?? null, a);
}

function startRename(id) {
  const li = document.querySelector(`.item[data-id="${CSS.escape(id)}"]`);
  const n = S.get(id);
  if (!li || !n) return;
  const nameEl = li.querySelector('.name');
  const inp = h('input', { class: 'rename', value: n.name, placeholder: '이름' });
  renaming = id;
  nameEl.replaceWith(inp);
  li.draggable = false;
  inp.focus();
  inp.select();
  let done = false;
  const finish = (ok) => {
    if (done) return;
    done = true;
    renaming = null;
    const v = inp.value.trim();
    if (ok && v && v !== n.name) S.rename(id, v);
    else render();
  };
  inp.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.isComposing) return;
    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    if (e.key === 'Escape') finish(false);
  });
  inp.addEventListener('blur', () => finish(true));
  inp.addEventListener('click', (e) => e.stopPropagation());
}

// ---------- 메뉴 ----------
function openMenu(anchor, items) {
  const m = $('#menu');
  m.replaceChildren(...items.filter(Boolean).map((it) => (it === '-'
    ? h('div', { class: 'sep' })
    : h('button', { type: 'button', class: it[3] || '', onclick: () => { closeMenu(); it[2](); } }, icon(it[0]), it[1]))));
  m.hidden = false;
  const r = anchor.getBoundingClientRect();
  const w = m.offsetWidth, ht = m.offsetHeight;
  m.style.left = `${Math.max(8, Math.min(r.left, innerWidth - w - 8))}px`;
  m.style.top = `${r.bottom + 4 + ht > innerHeight - 8 ? Math.max(8, r.top - ht - 4) : r.bottom + 4}px`;
}
const closeMenu = () => { $('#menu').hidden = true; };

function itemMenu(anchor, n) {
  const sibs = S.kids(n.parent ?? null);
  const i = sibs.findIndex((s) => s.id === n.id);
  openMenu(anchor, [
    n.type === 'folder' && ['note', '이 안에 새 메모', () => newNote(n.id)],
    n.type === 'folder' && ['folder', '이 안에 새 폴더', () => newFolder(n.id)],
    n.type === 'folder' && '-',
    ['edit', '이름 바꾸기', () => startRename(n.id)],
    i > 0 && ['up', '위로', () => shift(n, -1)],
    i < sibs.length - 1 && ['down', '아래로', () => shift(n, 1)],
    ['move', '다른 폴더로 옮기기…', () => moveDialog(n)],
    '-',
    ['trash', '휴지통으로', () => doTrash(n), 'danger'],
  ]);
}

function addMenu(anchor, fid) {
  openMenu(anchor, [
    ['note', '새 메모', () => newNote(fid)],
    ['folder', '새 폴더', () => newFolder(fid)],
    ['pill', '영양제 표', () => newNote(fid, 'supp')],
  ]);
}

function newNote(fid, kind = 'md') {
  const n = S.create({ type: 'note', kind, name: kind === 'supp' ? '영양제' : '', parent: fid ?? null, data: kind === 'supp' ? { items: [], log: {} } : null });
  openNote(n.id, kind === 'supp' ? 'view' : 'edit');
  if (kind !== 'supp') $('.ed-title')?.focus();
}

function newFolder(fid) {
  const n = S.create({ type: 'folder', name: '새 폴더', parent: fid ?? null });
  ui.path = fid ? [...S.ancestors(fid).map((a) => a.id), fid] : [];
  ui.note = null;
  render();
  startRename(n.id);
}

function doTrash(n) {
  S.trash(n.id);
  toast(`'${n.name || '제목 없음'}'을(를) 휴지통으로 옮겼어요`, { label: '되돌리기', run: () => S.restore(n.id) });
}

// ---------- 편집기 ----------
function toggleFocus(on = !document.body.classList.contains('focus')) {
  document.body.classList.toggle('focus', on);
  try { localStorage.setItem('focus', on ? '1' : ''); } catch {}
  const b = $('.ed-top .icon-btn');
  if (b) b.replaceWith(iconBtn(on ? 'chev' : 'back', '목록 숨기기/보이기 (Ctrl+\\)', () => toggleFocus()));
}

const ed = { id: null, mode: 'view', at: 0, pending: false, crumbs: null, meta: null, body: null, supp: null };

function renderEditor(reason = 'local') {
  const box = $('#editor');
  const n = S.get(ui.note);
  if (!n) { ed.id = null; box.replaceChildren(emptyEl()); if (document.body.classList.contains('focus')) toggleFocus(false); return; }
  if (ed.id !== n.id || !!n.pending !== ed.pending || !box.querySelector('.ed-inner')) { buildEditor(n); return; }
  const t = $('.ed-title', box);
  if (t && document.activeElement !== t && t.value !== n.name) t.value = n.name;
  paintCrumbs(n);
  if (n.contentAt !== ed.at && reason === 'remote') {
    ed.at = n.contentAt;
    const ta = $('.ed-text', box);
    if (ta && ed.mode === 'edit') {
      const a = ta.selectionStart, b = ta.selectionEnd;
      ta.value = n.content;
      ta.setSelectionRange(Math.min(a, ta.value.length), Math.min(b, ta.value.length));
      autosize(ta);
    } else paintBody(n);
    ed.supp?.repaint();
  }
  paintMeta(n);
}

function buildEditor(n) {
  const box = $('#editor');
  ed.id = n.id;
  ed.at = n.contentAt;
  ed.pending = !!n.pending;
  ed.supp = null;
  ed.mode = ui.mode || (n.kind === 'supp' || n.content.trim() ? 'view' : 'edit');
  ui.mode = null;
  const title = h('input', {
    class: 'ed-title', value: n.name, placeholder: '제목 없음', 'aria-label': '제목',
    oninput: (e) => S.rename(n.id, e.target.value),
    onkeydown: (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); setMode('edit', { pos: 0 }); } },
  });
  ed.crumbs = h('nav', { class: 'crumbs' });
  ed.meta = h('div', { class: 'ed-meta' });
  ed.body = h('div', { class: 'ed-body' });
  const focusBtn = isMobile() ? null : iconBtn(document.body.classList.contains('focus') ? 'chev' : 'back', '목록 숨기기/보이기 (Ctrl+\\)', () => toggleFocus());
  const inner = h('div', { class: 'ed-inner' }, h('div', { class: 'ed-top' }, ed.crumbs, focusBtn), title, ed.meta);
  if (n.kind === 'supp' && !n.pending) {
    ed.supp = suppEl(n);
    inner.append(ed.supp, h('h3', { class: 'memo-h' }, '메모'));
  }
  inner.append(ed.body);
  box.replaceChildren(inner);
  box.scrollTop = 0;
  paintCrumbs(n);
  paintMeta(n);
  paintBody(n);
  if (ed.mode === 'edit' && !n.pending) {
    const ta = $('.ed-text', box);
    if (ta) { autosize(ta); ta.focus({ preventScroll: true }); ta.setSelectionRange(0, 0); }
  }
}

function paintCrumbs(n) {
  const anc = S.ancestors(n.id);
  ed.crumbs.replaceChildren(
    h('button', { type: 'button', class: 'crumb', onclick: () => { ui.path = []; ui.note = null; render(); } }, '전체'),
    ...anc.flatMap((a) => [h('span', { class: 'sep' }, '›'), h('button', { type: 'button', class: 'crumb', onclick: () => openFolder(a.id) }, a.name)]),
  );
}

function paintMeta(n) {
  const tags = S.tagsOf(n.content);
  const t = fmtTime(Math.max(n.contentAt, n.metaAt));
  ed.meta.replaceChildren(...[
    h('div', { class: 'tags' }, tags.map((tg) => h('button', { type: 'button', class: 'tag', onclick: () => searchFor('#' + tg) }, '#' + tg))),
    t ? h('span', { class: 'muted when' }, `수정 ${t}`) : null,
    n.pending ? null : h('div', { class: 'seg', role: 'group', 'aria-label': '보기 방식' },
      h('button', { type: 'button', class: ed.mode === 'view' ? 'on' : '', title: '보기 (Ctrl+E)', onclick: () => setMode('view') }, icon('eye'), h('span', { class: 'lbl' }, '보기')),
      h('button', { type: 'button', class: ed.mode === 'edit' ? 'on' : '', title: '편집 (Ctrl+E)', onclick: () => setMode('edit') }, icon('edit'), h('span', { class: 'lbl' }, '편집'))),
  ].filter(Boolean));
}

function paintBody(n) {
  if (n.pending) { ed.body.replaceChildren(h('p', { class: 'muted' }, '다른 기기에서 쓴 내용을 불러오는 중이에요…')); return; }
  ed.body.replaceChildren(ed.mode === 'edit' ? editEl(n) : viewEl(n));
}

function setMode(m, opt = {}) {
  const n = S.get(ed.id);
  if (!n || n.pending) return;
  const box = $('#editor');
  const st = box.scrollTop;
  ed.mode = m;
  paintMeta(n);
  paintBody(n);
  box.scrollTop = st;
  if (m === 'edit') {
    const ta = $('.ed-text');
    autosize(ta);
    ta.focus({ preventScroll: true });
    const pos = opt.pos ?? ta.value.length;
    ta.setSelectionRange(pos, pos);
  }
}

function autosize(ta) {
  if (!ta) return;
  const box = $('#editor');
  const st = box.scrollTop;
  ta.style.height = 'auto';
  ta.style.height = `${ta.scrollHeight + 2}px`;
  box.scrollTop = st;
}

// --- 보기 ---
function renderMd(src) {
  if (!window.marked) return `<pre>${esc(src)}</pre>`;
  const html = window.marked.parse(src, { gfm: true, breaks: true });
  return window.DOMPurify ? window.DOMPurify.sanitize(html) : html;
}

const TAG_RE = /(^|[\s(（,])#([\p{L}_][\p{L}\p{N}_\-/]*)/gu;
function decorateTags(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (t) => (t.parentElement.closest('code, pre, a') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  const texts = [];
  while (walker.nextNode()) texts.push(walker.currentNode);
  for (const t of texts) {
    const s = t.nodeValue;
    if (!s.includes('#')) continue;
    const frag = document.createDocumentFragment();
    let last = 0, found = false;
    for (const m of s.matchAll(TAG_RE)) {
      found = true;
      const start = m.index + m[1].length;
      frag.append(s.slice(last, start));
      const tag = m[2];
      frag.append(h('button', { type: 'button', class: 'tag', onclick: (e) => { e.stopPropagation(); searchFor('#' + tag); } }, '#' + tag));
      last = start + 1 + tag.length;
    }
    if (!found) continue;
    frag.append(s.slice(last));
    t.replaceWith(frag);
  }
}

function toggleTask(id, idx) {
  const n = S.get(id);
  const lines = n.content.split('\n');
  let k = -1, inCode = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*```/.test(lines[i])) { inCode = !inCode; continue; }
    if (inCode) continue;
    const m = lines[i].match(/^(\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+)\[( |x|X)\]/);
    if (m && ++k === idx) {
      lines[i] = m[1] + (m[2] === ' ' ? '[x]' : '[ ]') + lines[i].slice(m[0].length);
      break;
    }
  }
  S.setContent(id, lines.join('\n'));
  ed.at = S.get(id).contentAt;
}

function caretFromPoint(x, y, src) {
  let node = null, off = 0;
  if (document.caretPositionFromPoint) { const p = document.caretPositionFromPoint(x, y); if (p) { node = p.offsetNode; off = p.offset; } }
  else if (document.caretRangeFromPoint) { const r = document.caretRangeFromPoint(x, y); if (r) { node = r.startContainer; off = r.startOffset; } }
  if (!node || node.nodeType !== 3) return null;
  const text = node.nodeValue;
  const a = Math.max(0, off - 12);
  for (const [key, shift] of [[text.slice(a, off + 12), off - a], [text.slice(a, off), off - a], [text.slice(off, off + 12), 0]]) {
    if (key.trim().length < 2) continue;
    const i = src.indexOf(key);
    if (i >= 0) return i + shift;
  }
  return null;
}

function viewEl(n) {
  const art = h('article', { class: 'md' });
  if (!n.content.trim()) art.append(h('p', { class: 'placeholder' }, n.kind === 'supp' ? '메모가 없어요. 눌러서 쓰세요.' : '비어 있어요. 눌러서 쓰기 시작하세요.'));
  else art.innerHTML = renderMd(n.content);
  art.querySelectorAll('input[type=checkbox]').forEach((cb, i) => {
    cb.disabled = false;
    const li = cb.closest('li');
    li?.classList.add('task');
    li?.classList.toggle('done', cb.checked);
    cb.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleTask(n.id, i);
      li?.classList.toggle('done', cb.checked);
    });
  });
  art.querySelectorAll('a[href]').forEach((a) => { a.target = '_blank'; a.rel = 'noopener noreferrer'; });
  decorateTags(art);
  art.addEventListener('click', (e) => {
    if (e.target.closest('a, input, button')) return;
    if (String(window.getSelection())) return;
    const pos = caretFromPoint(e.clientX, e.clientY, n.content);
    setMode('edit', pos != null ? { pos } : {});
  });
  return art;
}

// --- 편집 ---
function editEl(n) {
  const ta = h('textarea', {
    class: 'ed-text', spellcheck: 'false', 'aria-label': '본문',
    placeholder: '여기에 쓰세요.\n\n## 제목   - 목록   - [ ] 할 일   **굵게**\n#태그 를 붙이면 검색에서 모아 볼 수 있어요.',
  });
  ta.value = n.content;
  let metaT;
  ta.addEventListener('input', () => {
    S.setContent(n.id, ta.value);
    ed.at = S.get(n.id).contentAt;
    autosize(ta);
    clearTimeout(metaT);
    metaT = setTimeout(() => { const c = S.get(n.id); if (c && ed.id === c.id) paintMeta(c); }, 700);
  });
  ta.addEventListener('keydown', onEditorKey);
  requestAnimationFrame(() => autosize(ta));
  return h('div', { class: 'ed-edit' }, toolbar(ta), ta);
}

function replaceRange(ta, start, end, text, selS, selE) {
  ta.focus({ preventScroll: true });
  ta.setSelectionRange(start, end);
  let ok = false;
  try {
    if (text) ok = document.execCommand('insertText', false, text);
    else if (start !== end) ok = document.execCommand('delete');
    else ok = true;
  } catch {}
  if (!ok) { ta.setRangeText(text, start, end, 'end'); ta.dispatchEvent(new Event('input', { bubbles: true })); }
  if (selS != null) ta.setSelectionRange(selS, selE ?? selS);
}

function lineRange(ta) {
  const v = ta.value;
  const s = v.lastIndexOf('\n', ta.selectionStart - 1) + 1;
  let e = v.indexOf('\n', ta.selectionEnd);
  if (e < 0) e = v.length;
  return [s, e];
}

const KIND = {
  '## ': /^\s*#{1,6}\s/,
  '- [ ] ': /^\s*[-*+]\s+\[[ xX]\]/,
  '- ': /^\s*[-*+]\s+(?!\[[ xX]\])/,
  '1. ': /^\s*\d+[.)]\s/,
};
const MARK = /^(\s*)(#{1,6}\s+|[-*+]\s+\[[ xX]\]\s*|[-*+]\s+|\d+[.)]\s+)?/;
function linePrefix(ta, prefix) {
  const [s, e] = lineRange(ta);
  const lines = ta.value.slice(s, e).split('\n');
  const all = lines.every((l) => KIND[prefix].test(l));
  const out = lines.map((l, i) => {
    const m = l.match(MARK);
    const rest = l.slice(m[0].length);
    if (all) return m[1] + rest;
    return m[1] + (prefix === '1. ' ? `${i + 1}. ` : prefix) + rest;
  }).join('\n');
  replaceRange(ta, s, e, out, s + out.length);
}

function wrap(ta, mark) {
  const { selectionStart: s, selectionEnd: e, value: v } = ta;
  const sel = v.slice(s, e);
  if (sel.length > mark.length * 2 && sel.startsWith(mark) && sel.endsWith(mark)) {
    const inner = sel.slice(mark.length, -mark.length);
    replaceRange(ta, s, e, inner, s, s + inner.length);
  } else {
    replaceRange(ta, s, e, mark + sel + mark, s + mark.length, e + mark.length);
  }
}

function insert(ta, text) {
  const s = ta.selectionStart;
  replaceRange(ta, s, ta.selectionEnd, text, s + text.length);
}

function insertBlock(ta, block) {
  const s = ta.selectionStart;
  const v = ta.value;
  const pre = s === 0 || v[s - 1] === '\n' ? '' : '\n';
  insert(ta, `${pre}${block}\n`);
}

function indent(ta, out) {
  const { selectionStart: a, selectionEnd: b } = ta;
  const [s, e] = lineRange(ta);
  const lines = ta.value.slice(s, e).split('\n');
  let first = 0;
  const res = lines.map((l, i) => {
    if (out) { const m = l.match(/^( {1,2}|\t)/); const d = m ? m[0].length : 0; if (i === 0) first = -d; return l.slice(d); }
    if (i === 0) first = 2;
    return '  ' + l;
  }).join('\n');
  if (a === b) replaceRange(ta, s, e, res, Math.max(s, a + first));
  else replaceRange(ta, s, e, res, s, s + res.length);
}

function onEditorKey(e) {
  const ta = e.target;
  if (e.isComposing || e.keyCode === 229) return;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'b') { e.preventDefault(); wrap(ta, '**'); return; }
  if (e.key === 'Tab') { e.preventDefault(); indent(ta, e.shiftKey); return; }
  if (e.key === 'Escape') { e.preventDefault(); setMode('view'); return; }
  if (e.key !== 'Enter' || e.shiftKey || mod) return;
  const { selectionStart: s, selectionEnd: en, value: v } = ta;
  if (s !== en) return;
  const ls = v.lastIndexOf('\n', s - 1) + 1;
  const line = v.slice(ls, s);
  const m = line.match(/^(\s*(?:>\s*)?)((?:[-*+]|(\d+)[.)])\s+(?:\[[ xX]\]\s+)?)/);
  if (!m) return;
  e.preventDefault();
  let le = v.indexOf('\n', s);
  if (le < 0) le = v.length;
  if (line.trim() === (m[1] + m[2]).trim() && !v.slice(s, le).trim()) {
    replaceRange(ta, ls, le, '', ls); // 빈 항목에서 Enter → 목록 끝내기
    return;
  }
  let marker = m[2];
  if (m[3]) marker = marker.replace(/^\d+/, String(+m[3] + 1));
  marker = marker.replace(/\[[xX]\]/, '[ ]');
  insert(ta, '\n' + m[1] + marker);
}

function toolbar(ta) {
  const b = (label, title, fn) => h('button', { type: 'button', class: 'tb', title, onmousedown: (e) => e.preventDefault(), onclick: () => fn(ta) }, label);
  return h('div', { class: 'toolbar' },
    b('제목', '제목 줄 (##)', (t) => linePrefix(t, '## ')),
    b(h('b', {}, 'B'), '굵게 (Ctrl+B)', (t) => wrap(t, '**')),
    b('☐ 할 일', '할 일 체크박스', (t) => linePrefix(t, '- [ ] ')),
    b('• 목록', '글머리 목록', (t) => linePrefix(t, '- ')),
    b('1. 번호', '번호 목록', (t) => linePrefix(t, '1. ')),
    b('표', '표 넣기', (t) => insertBlock(t, '| 항목 | 내용 |\n| --- | --- |\n|  |  |')),
    b('구분선', '구분선', (t) => insertBlock(t, '---')),
    b('시각', '지금 시각 넣기', (t) => { const d = new Date(); insert(t, `${pad(d.getHours())}:${pad(d.getMinutes())} `); }),
  );
}

function emptyEl() {
  const fid = ui.path.at(-1) ?? null;
  const f = S.get(fid);
  return h('div', { class: 'empty' }, h('div', { class: 'empty-inner' },
    f ? h('div', { class: 'empty-icon' }, icon('folder')) : h('div', { class: 'empty-icon' }, icon('note')),
    h('h2', {}, f ? f.name : '무엇을 적어볼까요?'),
    h('p', { class: 'muted' }, f ? `항목 ${S.kids(fid).length}개 · 왼쪽에서 메모를 고르거나 새로 만드세요.` : '왼쪽 목록에서 고르거나, 아래에서 바로 시작하세요.'),
    h('div', { class: 'quick' },
      h('button', { type: 'button', class: 'btn', onclick: () => newNote(fid) }, icon('note'), f ? '이 폴더에 새 메모' : '새 메모'),
      h('button', { type: 'button', class: 'btn', onclick: () => openDaily('work') }, icon('brief'), '오늘 업무일지'),
      h('button', { type: 'button', class: 'btn', onclick: () => openDaily('diary') }, icon('book'), '오늘 일기'),
      h('button', { type: 'button', class: 'btn', onclick: openSupp }, icon('pill'), '영양제 체크')),
    h('p', { class: 'hint' }, 'Ctrl+K 검색 · Ctrl+E 보기/편집 · Ctrl+S 지금 동기화', h('br'), '항목을 끌어서 순서를 바꾸거나 폴더에 넣을 수 있어요')));
}

// ---------- 일지·영양제 ----------
function ensureRoot(key, name) {
  let f = S.get(state.settings[key]);
  if (f && f.type === 'folder') {
    if (S.inTrash(f.id)) S.restore(f.id);
    return f;
  }
  f = S.create({ type: 'folder', name, parent: null });
  S.setSettings({ [key]: f.id });
  return f;
}

// 날짜 폴더·메모는 정해진 id를 써서 휴대폰·PC에서 따로 만들어도 하나로 합쳐진다.
// 템플릿만 있는 새 메모는 시각을 1로 둬서, 다른 기기에서 실제로 쓴 내용이 항상 이긴다.
function ensureChild(id, type, name, parent, pos, content = '') {
  const n = S.get(id);
  if (n) {
    if (n.trashed) S.restore(n.id);
    return { n, isNew: false };
  }
  const at = state.deleted[id] ? undefined : 1;
  return { n: S.create({ id, type, name, parent, pos, content, at }), isNew: true };
}

function openDaily(kind, date = new Date()) {
  const work = kind === 'work';
  const root = ensureRoot(work ? 'workFolder' : 'diaryFolder', work ? '업무일지' : '일기');
  const y = date.getFullYear(), m = date.getMonth() + 1, d = date.getDate();
  const yf = ensureChild(`${root.id}~${y}`, 'folder', `${y}년`, root.id, y).n;
  const mf = ensureChild(`${root.id}~${y}-${pad(m)}`, 'folder', `${m}월`, yf.id, m).n;
  const tpl = (work ? state.settings.workTemplate : state.settings.diaryTemplate) || '';
  const { n, isNew } = ensureChild(`${root.id}~${ymd(date)}`, 'note', `${m}월 ${d}일 (${WD[date.getDay()]})`, mf.id, d, tpl);
  openNote(n.id, isNew ? 'edit' : null);
  if (isNew) {
    // 템플릿 첫 칸으로 커서 이동
    const ta = $('.ed-text');
    if (ta) {
      let p = tpl.indexOf('\n') + 1;
      const le = tpl.indexOf('\n', p);
      if (/^\s*([-*+]|\d+[.)])\s/.test(tpl.slice(p, le < 0 ? undefined : le))) p = le < 0 ? tpl.length : le;
      ta.setSelectionRange(p, p);
    }
  }
}

function openSupp() {
  let n = S.get(state.settings.suppNote);
  if (!n || n.type !== 'note') {
    n = S.create({ type: 'note', kind: 'supp', name: '영양제', parent: null, data: { items: [], log: {} } });
    S.setSettings({ suppNote: n.id });
  } else if (S.inTrash(n.id)) S.restore(n.id);
  openNote(n.id, 'view');
}

// ---------- 검색 ----------
const q = $('#q');
const res = $('#results');
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function hl(text, toks) {
  const s = esc(text);
  const t = toks.filter(Boolean).map((x) => escRe(esc(x)));
  return t.length ? s.replace(new RegExp(t.join('|'), 'gi'), (m) => `<mark>${m}</mark>`) : s;
}
function snippet(content, toks) {
  const plain = (content || '')
    .replace(/^\s*(#{1,6}\s+|>\s*|[-*+]\s+\[[ xX]\]\s*|[-*+]\s+|\d+[.)]\s+)/gm, '')
    .replace(/[*`]|^\s*---\s*$/gm, '')
    .replace(/\s+/g, ' ');
  const tok = toks[0] || '';
  const i = plain.toLowerCase().indexOf(tok.toLowerCase());
  if (i < 0) return null;
  const st = Math.max(0, i - 24);
  return h('span', { class: 'res-snip', html: hl((st ? '…' : '') + plain.slice(st, i + 90), toks) });
}
function resEl(n, text) {
  const path = S.ancestors(n.id).map((a) => a.name).join(' › ');
  const toks = text ? (text.startsWith('#') ? [text] : text.toLowerCase().split(/\s+/)) : [];
  return h('button', {
    type: 'button', class: 'res',
    onclick: () => { closeResults(); if (n.type === 'folder') openFolder(n.id); else openNote(n.id); },
  },
  icon(typeIcon(n)),
  h('span', { class: 'res-main' },
    h('span', { class: 'res-name', html: hl(n.name || '제목 없음', toks) }),
    path ? h('span', { class: 'res-path' }, path) : null,
    text && n.type === 'note' ? snippet(n.content, toks) : null));
}
function renderResults() {
  const text = q.value.trim();
  const out = [];
  if (!text) {
    const tags = S.allTags().slice(0, 40);
    if (tags.length) out.push(h('div', { class: 'res-h' }, '태그'), h('div', { class: 'res-tags' }, tags.map(([t, c]) => h('button', { type: 'button', class: 'tag', onclick: () => searchFor('#' + t) }, `#${t}`, h('span', { class: 'c' }, c)))));
    const at = (n) => Math.max(n.contentAt, n.metaAt);
    const recent = Object.values(state.nodes).filter((n) => n.type === 'note' && at(n) > 1 && !S.inTrash(n.id)).sort((a, b) => at(b) - at(a)).slice(0, 8);
    if (recent.length) out.push(h('div', { class: 'res-h' }, '최근 메모'), ...recent.map((n) => resEl(n, '')));
    if (!out.length) out.push(h('p', { class: 'muted pad' }, '제목·본문에서 찾아요. #태그로 모아 보기도 돼요.'));
  } else {
    const r = S.search(text);
    out.push(h('div', { class: 'res-h' }, r.length ? `검색 결과 ${r.length}개` : '찾는 내용이 없어요'));
    out.push(...r.map((x) => resEl(x.n, text)));
  }
  res.replaceChildren(...out);
  res.hidden = false;
}
const closeResults = () => { res.hidden = true; };
function searchFor(text) { q.value = text; q.focus(); renderResults(); }

q.addEventListener('input', renderResults);
q.addEventListener('focus', renderResults);
q.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeResults(); q.blur(); }
  if (e.key === 'Enter' && !e.isComposing) res.querySelector('.res')?.click();
  if (e.key === 'ArrowDown') { e.preventDefault(); res.querySelector('.res')?.focus(); }
});
res.addEventListener('keydown', (e) => {
  const all = [...res.querySelectorAll('.res')];
  const i = all.indexOf(document.activeElement);
  if (e.key === 'ArrowDown') { e.preventDefault(); all[Math.min(i + 1, all.length - 1)]?.focus(); }
  if (e.key === 'ArrowUp') { e.preventDefault(); if (i <= 0) q.focus(); else all[i - 1].focus(); }
  if (e.key === 'Escape') { closeResults(); q.blur(); }
});

// ---------- 대화상자 ----------
const dlg = $('#dlg');
dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
function dialog(title, body, wide = false) {
  dlg.className = wide ? 'wide' : '';
  dlg.replaceChildren(h('div', { class: 'dlg-head' }, h('h2', {}, title), iconBtn('x', '닫기', () => dlg.close())), h('div', { class: 'dlg-body' }, body));
  if (!dlg.open) dlg.showModal();
}

function dateDialog() {
  const inp = h('input', { type: 'date', class: 'in', value: ymd(new Date()) });
  const go = (k) => {
    const [y, m, d] = inp.value.split('-').map(Number);
    if (!y) return;
    dlg.close();
    openDaily(k, new Date(y, m - 1, d));
  };
  dialog('날짜로 일지 열기', h('div', { class: 'stack' }, inp,
    h('div', { class: 'row' },
      h('button', { type: 'button', class: 'btn primary', onclick: () => go('work') }, icon('brief'), '업무일지'),
      h('button', { type: 'button', class: 'btn primary', onclick: () => go('diary') }, icon('book'), '일기')),
    h('p', { class: 'muted small' }, '그 날짜 메모가 있으면 열고, 없으면 새로 만들어요.')));
}

function moveDialog(n) {
  const list = h('div', { class: 'tree-pick' });
  const pick = (fid) => {
    dlg.close();
    S.move(n.id, fid);
    toast(`'${fid ? S.get(fid).name : '최상위'}'(으)로 옮겼어요`);
  };
  list.append(h('button', { type: 'button', class: 'pick', disabled: (n.parent ?? null) === null || null, onclick: () => pick(null) }, icon('folder'), '최상위 (전체)'));
  const walk = (pid, depth) => S.kids(pid).filter((k) => k.type === 'folder' && k.id !== n.id).forEach((f) => {
    list.append(h('button', { type: 'button', class: 'pick', style: `padding-left:${12 + depth * 18}px`, disabled: f.id === n.parent || null, onclick: () => pick(f.id) }, icon('folder'), f.name));
    walk(f.id, depth + 1);
  });
  walk(null, 1);
  dialog(`'${n.name || '제목 없음'}' 옮기기`, list);
}

function trashDialog() {
  const body = h('div', { class: 'stack' });
  const paint = () => {
    const items = Object.values(state.nodes).filter((n) => n.trashed).sort((a, b) => b.trashed - a.trashed);
    body.replaceChildren(...[
      items.length
        ? h('div', { class: 'trash-list' }, items.map((n) => h('div', { class: 'trash-row' },
          icon(typeIcon(n)),
          h('div', { class: 'grow' }, h('div', { class: 'ellip' }, n.name || '제목 없음'),
            h('div', { class: 'muted small' }, `${fmtTime(n.trashed)} 삭제${n.type === 'folder' ? ` · 안에 ${S.descendants(n.id).length}개` : ''}`)),
          h('button', { type: 'button', class: 'btn sm', onclick: () => { S.restore(n.id); paint(); toast('복원했어요'); } }, icon('restore'), '복원'),
          h('button', { type: 'button', class: 'btn sm danger', onclick: () => { if (confirm(`'${n.name || '제목 없음'}'을(를) 완전히 지울까요? 되돌릴 수 없어요.`)) { S.purge(n.id); paint(); } } }, '영구 삭제'))))
        : h('p', { class: 'muted' }, '휴지통이 비어 있어요.'),
      items.length ? h('button', { type: 'button', class: 'btn danger', onclick: () => { if (confirm(`휴지통의 ${items.length}개 항목을 완전히 지울까요? 되돌릴 수 없어요.`)) { items.forEach((n) => S.get(n.id) && S.purge(n.id)); paint(); } } }, icon('trash'), '휴지통 비우기') : null].filter(Boolean));
  };
  paint();
  dialog('휴지통', body, true);
}

function settingsDialog() {
  const cfg = Sync.getConfig() || {};
  const dev = new URLSearchParams(location.search).has('dev');
  const repo = h('input', { class: 'in', placeholder: '아이디/저장소이름  (예: myid/my-notes-data)', value: cfg.owner ? `${cfg.owner}/${cfg.repo}` : '', autocomplete: 'off', spellcheck: 'false', autocapitalize: 'off' });
  const token = h('input', { class: 'in', type: 'password', placeholder: cfg.token ? '저장돼 있어요 (바꿀 때만 새로 입력)' : 'github_pat_ 로 시작하는 토큰', autocomplete: 'off' });
  const api = dev ? h('input', { class: 'in', placeholder: 'API 주소 (개발용)', value: cfg.apiBase || '' }) : null;
  const st = Sync.getStatus();
  const msg = h('p', { class: `small ${st.kind === 'error' ? 'err' : 'muted'}` },
    !cfg.token ? '아직 연결 안 됨 · 이 기기에만 저장되고 있어요.' : st.kind === 'error' ? st.msg : `연결됨 · ${cfg.owner}/${cfg.repo}`);

  const connect = async () => {
    const parts = repo.value.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/$/, '').split('/');
    if (parts.length !== 2 || !parts[0] || !parts[1]) { msg.textContent = '저장소를 "아이디/저장소이름" 형태로 적어 주세요.'; msg.className = 'small err'; return; }
    const next = { owner: parts[0], repo: parts[1], token: token.value.trim() || cfg.token, apiBase: api?.value.trim() || cfg.apiBase || undefined };
    if (!next.token) { msg.textContent = '토큰을 넣어 주세요.'; msg.className = 'small err'; return; }
    msg.textContent = '확인하는 중…';
    msg.className = 'small muted';
    try {
      const r = await Sync.testConfig(next);
      if (next.owner !== cfg.owner || next.repo !== cfg.repo || next.apiBase !== cfg.apiBase) {
        for (const n of Object.values(state.nodes)) delete n.sha; // 다른 저장소 → 처음부터 올림
        state.sync.baseCommit = null;
        state.sync.dirty = true;
        S.persist(true);
      }
      Sync.setConfig(next);
      token.value = '';
      msg.textContent = '연결됐어요. 동기화를 시작해요.' + (r.warn ? `  ⚠ ${r.warn}` : '');
      msg.className = `small ${r.warn ? 'warn' : 'ok'}`;
      await Sync.syncNow();
      const s2 = Sync.getStatus();
      if (s2.kind === 'error') { msg.textContent = s2.msg; msg.className = 'small err'; }
      else if (!r.warn) msg.textContent = '연결됐어요. 이제 이 기기 내용이 GitHub에 저장돼요.';
    } catch (e) {
      msg.textContent = e.message;
      msg.className = 'small err';
    }
  };

  const tplWork = h('textarea', { class: 'in', rows: 6, value: state.settings.workTemplate, onchange: (e) => S.setSettings({ workTemplate: e.target.value }) });
  const tplDiary = h('textarea', { class: 'in', rows: 6, value: state.settings.diaryTemplate, onchange: (e) => S.setSettings({ diaryTemplate: e.target.value }) });

  dialog('설정', h('div', {},
    h('section', {},
      h('h3', { class: 'sec-h' }, 'GitHub에 저장 (휴대폰·PC 같이 쓰기)'),
      h('div', { class: 'stack' }, repo, token, api, msg,
        h('div', { class: 'row' },
          h('button', { type: 'button', class: 'btn primary', onclick: connect }, icon('sync'), cfg.token ? '저장하고 동기화' : '연결하기'),
          cfg.token ? h('button', { type: 'button', class: 'btn', onclick: () => { if (confirm('이 기기에서 GitHub 연결을 끊을까요? 메모는 이 기기에 그대로 남아요.')) { Sync.setConfig(null); Sync.refreshStatus(); dlg.close(); } } }, '연결 끊기') : null),
        h('details', { class: 'help', open: cfg.token ? null : true },
          h('summary', {}, '처음 한 번 준비하기 (5분)'),
          h('ol', {},
            h('li', {}, 'github.com 로그인 → 오른쪽 위 ＋ → ', h('b', {}, 'New repository'), ' → 이름 ', h('code', {}, 'my-notes-data'), ', ', h('b', {}, 'Private'), ' 선택 → Create'),
            h('li', {}, '프로필 사진 → Settings → 맨 아래 Developer settings → Personal access tokens → ', h('b', {}, 'Fine-grained tokens'), ' → Generate new token'),
            h('li', {}, 'Repository access: ', h('b', {}, 'Only select repositories'), ' → my-notes-data 선택'),
            h('li', {}, 'Permissions → Repository permissions → ', h('b', {}, 'Contents: Read and write')),
            h('li', {}, '만료일을 정하고 Generate → 나온 토큰을 복사해 위 칸에 붙여넣기'),
            h('li', {}, '휴대폰에서도 이 앱을 열고 같은 저장소·토큰을 한 번 넣으면 끝')),
          h('p', { class: 'small muted' }, '토큰은 이 기기 브라우저에만 저장되고 저장소에는 올라가지 않아요. 만료되면 새로 만들어 다시 넣으면 돼요.')))),
    h('section', { class: 'set-sec' },
      h('h3', { class: 'sec-h' }, '보기'),
      h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: state.settings.showNumbers, onchange: (e) => S.setSettings({ showNumbers: e.target.checked }) }), '목록에 번호(1. 2. 3.) 붙이기')),
    h('section', { class: 'set-sec' },
      h('h3', { class: 'sec-h' }, '일지 템플릿'),
      h('p', { class: 'small muted' }, '"오늘 업무일지·일기"로 새로 만들 때 들어가는 내용이에요.'),
      h('div', { class: 'stack' }, h('label', { class: 'small' }, '업무일지'), tplWork, h('label', { class: 'small' }, '일기'), tplDiary)),
    h('section', { class: 'set-sec' },
      h('h3', { class: 'sec-h' }, '관리'),
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn', onclick: trashDialog }, icon('trash'), `휴지통 (${Object.values(state.nodes).filter((n) => n.trashed).length})`),
        h('button', { type: 'button', class: 'btn', onclick: exportBackup }, '백업 파일 받기'),
        h('button', { type: 'button', class: 'btn', onclick: importBackup }, '백업에서 복원'))),
  ), true);
}

function exportBackup() {
  const data = JSON.stringify({ app: 'my-notes', exportedAt: new Date().toISOString(), nodes: state.nodes, deleted: state.deleted, settings: state.settings }, null, 1);
  const a = h('a', { href: URL.createObjectURL(new Blob([data], { type: 'application/json' })), download: `메모장-백업-${ymd(new Date())}.json` });
  document.body.append(a);
  a.click();
  a.remove();
}

function importBackup() {
  const inp = h('input', { type: 'file', accept: '.json,application/json' });
  inp.onchange = async () => {
    const f = inp.files[0];
    if (!f) return;
    let d;
    try { d = JSON.parse(await f.text()); } catch { alert('백업 파일을 읽지 못했어요.'); return; }
    if (d.app !== 'my-notes' || !d.nodes) { alert('내 메모장 백업 파일이 아니에요.'); return; }
    if (!confirm(`백업(${d.exportedAt?.slice(0, 10) || '날짜 모름'})으로 지금 내용을 바꿀까요?\n지금 있는 메모 중 백업에 없는 것은 휴지통 없이 지워져요.`)) return;
    const now = Date.now();
    for (const id of Object.keys(state.nodes)) if (!d.nodes[id]) { delete state.nodes[id]; state.deleted[id] = now; }
    for (const n of Object.values(d.nodes)) { state.nodes[n.id] = { ...n, metaAt: now, contentAt: now }; delete state.nodes[n.id].sha; delete state.nodes[n.id].pending; delete state.deleted[n.id]; }
    if (d.settings) S.setSettings(d.settings);
    S.changed();
    dlg.close();
    toast('백업에서 복원했어요');
  };
  inp.click();
}

// ---------- 휴대폰 화면 ----------
let histDepth = 0;
function renderMobile() {
  document.body.classList.toggle('is-note', !!ui.note);
  const f = S.get(ui.path.at(-1));
  $('#m-title').textContent = f ? f.name || '제목 없음' : '전체';
  $('#m-back').hidden = !f && !ui.note;
}
function goBack() {
  if (ui.note) ui.note = null;
  else ui.path.pop();
  render();
}
function syncHistory() {
  if (!isMobile()) return;
  const d = ui.path.length + (ui.note ? 1 : 0);
  while (histDepth < d) { history.pushState({ app: histDepth }, ''); histDepth++; }
}
window.addEventListener('popstate', () => {
  if (histDepth > 0) histDepth--;
  if (ui.note || ui.path.length) goBack();
});
$('#m-back').addEventListener('click', () => { if (histDepth > 0) history.back(); else goBack(); });

// ---------- 시작 ----------
function paintSync(st) {
  const chip = $('#sync-chip');
  const map = {
    off: ['cloudOff', '이 기기에만'], pending: ['sync', '저장 대기'], syncing: ['sync', '동기화 중'],
    ok: ['check', '동기화됨'], error: ['alert', '동기화 오류'], offline: ['cloudOff', '오프라인'],
  };
  const [ic, label] = map[st.kind] || map.off;
  chip.className = `sync-chip k-${st.kind}`;
  chip.replaceChildren(icon(ic), h('span', { class: 'lbl' }, label));
  chip.title = st.msg || (st.kind === 'off' ? '설정에서 GitHub를 연결하면 휴대폰과 같이 쓸 수 있어요' : st.kind === 'ok' ? `${label} · ${fmtTime(st.at)} · 누르면 지금 동기화` : label);
}

async function init() {
  document.querySelectorAll('[data-ic]').forEach((el) => el.prepend(icon(el.dataset.ic)));
  try { if (localStorage.getItem('focus')) document.body.classList.add('focus'); } catch {}
  await S.load();

  S.subscribe((reason) => {
    validateUi();
    renderColumns();
    renderEditor(reason);
    renderMobile();
    if (!res.hidden && document.activeElement === q) renderResults();
  });
  let syncT;
  S.setOnDirty(() => { Sync.markPending(); clearTimeout(syncT); syncT = setTimeout(Sync.syncNow, 5000); });
  Sync.onSyncStatus(paintSync);

  $('#btn-work').onclick = () => openDaily('work');
  $('#btn-diary').onclick = () => openDaily('diary');
  $('#btn-date').onclick = dateDialog;
  $('#btn-supp').onclick = openSupp;
  $('#btn-settings').onclick = settingsDialog;
  $('#sync-chip').onclick = () => { const k = Sync.getStatus().kind; if (k === 'off' || k === 'error') settingsDialog(); else Sync.syncNow(); };

  document.addEventListener('pointerdown', (e) => {
    if (!$('#menu').hidden && !e.target.closest('#menu')) closeMenu();
    if (!res.hidden && !e.target.closest('.search-wrap')) closeResults();
  });
  document.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (mod && k === 'k') { e.preventDefault(); q.focus(); q.select(); }
    else if (mod && k === 's') { e.preventDefault(); S.persist(true); Sync.syncNow(); toast(Sync.configured() ? '동기화할게요' : '이 기기에 저장돼 있어요'); }
    else if (mod && k === 'e' && ed.id) { e.preventDefault(); setMode(ed.mode === 'edit' ? 'view' : 'edit'); }
    else if (mod && e.key === '\\' && !isMobile()) { e.preventDefault(); toggleFocus(); }
    else if (e.key === 'Escape') closeMenu();
  });

  render();
  Sync.refreshStatus();
  Sync.syncNow();
  setInterval(() => { if (document.visibilityState === 'visible') Sync.syncNow(); }, 60000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') Sync.syncNow();
    else { S.persist(true); if (state.sync.dirty) Sync.syncNow(); }
  });
  window.addEventListener('pagehide', () => S.persist(true));
  window.addEventListener('online', () => Sync.syncNow());
  window.addEventListener('offline', () => Sync.refreshStatus());
  mq.addEventListener('change', render);

  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}

init();
