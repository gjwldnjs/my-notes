// 테스트용 가짜 GitHub API (앱이 쓰는 부분만). 실제 계정 없이 동기화를 시험한다.
// 실행: node test/mock-github.js  → http://127.0.0.1:8787  (토큰: test-token)
const http = require('http');
const crypto = require('crypto');

const TOKEN = 'test-token';
const blobs = new Map(); // sha → Buffer
const trees = new Map(); // sha → [{path,mode,type,sha}]
const commits = new Map(); // sha → {tree, parents, message}
let head = null;
const log = [];

const sha1 = (buf) => crypto.createHash('sha1').update(buf).digest('hex');
function putBlob(text) {
  const body = Buffer.from(text, 'utf8');
  const sha = sha1(Buffer.concat([Buffer.from(`blob ${body.length}\0`), body]));
  blobs.set(sha, body);
  return sha;
}
function putTree(entries) {
  const sorted = [...entries].sort((a, b) => (a.path < b.path ? -1 : 1));
  const sha = sha1('tree' + JSON.stringify(sorted));
  trees.set(sha, sorted);
  return sha;
}
// 'a/b/c.md' 같은 경로 목록 → 중첩 트리
function buildNested(flat) {
  const root = {};
  for (const e of flat) {
    const parts = e.path.split('/');
    let node = root;
    for (const p of parts.slice(0, -1)) node = node[p] ||= {};
    node[parts.at(-1)] = { __blob: e.sha };
  }
  const make = (node) => putTree(Object.entries(node).map(([name, v]) => (v.__blob
    ? { path: name, mode: '100644', type: 'blob', sha: v.__blob }
    : { path: name, mode: '040000', type: 'tree', sha: make(v) })));
  return make(root);
}

function send(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(obj === undefined ? '' : JSON.stringify(obj));
}

http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE',
      'Access-Control-Allow-Headers': 'Authorization,Content-Type,Accept',
    });
    return res.end();
  }
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    const url = new URL(req.url, 'http://x');
    const path = decodeURIComponent(url.pathname);
    log.push(`${req.method} ${path}`);
    if (path === '/__state') return send(res, 200, { head, commits: commits.size, blobs: blobs.size, log: log.slice(-50) });
    if (path === '/__files') { // 현재 head의 파일 목록과 내용
      const out = {};
      const walk = (tsha, dir) => trees.get(tsha).forEach((e) => (e.type === 'tree' ? walk(e.sha, dir + e.path + '/') : (out[dir + e.path] = blobs.get(e.sha).toString('utf8'))));
      if (head) walk(commits.get(head).tree, '');
      return send(res, 200, out);
    }
    if (req.headers.authorization !== `Bearer ${TOKEN}`) return send(res, 401, { message: 'Bad credentials' });
    const m = path.match(/^\/repos\/([^/]+)\/([^/]+)(.*)$/);
    if (!m || m[1] !== 'me' || m[2] !== 'notes') return send(res, 404, { message: 'Not Found' });
    const rest = m[3];
    const body = raw ? JSON.parse(raw) : {};

    if (rest === '' && req.method === 'GET') return send(res, 200, { default_branch: 'main', private: true });
    if (rest === '/git/ref/heads/main' && req.method === 'GET') {
      if (!head) return send(res, 409, { message: 'Git Repository is empty.' });
      return send(res, 200, { object: { sha: head } });
    }
    if (rest.startsWith('/contents/') && req.method === 'PUT') {
      const name = rest.slice('/contents/'.length);
      const text = Buffer.from(body.content, 'base64').toString('utf8');
      const tree = buildNested([{ path: name, sha: putBlob(text) }]);
      const sha = sha1('commit' + tree + Date.now() + Math.random());
      commits.set(sha, { tree, parents: head ? [head] : [], message: body.message });
      head = sha;
      return send(res, 201, { commit: { sha } });
    }
    let mm;
    if ((mm = rest.match(/^\/git\/commits\/(\w+)$/)) && req.method === 'GET') {
      const c = commits.get(mm[1]);
      return c ? send(res, 200, { sha: mm[1], tree: { sha: c.tree }, parents: c.parents.map((p) => ({ sha: p })) }) : send(res, 404, { message: 'Not Found' });
    }
    if ((mm = rest.match(/^\/git\/trees\/(\w+)$/)) && req.method === 'GET') {
      const t = trees.get(mm[1]);
      return t ? send(res, 200, { sha: mm[1], tree: t }) : send(res, 404, { message: 'Not Found' });
    }
    if ((mm = rest.match(/^\/git\/blobs\/(\w+)$/)) && req.method === 'GET') {
      const b = blobs.get(mm[1]);
      return b ? send(res, 200, { sha: mm[1], encoding: 'base64', content: b.toString('base64').replace(/(.{60})/g, '$1\n') }) : send(res, 404, { message: 'Not Found' });
    }
    if (rest === '/git/trees' && req.method === 'POST') {
      const flat = [];
      for (const e of body.tree) {
        if (e.content != null) flat.push({ path: e.path, sha: putBlob(e.content) });
        else if (blobs.has(e.sha)) flat.push({ path: e.path, sha: e.sha });
        else return send(res, 422, { message: `tree.sha ${e.sha} is not a valid blob` });
      }
      return send(res, 201, { sha: buildNested(flat) });
    }
    if (rest === '/git/commits' && req.method === 'POST') {
      const sha = sha1('commit' + body.tree + Date.now() + Math.random());
      commits.set(sha, { tree: body.tree, parents: body.parents, message: body.message });
      return send(res, 201, { sha });
    }
    if (rest === '/git/refs/heads/main' && req.method === 'PATCH') {
      const c = commits.get(body.sha);
      if (!c) return send(res, 422, { message: 'Object does not exist' });
      if (head && !c.parents.includes(head) && !body.force) return send(res, 422, { message: 'Update is not a fast forward' });
      head = body.sha;
      return send(res, 200, { object: { sha: head } });
    }
    send(res, 404, { message: 'Not Found' });
  });
}).listen(8787, '127.0.0.1', () => console.log('mock github on http://127.0.0.1:8787'));
