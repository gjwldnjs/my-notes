// 월별 캘린더: 일정(반복 포함) + 공휴일 + 그날의 업무일지·일기·영양제 표시
import { h, icon, iconBtn, ymd, pad, WD } from './dom.js';
import * as S from './store.js';
import { state } from './store.js';
import { holidayOf, observancesOf } from './holidays.js';

export const COLORS = ['green', 'blue', 'red', 'yellow', 'purple'];
const COLOR_NAME = { green: '초록', blue: '파랑', red: '빨강', yellow: '노랑', purple: '보라' };
export const REPEAT = { none: '반복 안 함', weekly: '매주', monthly: '매달', yearly: '매년' };

export const parseKey = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, k) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + k);
const dayDiff = (a, b) => Math.round((parseKey(b) - parseKey(a)) / 86400000);

// 일정 하나가 s(시작일)에 시작하는 회차가 있는지
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

// 그날(YYYY-MM-DD)에 걸치는 일정들. 여러 날 일정은 이어지는 날에도 나온다.
export function eventsOn(events, key) {
  const day = parseKey(key);
  const out = [];
  for (const ev of events || []) {
    const span = ev.end && ev.end > ev.date ? dayDiff(ev.date, ev.end) : 0;
    for (let k = 0; k <= span; k++) {
      const s = addDays(day, -k);
      const sk = ymd(s);
      if (startsOn(ev, s, sk)) { out.push({ ev, first: k === 0, startKey: sk }); break; }
    }
  }
  return out.sort((a, b) => (a.ev.time || '').localeCompare(b.ev.time || '') || (a.ev.title || '').localeCompare(b.ev.title || '', 'ko'));
}

// 보고 있는 달·고른 날 (화면을 다시 그려도 유지)
const view = { month: null, sel: null };
export function calGoto(key) { view.sel = key; view.month = key.slice(0, 7); }
export const calMonth = () => view.month || ymd(new Date()).slice(0, 7); // 지금 보고 있는 달 'YYYY-MM'

// 그날 업무일지·일기 메모 (없으면 null)
function dailyNode(folderKey, key) {
  const id = `${state.settings[folderKey]}~${key}`;
  const n = S.get(id);
  return n && !S.inTrash(id) ? n : null;
}
// 템플릿만 있고 아직 손대지 않은 메모는 "쓴 날"로 치지 않는다 (템플릿 메모는 시각이 1)
const written = (n) => !!n && n.contentAt > 1;

function suppStatus(key) {
  const n = S.get(state.settings.suppNote);
  const items = (n?.data?.items || []).filter((it) => it.active !== false);
  if (!n || S.inTrash(n.id) || !items.length) return null;
  const log = new Set(n.data.log?.[key] || []);
  return { done: items.filter((it) => log.has(it.id)).length, total: items.length };
}

