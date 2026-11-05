// 노션식 편집기: 쓰는 화면이 곧 보이는 화면. 저장은 마크다운.
// 이 파일을 고친 뒤 editor-src 폴더에서 `npm run build` → ../vendor/editor.js 가 새로 만들어진다.
import { Editor, Extension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import Suggestion from '@tiptap/suggestion';
import HardBreak from '@tiptap/extension-hard-break';
import Paragraph from '@tiptap/extension-paragraph';
import { Markdown } from 'tiptap-markdown';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

const pad = (n) => String(n).padStart(2, '0');
const WD = ['일', '월', '화', '수', '목', '금', '토'];

// ---- "/" 메뉴 항목 ----
const SLASH_ITEMS = [
  { title: '큰 제목', hint: '#', keys: ['제목', 'h1', 'heading', '큰'], run: (c) => c.setNode('heading', { level: 1 }) },
  { title: '중간 제목', hint: '##', keys: ['제목', 'h2', 'heading', '중간'], run: (c) => c.setNode('heading', { level: 2 }) },
  { title: '작은 제목', hint: '###', keys: ['제목', 'h3', 'heading', '작은'], run: (c) => c.setNode('heading', { level: 3 }) },
  { title: '체크박스', hint: '[]', keys: ['할 일', '할일', 'todo', 'task', 'check', '체크'], run: (c) => c.toggleTaskList() },
  { title: '글머리 목록', hint: '-', keys: ['목록', 'bullet', 'list', '글머리'], run: (c) => c.toggleBulletList() },
  { title: '번호 목록', hint: '1.', keys: ['번호', 'number', 'ordered', '숫자'], run: (c) => c.toggleOrderedList() },
  { title: '인용', hint: '>', keys: ['quote', '인용', '따옴'], run: (c) => c.toggleBlockquote() },
  { title: '표', hint: '', keys: ['table', '표', '테이블'], run: (c) => c.insertTable({ rows: 3, cols: 2, withHeaderRow: true }) },
  { title: '구분선', hint: '---', keys: ['hr', 'divider', 'line', '구분', '선'], run: (c) => c.setHorizontalRule() },
  { title: '코드', hint: '```', keys: ['code', '코드'], run: (c) => c.toggleCodeBlock() },
  { title: '지금 시각', hint: '', keys: ['시간', '시각', 'time', 'now'], run: (c) => { const d = new Date(); return c.insertContent(`${pad(d.getHours())}:${pad(d.getMinutes())} `); } },
  { title: '오늘 날짜', hint: '', keys: ['날짜', 'date', 'today', '오늘'], run: (c) => { const d = new Date(); return c.insertContent(`${d.getMonth() + 1}월 ${d.getDate()}일 (${WD[d.getDay()]}) `); } },
];

function filterItems(query) {
  const q = (query || '').toLowerCase().replace(/\s+/g, '');
  if (!q) return SLASH_ITEMS;
  return SLASH_ITEMS.filter((it) => [it.title, ...it.keys].some((k) => k.toLowerCase().replace(/\s+/g, '').includes(q)));
}

// 메뉴 화면 (목록을 띄우고 화살표·Enter로 고르기)
function slashRenderer() {
  let el = null;
  let items = [];
  let sel = 0;
  let command = null;
  const paint = () => {
    el.replaceChildren();
    if (!items.length) {
      const p = document.createElement('div');
      p.className = 'slash-empty';
      p.textContent = '맞는 항목이 없어요';
      el.append(p);
      return;
    }
    items.forEach((it, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `slash-item ${i === sel ? 'on' : ''}`;
      const t = document.createElement('span');
      t.textContent = it.title;
      const k = document.createElement('kbd');
      k.textContent = it.hint;
      b.append(t);
      if (it.hint) b.append(k);
      b.addEventListener('mousedown', (e) => { e.preventDefault(); command(it); });
      el.append(b);
    });
    el.querySelector('.on')?.scrollIntoView({ block: 'nearest' });
  };
  const place = (rect) => {
    if (!rect) return;
    const h = el.offsetHeight || 280;
    const below = rect.bottom + 6;
    el.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - el.offsetWidth - 8))}px`;
    el.style.top = `${below + h > innerHeight - 8 ? Math.max(8, rect.top - h - 6) : below}px`;
  };
  return {
    onStart: (props) => {
      el = document.createElement('div');
      el.className = 'slash-menu';
      document.body.append(el);
      items = props.items;
      sel = 0;
      command = props.command;
      paint();
      place(props.clientRect?.());
    },
    onUpdate: (props) => {
      items = props.items;
      command = props.command;
      sel = Math.min(sel, Math.max(0, items.length - 1));
      paint();
      place(props.clientRect?.());
    },
    onKeyDown: ({ event }) => {
      if (event.isComposing) return false;
      if (event.key === 'ArrowDown') { sel = (sel + 1) % Math.max(1, items.length); paint(); return true; }
      if (event.key === 'ArrowUp') { sel = (sel - 1 + items.length) % Math.max(1, items.length); paint(); return true; }
      if (event.key === 'Enter' || event.key === 'Tab') { if (items[sel]) { command(items[sel]); return true; } return false; }
      if (event.key === 'Escape') { el?.remove(); el = null; return true; }
      return false;
    },
    onExit: () => { el?.remove(); el = null; },
  };
}

const SlashMenu = Extension.create({
  name: 'slashMenu',
  addProseMirrorPlugins() {
    return [Suggestion({
      editor: this.editor,
      char: '/',
      pluginKey: new PluginKey('slashMenu'),
      allowSpaces: false,
      items: ({ query }) => filterItems(query),
      command: ({ editor, range, props }) => props.run(editor.chain().focus().deleteRange(range)).run(),
      render: slashRenderer,
    })];
  },
});

// ---- 저장 모양 다듬기 ----
// 문단 안 줄바꿈을 `\` 없이 그냥 줄바꿈으로 저장 (읽을 때도 줄바꿈 = 줄바꿈으로 읽음)
const PlainHardBreak = HardBreak.extend({
  addStorage() {
    return {
      markdown: {
        serialize(state, node, parent, index) {
          for (let i = index + 1; i < parent.childCount; i++) {
            if (parent.child(i).type !== node.type) { state.write(state.inTable ? ' ' : '\n'); return; }
          }
        },
        parse: {},
      },
    };
  },
});
// 빈 문단(엔터만 친 줄)은 마크다운에 적을 방법이 없어 사라진다 → 보이지 않는 글자 한 줄로 저장해 두고, 읽을 때 다시 빈 문단으로 되돌린다
const KeepEmptyParagraph = Paragraph.extend({
  addStorage() {
    return {
      markdown: {
        serialize(state, node) {
          if (node.content.size === 0 && !state.inTable) { state.write(ZW); state.closeBlock(node); return; }
          state.renderInline(node);
          state.closeBlock(node);
        },
        parse: {},
      },
    };
  },
});
// 체크박스 목록도 항목 사이 빈 줄 없이 저장
const TightTaskList = Extension.create({
  name: 'tightTaskList',
  addGlobalAttributes() {
    return [{ types: ['taskList'], attributes: { tight: { default: true, parseHTML: () => true, renderHTML: () => ({}) } } }];
  },
});
// 내용 없는 체크박스(`- [ ] `)는 마크다운 규칙상 글자로 읽혀서, 보이지 않는 글자를 잠깐 넣어 체크박스로 읽게 한다
const ZW = String.fromCharCode(0x200b); // 폭 없는 공백
// 아래 내용이 없는 제목에도 쓸 줄이 하나 생기게 한다 (마크다운에는 빈 문단을 적을 방법이 없어서)
function prep(md) {
  const lines = (md || '').replace(/^(\s*[-*+]\s+\[[ xX]\])[ \t]*$/gm, `$1 ${ZW}`).split('\n');
  const out = [];
  let inCode = false;
  lines.forEach((line, i) => {
    out.push(line);
    if (/^\s*```/.test(line)) inCode = !inCode;
    if (inCode || !/^#{1,6}\s/.test(line)) return;
    const next = lines.slice(i + 1).find((l) => l.trim());
    if (next === undefined || /^#{1,6}\s/.test(next)) out.push('', ZW);
  });
  return out.join('\n');
}

