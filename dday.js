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
// 기간: 시작일 + n일·주·개월·년 → 끝나는 날 (유통기한·개봉 후 사용기한·약정 기간)
export const UNIT = { d: '일', w: '주', m: '개월', y: '년' };
export function addLen(fromKey, len) {
  const b = parse(fromKey), n = Math.max(0, Math.floor(+len?.n || 0));
  if (len?.unit === 'd') return new Date(b.getFullYear(), b.getMonth(), b.getDate() + n);
  if (len?.unit === 'w') return new Date(b.getFullYear(), b.getMonth(), b.getDate() + n * 7);
  return addMonths(b, len?.unit === 'y' ? n * 12 : n);
}
const lenText = (len) => `${len.n}${UNIT[len.unit] || '개월'}`;
// a → b 사이를 "1년 2개월 3일"로 (a ≤ b)
export function spanText(a, b) {
  let m = (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth();
  if (addMonths(a, m) > b) m--;
  const d = diff(addMonths(a, m), b);
  const y = Math.floor(m / 12);
  return [y ? `${y}년` : '', m % 12 ? `${m % 12}개월` : '', d ? `${d}일` : ''].filter(Boolean).join(' ') || '0일';
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
  // 한 달이 넘게 남았거나 기간으로 정한 항목은 "3개월 14일 남음"처럼도 보여 준다
  const remain = left > 0 ? `${spanText(t, when)} 남음` : left < 0 ? `${spanText(when, t)} 지남` : '오늘까지';
  const showRemain = !!it.from || Math.abs(left) > 31;
  // 기간으로 정한 항목: 시작일 글자와 진행 막대 (반복으로 다음 회차로 넘어갔으면 그 회차의 시작일 기준)
  let pct = null, from = '';
  if (it.from && it.len) {
    const base = parse(it.date), f0 = parse(it.from);
    const k = STEP[it.repeat];
    const start = when.getTime() === base.getTime() ? f0 : k ? addMonths(when, -k) : new Date(when.getTime() - (base - f0));
    from = `${fmt(start)}부터 ${lenText(it.len)} · `;
    const total = diff(start, when);
    pct = total > 0 ? Math.min(1, Math.max(0, diff(start, t) / total)) : 1;
  }
  return { big, sub: `${from}${fmt(when)}${it.from ? '까지' : ''}${rep}`, remain: showRemain ? remain : '', pct, sort: left < 0 ? 1e9 - left : left, cls };
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
    const v = { name: '', date: ymd(new Date()), mode: 'until', repeat: 'none', memo: '', from: '', len: { n: 6, unit: 'm' }, ...(it || {}) };
    let mode = v.mode;
    let how = v.from ? 'len' : 'date'; // 남은 날: 날짜를 바로 / 시작일+기간으로
    const name = h('input', { class: 'in', placeholder: '이름 (예: 우리 만난 날, 선크림 개봉 후 6개월, 멤버십 교체)', value: v.name });
    const date = h('input', { class: 'in', type: 'date', value: v.date });
    const rep = h('select', { class: 'in' }, Object.entries(REPEAT).map(([k, l]) => h('option', { value: k, selected: k === v.repeat || null }, l)));
    const memo = h('input', { class: 'in', placeholder: '메모 (선택)', value: v.memo || '' });
    const dateLbl = h('span', {});
    const repLbl = h('label', {}, h('span', {}, '반복'), rep);
    // 기간으로: 시작일 + 숫자 + 단위 → 끝나는 날 미리 보기
    const from = h('input', { class: 'in', type: 'date', value: v.from || ymd(new Date()) });
    const lenN = h('input', { class: 'in', type: 'number', min: '0', inputmode: 'numeric', value: v.len?.n ?? 6, 'aria-label': '기간' });
    const lenU = h('select', { class: 'in', 'aria-label': '단위' }, Object.entries(UNIT).map(([k, l]) => h('option', { value: k, selected: k === (v.len?.unit || 'm') || null }, l)));
    const preview = h('p', { class: 'small muted dday-preview' });
    const target = () => (from.value && lenN.value !== '' ? ymd(addLen(from.value, { n: +lenN.value, unit: lenU.value })) : '');
    const paintPreview = () => { const k = target(); preview.textContent = k ? `→ ${fmt(parse(k))}까지` : ''; };
    [from, lenN, lenU].forEach((x) => x.addEventListener('input', paintPreview));
    paintPreview();
    const howSeg = h('div', { class: 'seg', role: 'group', 'aria-label': '날짜 정하는 방법' });
    const dateRow = h('div', { class: 'row2' }, h('label', {}, dateLbl, date), repLbl);
    const lenRow = h('div', { class: 'dday-len' },
      h('div', { class: 'row2' },
        h('label', {}, h('span', {}, '시작한 날 (예: 개봉일·가입일)'), from),
        h('label', {}, h('span', {}, '기간'), h('div', { class: 'len-in' }, lenN, lenU))),
      preview);
    const seg = h('div', { class: 'seg wide', role: 'group', 'aria-label': '세는 방법' });
    const paintSeg = () => {
      seg.replaceChildren(...[['until', 'D-day (남은 날)'], ['since', '며칠째 (지난 날)']].map(([k, l]) =>
        h('button', { type: 'button', class: k === mode ? 'on' : '', onclick: () => { mode = k; paintSeg(); } }, l)));
      dateLbl.textContent = mode === 'since' ? '시작한 날 (이날이 1일)' : '날짜';
      repLbl.hidden = mode === 'since';
      howSeg.hidden = mode === 'since';
      howSeg.replaceChildren(...[['date', '날짜로'], ['len', '기간으로 (○개월 뒤)']].map(([k, l]) =>
        h('button', { type: 'button', class: k === how ? 'on' : '', onclick: () => { how = k; paintSeg(); } }, l)));
      const byLen = mode === 'until' && how === 'len';
      dateRow.hidden = byLen;
      lenRow.hidden = !byLen;
      // 기간으로 정할 때도 반복(예: 6개월마다 교체)은 고를 수 있게 기간 칸 아래로 옮긴다
      (byLen ? lenRow : dateRow).append(repLbl);
    };
    paintSeg();
    const submit = () => {
      const nm = name.value.trim();
      if (!nm) { name.focus(); return; }
      const byLen = mode === 'until' && how === 'len';
      if (byLen && !target()) { (from.value ? lenN : from).focus(); return; }
      if (!byLen && !date.value) { date.focus(); return; }
      const rec = { name: nm, date: byLen ? target() : date.value, mode, repeat: mode === 'since' ? 'none' : rep.value, memo: memo.value.trim(),
        from: byLen ? from.value : '', len: byLen ? { n: Math.floor(+lenN.value), unit: lenU.value } : null };
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
      howSeg,
      dateRow,
      lenRow,
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
        info.remain ? h('span', { class: 'dday-remain' }, info.remain) : null,
        info.pct != null ? h('span', { class: 'dday-bar', title: `${Math.round(info.pct * 100)}% 지남` }, h('span', { style: `width:${(info.pct * 100).toFixed(1)}%` })) : null,
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
