// 아이폰 없이 위젯 스크립트를 시험하는 도구.
// Scriptable의 위젯 함수들을 흉내 내서 스크립트를 실행하고, 결과를 test/out/widget-<크기>.html 로 그린다.
// 실행: WIDGET_CODE=<연결 코드> node test/widget-harness.mjs [large|medium|small] [dark]
//      (에뮬레이터를 켜고, 앱을 ?emu 로 열어 로그인한 뒤 설정에서 코드를 받는다)
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const family = process.argv[2] || 'large';
const dark = process.argv[3] === 'dark';
const SCREEN = { width: Number(process.env.SCREEN_W) || 402, height: 874 }; // 기본: iPhone 16 Pro (사용자 폰)

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
  async presentSmall() {}
}

const docs = fs.mkdtempSync(path.join(os.tmpdir(), 'scriptable-'));
// WIDGET_CACHE=<json 파일>: 서버 없이 그려 보기 (지난번 저장본이 있는 오프라인 상황과 같음)
if (process.env.WIDGET_CACHE) fs.copyFileSync(process.env.WIDGET_CACHE, path.join(docs, 'my-notes-widget-cache.json'));
const store = {};
let result = null;
Object.assign(globalThis, {
  Size, Color, Font, ListWidget,
  Device: { screenSize: () => SCREEN },
  config: { runsInWidget: true, widgetFamily: family },
  args: { widgetParameter: process.env.WIDGET_PARAM || null }, // 위젯 편집의 Parameter 칸
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
    constructor(url) { this.url = url; this.headers = {}; this.method = 'GET'; this.body = undefined; }
    async loadString() {
      const r = await fetch(this.url, { method: this.method, headers: this.headers, body: this.body });
      this.response = { statusCode: r.status };
      return r.text();
    }
    async loadJSON() { const t = await this.loadString(); try { return JSON.parse(t); } catch { return {}; } }
  },
  Data: { fromBase64String: (s) => ({ toRawString: () => Buffer.from(s, 'base64').toString('utf8') }) },
  Script: { setWidget: (w) => { result = w; }, complete: () => {} },
  Alert: class { },
});
// 앱(에뮬레이터 모드) 설정의 "아이폰 위젯 연결 코드"를 WIDGET_CODE 환경변수로 넘긴다
if (!process.env.WIDGET_CODE) throw new Error('WIDGET_CODE 환경변수에 위젯 연결 코드를 넣어 주세요');
store['my-notes-widget'] = Buffer.from(process.env.WIDGET_CODE, 'base64').toString('utf8');

const code = fs.readFileSync(path.join(here, '..', 'widget', '메모장-캘린더-위젯.js'), 'utf8');
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
await new AsyncFunction(code)();
if (!result) throw new Error('위젯이 만들어지지 않음');

// ---- HTML로 그리기 ----
const big = (Number(process.env.SCREEN_W) || 402) >= 402 ? [364, 382] : [338, 354];
const SIZES = { large: big, medium: [big[0], 170], small: [170, 170] };
let texts = 0, links = 0;
function html(n) {
  // 아이폰(SwiftUI)은 늘어나는 빈칸에도 최소 8pt를 준다 → 좁은 칸에서 글자가 밀려 사라지는 걸 똑같이 재현
  if (n.kind === 'spacer') return n.n == null ? '<div style="flex:1 1 0;min-width:8px;min-height:8px"></div>' : `<div style="flex:none;width:${n.n}px;height:${n.n}px"></div>`;
  if (n.kind === 'text') {
    texts++;
    return `<div style="font-size:${n.font?.s || 13}px;font-weight:${n.font?.bold ? 700 : 400};color:${n.textColor?.css() || '#000'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:${n.align};min-width:0;line-height:1.15">${String(n.text).replace(/</g, '&lt;')}</div>`;
  }
  if (n.url) links++;
  const st = [
    'display:flex', `flex-direction:${n.dir}`, `align-items:${n.dir === 'row' ? n.align : 'stretch'}`,
    // 크기를 정한 묶음은 iOS(SwiftUI frame)처럼 내용을 가운데에 놓는다
    (n.dir === 'row' ? n.size?.width > 0 : n.size?.height > 0) ? 'justify-content:center' : '',
    `padding:${n.pad.map((p) => p + 'px').join(' ')}`, 'box-sizing:border-box', 'min-width:0', 'overflow:hidden', 'flex:none',
    n.size && n.size.width > 0 ? `width:${n.size.width}px` : '', n.size && n.size.height > 0 ? `height:${n.size.height}px` : '',
    n.backgroundColor ? `background:${n.backgroundColor.css()}` : '',
    n.cornerRadius ? `border-radius:${n.cornerRadius}px` : '',
  ].filter(Boolean).join(';');
  return `<div style="${st}">${n.children.map(html).join('')}</div>`;
}
const [W, H] = SIZES[family];
const body = html(result).replace('flex:none', `width:${W}px;height:${H}px;border-radius:22px;box-shadow:0 8px 30px rgba(0,0,0,.2)`);
fs.mkdirSync(path.join(here, 'out'), { recursive: true });
const out = path.join(here, 'out', `widget-${process.env.WIDGET_PARAM ? 'dday-' : ''}${family}${dark ? '-dark' : ''}.html`);
fs.writeFileSync(out, `<!doctype html><meta charset="utf-8"><body style="margin:0;padding:30px;background:${dark ? '#000' : '#e9e6df'};font-family:-apple-system,'Malgun Gothic',sans-serif">${body}</body>`);
console.log(JSON.stringify({ out, texts, links, refresh: !!result.refreshAfterDate, url: result.url }));