// ---- #태그 를 글 속에서 색으로 표시 ----
const TAG_RE = /(^|[\s(（,])#([\p{L}_][\p{L}\p{N}_\-/]*)/gu;
const TagHighlight = Extension.create({
  name: 'tagHighlight',
  addProseMirrorPlugins() {
    const build = (doc) => {
      const decos = [];
      doc.descendants((node, pos, parent) => {
        if (!node.isText || parent?.type.name === 'codeBlock' || node.marks.some((m) => m.type.name === 'code')) return;
        for (const m of node.text.matchAll(TAG_RE)) {
          const from = pos + m.index + m[1].length;
          decos.push(Decoration.inline(from, from + 1 + m[2].length, { class: 'tag-inline' }));
        }
      });
      return DecorationSet.create(doc, decos);
    };
    return [new Plugin({
      key: new PluginKey('tagHighlight'),
      state: {
        init: (_, { doc }) => build(doc),
        apply: (tr, old) => (tr.docChanged ? build(tr.doc) : old),
      },
      props: { decorations(state) { return this.getState(state); } },
    })];
  },
});

export function createEditor({ element, content = '', placeholder = '', onChange }) {
  const editor = new Editor({
    element,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, hardBreak: false, paragraph: false }),
      PlainHardBreak,
      KeepEmptyParagraph,
      TightTaskList,
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder }),
      Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' } }),
      Table.configure({ resizable: false }),
      TableRow, TableHeader, TableCell,
      Markdown.configure({ html: false, tightLists: true, bulletListMarker: '-', linkify: true, breaks: true, transformPastedText: true }),
      SlashMenu,
      TagHighlight,
    ],
    content: prep(content),
    editorProps: { attributes: { class: 'md pm', spellcheck: 'false' } },
    onUpdate: ({ editor: ed }) => { if (!ed.__quiet) onChange?.(ed); },
  });
  clearZW(editor);
  return editor;
}

