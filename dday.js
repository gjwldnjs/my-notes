// D-day: 남은 날(D-3) · 며칠째(만난 지 345일째) · 반복(멤버십 교체일처럼 매월·매년 돌아오는 날)
import { h, icon, ymd, WD } from './dom.js';
import * as S from './store.js';

const DAY = 864e5;
const parse = (key) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d); };
const today0 = () => { const t = new Date(); return new Date(t.getFullYear(), t.getMonth(), t.getDate()); };
const diff = (a, b) => Math.round((b - a) / DAY); // a → b 까지 며칠
const fmt = (d) => `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()} (${WD[d.getDay()]})`;

export const REPEAT = { none: '반복 안 함', m1: '매월', m3: '3개월마다', m6: '6개월마다', y1: '매년' };
const STEP = { m1: 1, m3: 3, m6: 6, y1: 12 };

// base 날짜에서 n달 뒤 (31일 → 2월이면 28·29일로 맞춘다)
function addMonths(base, n) {
  const y = base.getFullYear(), m = base.getMonth() + n;
  const last = new Date(y, m + 1, 0).getDate();
  return new Date(y, m, Math.min(base.getDate(), last));
}
// 반복 일정이면 오늘 이후(오늘 포함) 가장 가까운 날로
function nextDate(it, t) {
  const base = parse(it.date);
  const k = STEP[it.repeat];
  if (!k || base >= t) return base;
  let i = Math.ceil(((t.getFullYear() - base.getFullYear()) * 12 + t.getMonth() - base.getMonth()) / k) - 1;
  if (i < 0) i = 0;
  let d = addMonths(base, i * k);
  while (d < t) d = addMonths(base, ++i * k);
  return d;
}

// 화면에 보일 숫자와 설명
export function ddayInfo(it, t = today0()) {
  if (it.mode === 'since') {
    const start = parse(it.date);
    const n = diff(start, t) + 1; // 시작한 날이 1일
    if (n < 1) return { big: `D-${1 - n}`, sub: `${fmt(start)} 부터`, sort: 1 - n, cls: '' };
    // 다음 기념일: 100일 단위와 주년 중 가까운 것
    const next100 = Math.ceil((n + 1) / 100) * 100;
    const d100 = new Date(start.getTime() + (next100 - 1) * DAY);
    let yr = t.getFullYear() - start.getFullYear();
    let anniv = addMonths(start, yr * 12);
    if (anniv <= t) anniv = addMonths(start, ++yr * 12);
    const [name, when] = d100 < anniv ? [`${next100}일`, d100] : [`${yr}주년`, anniv];
    const left = diff(t, when);
    return { big: `${n.toLocaleString()}일째`, sub: `${fmt(start)} 부터 · ${name}까지 ${left}일 (${when.getMonth() + 1}/${when.getDate()})`, sort: -1e9, cls: 'since' };
  }
  const when = nextDate(it, t);
  const left = diff(t, when);
  const big = left > 0 ? `D-${left}` : left === 0 ? 'D-Day' : `D+${-left}`;
  // 유통기한처럼 날짜가 다가오면 색으로 알려 준다: 지남 빨강 · 3일 이내 주황
  const cls = left < 0 ? 'past' : left <= 3 ? 'soon' : '';
  const rep = it.repeat && it.repeat !== 'none' ? ` · ${REPEAT[it.repeat]}` : '';
  return { big, sub: `${fmt(when)}${rep}`, sort: left < 0 ? 1e9 - left : left, cls };
}

