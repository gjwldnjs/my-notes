// 아이폰 없이 위젯 스크립트를 시험하는 도구.
// Scriptable의 위젯 함수들을 흉내 내서 스크립트를 실행하고, 결과를 test/out/widget-<크기>.html 로 그린다.
// 실행: node test/widget-harness.mjs [large|medium|small] [dark]
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const family = process.argv[2] || 'large';
const dark = process.argv[3] === 'dark';
const SCREEN = { width: 393, height: 852 }; // iPhone 15 Pro

class Size { constructor(w, h) { this.width = w; this.height = h; } }
class Color {
  constructor(hex, alpha = 1) { this.hex = hex; this.alpha = alpha; }
  static dynamic(light, darkC) { return dark ? darkC : light; }
  css() {
    const h = this.hex.replace('#', '');
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
    return `rgba(${r},${g},${b},${this.alpha})`;
  }
}
const Font = { systemFont: (s) => ({ s, bold: false }), boldSystemFont: (s) => ({ s, bold: true }) };
class WText {
  constructor(t) { this.kind = 'text'; this.text = t; this.align = 'left'; }
  centerAlignText() { this.align = 'center'; }
}
class WStack {
  constructor() { this.kind = 'stack'; this.children = []; this.dir = 'row'; this.align = 'center'; this.pad = [0, 0, 0, 0]; }
  addStack() { const s = new WStack(); this.children.push(s); return s; }
  addText(t) { const x = new WText(t); this.children.push(x); return x; }
  addSpacer(n) { this.children.push({ kind: 'spacer', n }); }
  layoutVertically() { this.dir = 'column'; }
  layoutHorizontally() { this.dir = 'row'; }
  centerAlignContent() { this.align = 'center'; }
  topAlignContent() { this.align = 'flex-start'; }
  setPadding(t, l, b, r) { this.pad = [t, l, b, r]; }
}
class ListWidget extends WStack {
  constructor() { super(); this.dir = 'column'; this.align = 'flex-start'; this.pad = [16, 16, 16, 16]; }
  async presentLarge() {}
  async presentMedium() {}
}

const docs = fs.mkdtempSync(path.join(os.tmpdir(), 'scriptable-'));
const store = {};
let result = null;
Object.assign(globalThis, {
  Size, Color, Font, ListWidget,
  Device: { screenSize: () => SCREEN },
  config: { runsInWidget: true, widgetFamily: family },
  args: {},
  Keychain: {
    contains: (k) => k in store,
    get: (k) => store[k],
    set: (k, v) => { store[k] = v; },
  },
  FileManager: {
    local: () => ({
      documentsDirectory: () => docs,
      joinPath: (a, b) => path.join(a, b),
      writeString: (p, s) => fs.writeFileSync(p, s),
      readString: (p) => fs.readFileSync(p, 'utf8'),
      fileExists: (p) => fs.existsSync(p),
    }),
  },
  Request: class {
    constructor(url) { this.url = url; this.headers = {}; }
    async loadString() {
      const r = await fetch(this.url, { headers: this.headers });
      this.response = { statusCode: r.status };
      return r.text();
    }
  },
  Script: { setWidget: (w) => { result = w; }, complete: () => {} },
  Alert: class { },
});
store['my-notes-widget'] = JSON.stringify({ owner: 'me', repo: 'notes', token: 'test-token', appUrl: 'https://example.github.io/my-notes/', apiBase: 'http://127.0.0.1:8787' });

const code = fs.readFileSync(path.join(here, '..', 'widget', '메모장-캘린더-위젯.js'), 'utf8');
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
await new AsyncFunction(code)();
if (!result) throw new Error('위젯이 만들어지지 않음');

// ---- HTML로 그리기 ----
const SIZES = { large: [338, 354], medium: [338, 158], small: [158, 158] };
let texts = 0, links = 0;
function html(n) {
  if (n.kind === 'spacer') return n.n == null ? '<div style="flex:1 1 0"></div>' : `<div style="flex:none;width:${n.n}px;height:${n.n}px"></div>`;
  if (n.kind === 'text') {
    texts++;
    return `<div style="font-size:${n.font?.s || 13}px;font-weight:${n.font?.bold ? 700 : 400};color:${n.textColor?.css() || '#000'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:${n.align};min-width:0;line-height:1.15">${String(n.text).replace(/</g, '&lt;')}</div>`;
  }
  if (n.url) links++;
  const st = [
    'display:flex', `flex-direction:${n.dir}`, `align-items:${n.dir === 'row' ? n.align : 'stretch'}`,
    `padding:${n.pad.map((p) => p + 'px').join(' ')}`, 'box-sizing:border-box', 'min-width:0', 'overflow:hidden', 'flex:none',
    n.size ? `width:${n.size.width}px;height:${n.size.height}px` : '',
    n.backgroundColor ? `background:${n.backgroundColor.css()}` : '',
    n.cornerRadius ? `border-radius:${n.cornerRadius}px` : '',
  ].filter(Boolean).join(';');
  return `<div style="${st}">${n.children.map(html).join('')}</div>`;
}
const [W, H] = SIZES[family];
const body = html(result).replace('flex:none', `width:${W}px;height:${H}px;border-radius:22px;box-shadow:0 8px 30px rgba(0,0,0,.2)`);
fs.mkdirSync(path.join(here, 'out'), { recursive: true });
const out = path.join(here, 'out', `widget-${family}${dark ? '-dark' : ''}.html`);
fs.writeFileSync(out, `<!doctype html><meta charset="utf-8"><body style="margin:0;padding:30px;background:${dark ? '#000' : '#e9e6df'};font-family:-apple-system,'Malgun Gothic',sans-serif">${body}</body>`);
console.log(JSON.stringify({ out, texts, links, refresh: !!result.refreshAfterDate, url: result.url }));