// 읽어 들인 글에서 "보이지 않는 글자만 있는 문단"을 진짜 빈 문단으로 바꾼다 (커서가 걸리지 않게). 변경 알림·되돌리기 기록 없이.
function clearZW(editor) {
  const { doc } = editor.state;
  const hits = [];
  doc.descendants((node, pos) => { if (node.type.name === 'paragraph' && node.textContent === ZW) hits.push(pos + 1); });
  if (!hits.length) return;
  const tr = editor.state.tr.setMeta('addToHistory', false);
  for (const p of hits.reverse()) tr.delete(p, p + 1);
  editor.__quiet = true;
  try { editor.view.dispatch(tr); } finally { editor.__quiet = false; }
}

// 저장: 보이지 않는 글자는 지우되, 그 글자만 있는 줄(= 빈 문단 표시)은 남긴다
export const getMarkdown = (editor) => editor.storage.markdown.getMarkdown().split('\n').map((l) => (l === ZW ? l : l.split(ZW).join(''))).join('\n');
// 바깥(다른 기기)에서 바뀐 내용으로 갈아 끼우기. 변경 알림(onChange)은 보내지 않는다.
export const setMarkdown = (editor, md) => { editor.commands.setContent(prep(md), false); clearZW(editor); };

// 일지 템플릿처럼 제목 아래 첫 빈칸으로 커서 옮기기
export function focusFirstSlot(editor) {
  let target = null;
  let seenHeading = false;
  editor.state.doc.descendants((node, pos) => {
    if (target != null) return false;
    if (node.type.name === 'heading') { seenHeading = true; return false; }
    if (seenHeading && node.isTextblock) { target = pos + 1 + node.content.size; return false; }
    return true;
  });
  editor.commands.focus(target ?? 'end');
}