export function calEl(n, { openDaily, openSupp, onMonth }) {
  const root = h('div', { class: 'cal' });
  let shownMonth = null; // 달이 바뀔 때만 onMonth 를 부른다
  let editing = null; // { id } 고치는 중 (새 일정이면 id: null)
  let confirmDel = null; // 반복 일정 삭제 방법 묻는 중인 id

  const events = () => S.get(n.id)?.data?.events || [];
  const save = (fn) => {
    const d = structuredClone(S.get(n.id)?.data || {});
    d.events ||= [];
    fn(d);
    S.setData(n.id, d);
  };

  function marks(key) {
    const out = [];
    if (written(dailyNode('workFolder', key))) out.push('work');
    if (written(dailyNode('diaryFolder', key))) out.push('diary');
    const sp = suppStatus(key);
    if (sp && sp.done === sp.total) out.push('supp');
    return out;
  }

  function paint() {
    const today = ymd(new Date());
    view.sel ||= today;
    view.month ||= view.sel.slice(0, 7);
    const [y, m] = view.month.split('-').map(Number);
    if (view.month !== shownMonth) { shownMonth = view.month; onMonth?.(view.month); }
    const first = new Date(y, m - 1, 1);
    const days = new Date(y, m, 0).getDate();
    const weeks = Math.ceil((first.getDay() + days) / 7);
    const evs = events();

    const cells = [];
    for (let i = 0; i < weeks * 7; i++) {
      const d = new Date(y, m - 1, 1 - first.getDay() + i);
      const key = ymd(d);
      const hol = holidayOf(key);
      const obs = observancesOf(key, state.settings.showDays);
      const list = eventsOn(evs, key);
      const mk = marks(key);
      cells.push(h('button', {
        type: 'button',
        class: `cal-cell ${d.getMonth() !== m - 1 ? 'out' : ''} ${key === today ? 'today' : ''} ${key === view.sel ? 'sel' : ''} ${d.getDay() === 0 || hol ? 'sun' : d.getDay() === 6 ? 'sat' : ''}`,
        'aria-label': `${d.getMonth() + 1}월 ${d.getDate()}일${hol ? ' ' + hol : ''}${list.length ? ` 일정 ${list.length}개` : ''}`,
        onclick: () => { view.sel = key; view.month = key.slice(0, 7); editing = null; confirmDel = null; paint(); },
      },
      h('span', { class: 'cal-top' }, h('span', { class: 'dn' }, d.getDate()), hol ? h('span', { class: 'hn' }, hol) : null,
        ...obs.map((o) => h('span', { class: 'hn on', title: o.name }, o.name))),
      h('span', { class: 'evs' },
        list.slice(0, 3).map((o) => h('span', { class: `ev c-${o.ev.color || 'green'} ${o.first ? '' : 'cont'}` },
          h('span', { class: 'ev-t' }, o.first && o.ev.time ? `${o.ev.time} ` : '', o.ev.title || '(제목 없음)'))),
        list.length > 3 ? h('span', { class: 'more-ev' }, `+${list.length - 3}`) : null),
      mk.length ? h('span', { class: 'marks' }, mk.map((x) => h('span', { class: `mk mk-${x}` }))) : null));
    }

    const shift = (k) => {
      const dt = new Date(y, m - 1 + k, 1);
      view.month = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}`;
      paint();
    };
    root.replaceChildren(
      h('div', { class: 'cal-head' },
        iconBtn('back', '이전 달', () => shift(-1)),
        h('h3', {}, `${y}년 ${m}월`),
        iconBtn('chev', '다음 달', () => shift(1)),
        h('button', { type: 'button', class: 'btn sm', onclick: () => { calGoto(today); editing = null; paint(); } }, '오늘')),
      h('div', { class: 'cal-wrap' },
        h('div', { class: 'cal-grid' },
          WD.map((w, i) => h('div', { class: `cal-wd ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}` }, w)),
          cells),
        dayPanel()),
      h('div', { class: 'cal-legend' },
        h('span', {}, h('span', { class: 'mk mk-work' }), '업무일지'),
        h('span', {}, h('span', { class: 'mk mk-diary' }), '일기'),
        h('span', {}, h('span', { class: 'mk mk-supp' }), '영양제 다 먹음')));
    if (editing) root.querySelector('.ev-form .in')?.focus();
  }

  function dayPanel() {
    const key = view.sel;
    const d = parseKey(key);
    const hol = holidayOf(key);
    const obs = observancesOf(key, state.settings.showDays);
    const list = eventsOn(events(), key);
    const panel = h('aside', { class: 'cal-day' },
      h('div', { class: 'cal-day-h' },
        h('h3', {}, `${d.getMonth() + 1}월 ${d.getDate()}일 (${WD[d.getDay()]})`),
        hol ? h('span', { class: 'hol-badge' }, hol) : null,
        ...obs.map((o) => h('span', { class: 'hol-badge on' }, o.name))));
    if (list.length) panel.append(h('ul', { class: 'ev-list' }, list.map((o) => evRow(o, key))));
    else if (!editing) panel.append(h('p', { class: 'muted small' }, '일정이 없어요.'));
    if (editing) panel.append(evForm(key));
    else panel.append(h('button', { type: 'button', class: 'btn sm add-ev', onclick: () => { editing = { id: null }; confirmDel = null; paint(); } }, icon('plus'), '일정 추가'));

    const w = dailyNode('workFolder', key), di = dailyNode('diaryFolder', key);
    const sp = suppStatus(key);
    panel.append(h('div', { class: 'day-links' },
      h('div', { class: 'small muted' }, '이날 기록'),
      h('div', { class: 'row' },
        h('button', { type: 'button', class: `btn sm ${w ? 'has' : ''}`, onclick: () => openDaily('work', d) }, icon('brief'), w ? '업무일지 보기' : '업무일지 쓰기'),
        h('button', { type: 'button', class: `btn sm ${di ? 'has' : ''}`, onclick: () => openDaily('diary', d) }, icon('book'), di ? '일기 보기' : '일기 쓰기'),
        sp ? h('button', { type: 'button', class: `btn sm ${sp.done === sp.total ? 'has' : ''}`, onclick: openSupp }, icon('pill'), `영양제 ${sp.done}/${sp.total}`) : null)));
    return panel;
  }

  function evRow(o, key) {
    const ev = o.ev;
    const repeat = ev.repeat && ev.repeat !== 'none';
    const range = ev.end ? `${ev.date.slice(5).replace('-', '/')}~${ev.end.slice(5).replace('-', '/')}` : '';
    const li = h('li', { class: `ev-row c-${ev.color || 'green'}` },
      h('span', { class: 'bar' }),
      h('div', { class: 'grow' },
        h('div', { class: 'ev-title' }, ev.time ? h('span', { class: 'ev-time' }, ev.time) : null, ev.title || '(제목 없음)'),
        (repeat || range || ev.memo) ? h('div', { class: 'small muted' }, [repeat ? REPEAT[ev.repeat] : '', range, ev.memo || ''].filter(Boolean).join(' · ')) : null),
      iconBtn('edit', '고치기', () => { editing = { id: ev.id }; confirmDel = null; paint(); }),
      iconBtn('trash', '삭제', () => {
        if (repeat) { confirmDel = ev.id; paint(); return; }
        save((d) => { d.events = d.events.filter((e) => e.id !== ev.id); });
        paint();
      }, 'danger'));
    if (confirmDel !== ev.id) return li;
    return h('li', { class: 'ev-confirm' }, li,
      h('div', { class: 'row' },
        h('span', { class: 'small' }, '반복 일정이에요.'),
        h('button', { type: 'button', class: 'btn sm', onclick: () => { save((d) => { const e = d.events.find((x) => x.id === ev.id); e.skip = [...new Set([...(e.skip || []), o.startKey])]; }); confirmDel = null; paint(); } }, '이 날만 삭제'),
        h('button', { type: 'button', class: 'btn sm danger', onclick: () => { save((d) => { d.events = d.events.filter((e) => e.id !== ev.id); }); confirmDel = null; paint(); } }, '전체 삭제'),
        h('button', { type: 'button', class: 'btn sm', onclick: () => { confirmDel = null; paint(); } }, '취소')));
  }

  function evForm(key) {
    const ev = editing.id ? events().find((e) => e.id === editing.id) : null;
    const v = { title: '', date: key, end: '', time: '', repeat: 'none', color: 'green', memo: '', ...(ev || {}) };
    const title = h('input', { class: 'in', placeholder: '일정 이름', value: v.title });
    const date = h('input', { class: 'in', type: 'date', value: v.date });
    const end = h('input', { class: 'in', type: 'date', value: v.end || '' });
    const time = h('input', { class: 'in', type: 'time', value: v.time || '' });
    const rep = h('select', { class: 'in' }, Object.entries(REPEAT).map(([k, l]) => h('option', { value: k, selected: k === v.repeat || null }, l)));
    let color = v.color;
    const sw = h('div', { class: 'swatches' }, COLORS.map((c) => h('button', {
      type: 'button', class: `sw c-${c} ${c === color ? 'on' : ''}`, title: COLOR_NAME[c], 'aria-label': COLOR_NAME[c],
      onclick: (e) => { color = c; sw.querySelectorAll('.sw').forEach((b) => b.classList.toggle('on', b === e.currentTarget)); },
    })));
    const memo = h('input', { class: 'in', placeholder: '메모 (선택)', value: v.memo || '' });
    const submit = () => {
      const t = title.value.trim();
      if (!t) { title.focus(); return; }
      if (!date.value) { date.focus(); return; }
      const rec = { title: t, date: date.value, end: end.value && end.value > date.value ? end.value : '', time: time.value, repeat: rep.value, color, memo: memo.value.trim() };
      save((d) => {
        const cur = ev && d.events.find((e) => e.id === ev.id);
        if (cur) Object.assign(cur, rec);
        else d.events.push({ id: S.uid(), ...rec, skip: [] });
      });
      editing = null;
      calGoto(rec.date);
      paint();
    };
    title.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); submit(); } });
    return h('div', { class: 'ev-form' },
      title,
      h('div', { class: 'row2' }, h('label', {}, h('span', {}, '날짜'), date), h('label', {}, h('span', {}, '끝나는 날 (여러 날일 때)'), end)),
      h('div', { class: 'row2' }, h('label', {}, h('span', {}, '시간 (선택)'), time), h('label', {}, h('span', {}, '반복'), rep)),
      sw,
      memo,
      ev && ev.repeat !== 'none' ? h('p', { class: 'small muted' }, '반복 일정을 고치면 모든 회차가 함께 바뀌어요.') : null,
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn primary sm', onclick: submit }, ev ? '저장' : '추가'),
        h('button', { type: 'button', class: 'btn sm', onclick: () => { editing = null; paint(); } }, '취소')));
  }

  paint();
  root.repaint = () => { if (!editing) paint(); };
  return root;
}