export function ddayEl(n) {
  const root = h('div', { class: 'dday' });
  let editing = null; // null | 'new' | 항목 id

  const data = () => S.get(n.id)?.data || { items: [] };
  const save = (fn) => {
    const d = structuredClone(data());
    d.items ||= [];
    fn(d);
    S.setData(n.id, d);
  };

  function form(it) {
    const v = { name: '', date: ymd(new Date()), mode: 'until', repeat: 'none', memo: '', ...(it || {}) };
    let mode = v.mode;
    const name = h('input', { class: 'in', placeholder: '이름 (예: 우리 만난 날, 우유 유통기한, 멤버십 교체)', value: v.name });
    const date = h('input', { class: 'in', type: 'date', value: v.date });
    const rep = h('select', { class: 'in' }, Object.entries(REPEAT).map(([k, l]) => h('option', { value: k, selected: k === v.repeat || null }, l)));
    const memo = h('input', { class: 'in', placeholder: '메모 (선택)', value: v.memo || '' });
    const dateLbl = h('span', {});
    const repLbl = h('label', {}, h('span', {}, '반복'), rep);
    const seg = h('div', { class: 'seg wide', role: 'group', 'aria-label': '세는 방법' });
    const paintSeg = () => {
      seg.replaceChildren(...[['until', 'D-day (남은 날)'], ['since', '며칠째 (지난 날)']].map(([k, l]) =>
        h('button', { type: 'button', class: k === mode ? 'on' : '', onclick: () => { mode = k; paintSeg(); } }, l)));
      dateLbl.textContent = mode === 'since' ? '시작한 날 (이날이 1일)' : '날짜';
      repLbl.hidden = mode === 'since';
    };
    paintSeg();
    const submit = () => {
      const nm = name.value.trim();
      if (!nm) { name.focus(); return; }
      if (!date.value) { date.focus(); return; }
      const rec = { name: nm, date: date.value, mode, repeat: mode === 'since' ? 'none' : rep.value, memo: memo.value.trim() };
      save((d) => {
        const cur = it && d.items.find((x) => x.id === it.id);
        if (cur) Object.assign(cur, rec); else d.items.push({ id: S.uid(), ...rec });
      });
      editing = null; paint();
    };
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); submit(); } });
    setTimeout(() => { if (!it) name.focus(); });
    return h('div', { class: 'ev-form dday-form' },
      name,
      seg,
      h('div', { class: 'row2' }, h('label', {}, dateLbl, date), repLbl),
      memo,
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn primary sm', onclick: submit }, it ? '저장' : '추가'),
        h('button', { type: 'button', class: 'btn sm', onclick: () => { editing = null; paint(); } }, '취소'),
        it ? h('span', { style: 'flex:1' }) : null,
        it ? h('button', { type: 'button', class: 'btn sm danger', onclick: () => {
          if (!confirm(`'${it.name}'을(를) 지울까요?`)) return;
          save((d) => { d.items = d.items.filter((x) => x.id !== it.id); });
          editing = null; paint();
        } }, '삭제') : null));
  }

  function paint() {
    const t = today0();
    const items = (data().items || []).map((it) => ({ it, info: ddayInfo(it, t) }))
      .sort((a, b) => a.info.sort - b.info.sort);
    const cards = items.map(({ it, info }) => (editing === it.id ? form(it) : h('button', {
      type: 'button', class: `dday-card ${info.cls}`, title: '눌러서 고치기',
      onclick: () => { editing = it.id; paint(); },
    },
      h('span', { class: 'dday-num' }, info.big),
      h('span', { class: 'dday-txt' },
        h('span', { class: 'dday-name' }, it.name),
        h('span', { class: 'dday-sub' }, info.sub),
        it.memo ? h('span', { class: 'dday-sub' }, it.memo) : null))));
    root.replaceChildren(
      h('div', { class: 'dday-list' }, cards.length ? cards : editing === 'new' ? null : h('p', { class: 'muted small' }, '아직 없어요. 아래에서 추가해 보세요.')),
      editing === 'new' ? form(null)
        : h('button', { type: 'button', class: 'btn', onclick: () => { editing = 'new'; paint(); } }, icon('plus'), 'D-day 추가'));
  }

  paint();
  // 다른 기기에서 바뀌면 다시 그리기 (고치는 중이면 건드리지 않음)
  root.repaint = () => { if (!editing) paint(); };
  return root;
}
