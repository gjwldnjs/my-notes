// 영양제 체크 표: 오늘 체크 + 월별 달력 표 + 목록 관리
import { h, icon, iconBtn, ymd, pad, WD } from './dom.js';
import * as S from './store.js';

const monthOf = new Map(); // 메모별로 보고 있는 달

const blank = () => ({ items: [], log: {} });

export function suppEl(n) {
  const root = h('div', { class: 'supp' });
  const top = h('div');
  const manage = h('div');
  let manageOpen = null;
  root.append(top, manage);

  const data = () => S.get(n.id)?.data || blank();
  const save = (fn) => {
    const d = structuredClone(data());
    d.items ||= [];
    d.log ||= {};
    fn(d);
    S.setData(n.id, d);
  };
  const toggle = (date, itemId) => save((d) => {
    const set = new Set(d.log[date] || []);
    set.has(itemId) ? set.delete(itemId) : set.add(itemId);
    if (set.size) d.log[date] = [...set];
    else delete d.log[date];
  });

  function paintTop() {
    const d = data();
    const today = new Date();
    const tk = ymd(today);
    const active = d.items.filter((it) => it.active !== false);
    const done = new Set(d.log[tk] || []);

    // 오늘
    const chips = active.map((it) => h('button', {
      type: 'button',
      class: `supp-chip ${done.has(it.id) ? 'on' : ''}`,
      'aria-pressed': done.has(it.id) ? 'true' : 'false',
      onclick: () => { toggle(tk, it.id); paintTop(); },
    }, h('span', { class: 'box' }, icon('check')), h('span', { class: 'nm' }, it.name || '이름 없음'), it.note ? h('span', { class: 'sub' }, it.note) : null));
    const todayBox = h('section', { class: 'supp-today' },
      h('div', { class: 'supp-h' },
        h('h3', {}, `오늘 · ${today.getMonth() + 1}월 ${today.getDate()}일 (${WD[today.getDay()]})`),
        active.length ? h('span', { class: 'muted' }, `${active.filter((it) => done.has(it.id)).length} / ${active.length}`) : null),
      active.length ? h('div', { class: 'supp-chips' }, chips) : h('p', { class: 'muted' }, '아래 "영양제 목록"에서 먹고 있는 영양제를 추가하세요.'));

    // 월 표
    const ym = monthOf.get(n.id) || tk.slice(0, 7);
    const [y, m] = ym.split('-').map(Number);
    const days = new Date(y, m, 0).getDate();
    const shift = (k) => { const dt = new Date(y, m - 1 + k, 1); monthOf.set(n.id, `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}`); paintTop(); };
    const isCur = ym === tk.slice(0, 7);
    const elapsed = isCur ? today.getDate() : (new Date(y, m - 1, 1) > today ? 0 : days);
    const rows = d.items.filter((it) => it.active !== false || Object.entries(d.log).some(([k, v]) => k.startsWith(ym) && v.includes(it.id)));

    const head = h('tr', {}, h('th', { class: 'stick' }, '영양제'),
      Array.from({ length: days }, (_, i) => {
        const wd = new Date(y, m - 1, i + 1).getDay();
        return h('th', { class: `${wd === 0 ? 'sun' : wd === 6 ? 'sat' : ''} ${isCur && i + 1 === today.getDate() ? 'today' : ''}` }, i + 1);
      }),
      h('th', { class: 'sum' }, '횟수'));
    const body = rows.map((it) => {
      let cnt = 0;
      const cells = Array.from({ length: days }, (_, i) => {
        const key = `${ym}-${pad(i + 1)}`;
        const on = (d.log[key] || []).includes(it.id);
        if (on) cnt++;
        const future = new Date(y, m - 1, i + 1) > today;
        const wd = new Date(y, m - 1, i + 1).getDay();
        return h('td', {
          class: `cell ${on ? 'on' : ''} ${future ? 'future' : ''} ${wd === 0 || wd === 6 ? 'we' : ''} ${isCur && i + 1 === today.getDate() ? 'today' : ''}`,
          title: `${m}월 ${i + 1}일 ${it.name}`,
          onclick: future ? null : () => { toggle(key, it.id); paintTop(); },
        }, on ? h('span', { class: 'dot' }) : '');
      });
      return h('tr', { class: it.active === false ? 'inactive' : '' },
        h('th', { class: 'stick' }, it.name || '이름 없음'), cells,
        h('td', { class: 'sum' }, `${cnt}/${elapsed}`));
    });
    const month = h('section', { class: 'supp-month' },
      h('div', { class: 'supp-h' },
        h('div', { class: 'mnav-row' }, iconBtn('back', '이전 달', () => shift(-1)), h('h3', {}, `${y}년 ${m}월`), iconBtn('chev', '다음 달', () => shift(1))),
        isCur ? null : h('button', { type: 'button', class: 'link-btn', onclick: () => { monthOf.delete(n.id); paintTop(); } }, '이번 달로')),
      rows.length
        ? h('div', { class: 'grid-scroll' }, h('table', { class: 'supp-grid' }, h('thead', {}, head), h('tbody', {}, body)))
        : h('p', { class: 'muted' }, '표시할 영양제가 없어요.'));

    top.replaceChildren(todayBox, month);
    // 이번 달이면 오늘 칸이 보이도록 가로 스크롤
    const sc = top.querySelector('.grid-scroll');
    if (sc && isCur) requestAnimationFrame(() => { sc.scrollLeft = Math.max(0, (today.getDate() - 8) * 30); });
  }

  function paintManage() {
    const d = data();
    // 순서 바꾸기: 목록에서 한 칸 위·아래로 옮긴다 (오늘 목록·달력 표 순서도 같이 바뀐다)
    const move = (it, dir) => {
      save((x) => {
        const i = x.items.findIndex((q) => q.id === it.id);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= x.items.length) return;
        [x.items[i], x.items[j]] = [x.items[j], x.items[i]];
      });
      paintTop(); paintManage();
    };
    const row = (it, idx) => h('div', { class: `supp-item ${it.active === false ? 'inactive' : ''}` },
      h('input', { class: 'in', value: it.name, placeholder: '이름 (예: 비타민D)', onchange: (e) => { save((x) => { x.items.find((q) => q.id === it.id).name = e.target.value.trim(); }); paintTop(); } }),
      h('input', { class: 'in sub', value: it.note || '', placeholder: '복용법 (예: 아침 식후 1알)', onchange: (e) => { save((x) => { x.items.find((q) => q.id === it.id).note = e.target.value.trim(); }); paintTop(); } }),
      h('label', { class: 'tog', title: '끄면 오늘 목록에서 빠지고 기록은 남아요' },
        h('input', { type: 'checkbox', checked: it.active !== false, onchange: (e) => { save((x) => { x.items.find((q) => q.id === it.id).active = e.target.checked; }); paintTop(); paintManage(); } }),
        h('span', {}, '복용 중')),
      iconBtn('trash', '삭제', () => {
        const used = Object.values(d.log).some((v) => v.includes(it.id));
        if (used && !confirm(`'${it.name}'의 체크 기록도 함께 지워져요. 기록을 남기려면 '복용 중'만 끄세요.\n삭제할까요?`)) return;
        save((x) => {
          x.items = x.items.filter((q) => q.id !== it.id);
          for (const k of Object.keys(x.log)) { x.log[k] = x.log[k].filter((v) => v !== it.id); if (!x.log[k].length) delete x.log[k]; }
        });
        paintTop(); paintManage();
      }, 'danger'),
      h('div', { class: 'supp-order' },
        Object.assign(iconBtn('up', '위로', () => move(it, -1)), { disabled: idx === 0 }),
        Object.assign(iconBtn('down', '아래로', () => move(it, 1)), { disabled: idx === d.items.length - 1 })));
    const det = h('details', { class: 'supp-manage', open: (manageOpen ?? !d.items.length) || null, ontoggle: (e) => { manageOpen = e.target.open; } },
      h('summary', {}, `영양제 목록 (${d.items.length})`),
      h('div', { class: 'supp-items' }, d.items.map(row)),
      h('button', {
        type: 'button', class: 'btn', onclick: () => {
          manageOpen = true;
          save((x) => x.items.push({ id: S.uid(), name: '', note: '', active: true }));
          paintTop(); paintManage();
          const ins = manage.querySelectorAll('.supp-item .in:not(.sub)');
          ins[ins.length - 1]?.focus();
        },
      }, icon('plus'), '영양제 추가'));
    manage.replaceChildren(det);
  }

  paintTop();
  paintManage();
  root.repaint = () => { paintTop(); paintManage(); };
  return root;
}
