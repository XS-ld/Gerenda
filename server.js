'use strict';

/**
 * 个人档案站点 —— 后端服务
 *
 * 设计取向：
 * 1. 零第三方依赖，只用 Node 内置模块，部署时不需要 npm install。
 * 2. 数据落地为 JSON 文件（data/profile.json），便于备份、迁移、手工修正。
 * 3. 登录使用 scrypt 口令哈希 + 服务端会话（HttpOnly Cookie），会话保存在内存，
 *    服务重启后需要重新登录——对单人维护的简历站来说是合理的取舍。
 */

const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'profile.json');
const AUTH_FILE = path.join(DATA_DIR, 'auth.json');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const SESSION_TTL = 12 * 60 * 60 * 1000; // 12 小时
const COOKIE_NAME = 'profile_sid';
const MAX_BODY = 256 * 1024;
const LOGIN_WINDOW = 10 * 60 * 1000;
const LOGIN_MAX_TRIES = 10;

const SECTIONS = ['education', 'experience', 'awards', 'skills'];

const BASIC_FIELDS = [
  'name', 'title', 'summary', 'email', 'phone',
  'city', 'website', 'github', 'avatar'
];

const SECTION_FIELDS = {
  education: ['school', 'degree', 'major', 'start', 'end', 'note'],
  experience: ['company', 'role', 'start', 'end', 'note'],
  awards: ['title', 'org', 'date', 'note'],
  skills: ['group', 'items']
};

const FIELD_LIMITS = {
  name: 40, title: 80, summary: 1500,
  email: 120, phone: 60, city: 60,
  website: 200, github: 200, avatar: 400,
  school: 120, degree: 60, major: 120,
  start: 40, end: 40, note: 4000,
  company: 120, role: 120,
  award_title: 160, org: 120, date: 60,
  group: 60, items: 600
};

const DEFAULT_DATA = {
  basic: {
    name: '张明',
    title: '前端工程师 · 5 年经验',
    summary: '做企业级后台与数据产品的前端开发，习惯把交互细节和加载性能一起考虑。上一份工作负责一套内部运营系统的重构，把首屏时间从 3.4 秒压到 1.1 秒，之后接手了两个人的团队协作与代码评审。',
    email: 'zhangming@example.com',
    phone: '138 0000 0000',
    city: '杭州',
    website: '',
    github: 'github.com/zhangming',
    avatar: ''
  },
  education: [
    {
      id: 'edu_seed_1',
      school: '浙江大学',
      degree: '本科',
      major: '计算机科学与技术',
      start: '2014.09',
      end: '2018.06',
      note: '主修方向为软件工程，毕业设计做的是可视化图表编辑器的交互框架。'
    }
  ],
  experience: [
    {
      id: 'exp_seed_1',
      company: '某某科技有限公司',
      role: '前端工程师 / 小组负责人',
      start: '2021.03',
      end: '至今',
      note: '负责内部运营平台的前端架构与迭代，团队 3 人。\n主导前端工程化改造，统一构建与发布流程，发布耗时由 25 分钟降至 6 分钟。\n与后端一起定义接口规范，减少联调返工，需求平均交付周期缩短约 30%。'
    },
    {
      id: 'exp_seed_2',
      company: '某某网络科技',
      role: '前端开发',
      start: '2018.07',
      end: '2021.02',
      note: '参与数据看板与报表模块开发，负责图表组件库的维护。\n推动移动端适配方案落地，覆盖 90% 以上的存量页面。'
    }
  ],
  awards: [
    {
      id: 'award_seed_1',
      title: '年度优秀员工',
      org: '某某科技有限公司',
      date: '2023',
      note: '因运营平台重构项目获评。'
    },
    {
      id: 'award_seed_2',
      title: '全国大学生数学建模竞赛 省级二等奖',
      org: '中国工业与应用数学学会',
      date: '2017.11',
      note: ''
    },
    {
      id: 'award_seed_3',
      title: '校级一等奖学金',
      org: '浙江大学',
      date: '2016.10',
      note: '连续两年获得。'
    }
  ],
  skills: [
    { id: 'skill_seed_1', group: '语言', items: 'JavaScript、TypeScript、HTML、CSS、Node.js' },
    { id: 'skill_seed_2', group: '框架', items: 'React、Vue 3、Vite、Express' },
    { id: 'skill_seed_3', group: '工程', items: 'Git、Webpack、CI/CD、性能优化、单元测试' },
    { id: 'skill_seed_4', group: '其他', items: 'Figma 走查、数据可视化、英语读写' }
  ],
  updatedAt: new Date().toISOString()
};

/* ------------------------------------------------------------------ */
/* 数据读写                                                            */
/* ------------------------------------------------------------------ */

let data = null;
let saveChain = Promise.resolve();

function loadData() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    data = normalizeData(parsed);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn('[data] 读取数据文件失败，使用初始数据：', err.message);
    }
    data = JSON.parse(JSON.stringify(DEFAULT_DATA));
    persist();
  }
}

function normalizeData(input) {
  const out = {
    basic: {},
    education: [],
    experience: [],
    awards: [],
    skills: [],
    updatedAt: input && input.updatedAt ? input.updatedAt : new Date().toISOString()
  };
  const basic = (input && input.basic) || {};
  for (const key of BASIC_FIELDS) {
    out.basic[key] = typeof basic[key] === 'string' ? basic[key] : '';
  }
  for (const section of SECTIONS) {
    const list = Array.isArray(input && input[section]) ? input[section] : [];
    out[section] = list.map((item) => {
      const clean = { id: typeof item.id === 'string' && item.id ? item.id : newId() };
      for (const field of SECTION_FIELDS[section]) {
        clean[field] = typeof item[field] === 'string' ? item[field] : '';
      }
      return clean;
    });
  }
  return out;
}

function persist() {
  const snapshot = JSON.stringify(data, null, 2);
  saveChain = saveChain
    .then(async () => {
      await fsp.mkdir(DATA_DIR, { recursive: true });
      const tmp = DATA_FILE + '.tmp';
      await fsp.writeFile(tmp, snapshot, 'utf8');
      await fsp.rename(tmp, DATA_FILE);
    })
    .catch((err) => {
      console.error('[data] 写入数据文件失败：', err);
    });
  return saveChain;
}

function newId() {
  return crypto.randomBytes(6).toString('hex');
}

/* ------------------------------------------------------------------ */
/* 登录与账号                                                          */
/* ------------------------------------------------------------------ */

function ensureAuthFile() {
  if (fs.existsSync(AUTH_FILE)) return;
  const username = process.env.ADMIN_USER || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'admin888';
  const { salt, hash } = hashPassword(password);
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(AUTH_FILE, JSON.stringify({ username, salt, hash }, null, 2), 'utf8');
  console.log(
    `[auth] 已生成账号文件，用户名：${username}` +
    (process.env.ADMIN_PASSWORD ? '（密码来自环境变量）' : '，初始密码：admin888，请登录后立即修改。')
  );
}

function readAuth() {
  const raw = fs.readFileSync(AUTH_FILE, 'utf8');
  return JSON.parse(raw);
}

function hashPassword(password, salt) {
  const useSalt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), useSalt, 64).toString('hex');
  return { salt: useSalt, hash };
}

function verifyPassword(password, auth) {
  try {
    const derived = crypto.scryptSync(String(password), auth.salt, 64);
    const known = Buffer.from(auth.hash, 'hex');
    if (derived.length !== known.length) return false;
    return crypto.timingSafeEqual(derived, known);
  } catch {
    return false;
  }
}

const sessions = new Map(); // token -> { user, expires }
const loginTries = new Map(); // ip -> { count, resetAt }

function createSession(user) {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, { user, expires: Date.now() + SESSION_TTL });
  return token;
}

function getSession(req) {
  const token = parseCookies(req.headers.cookie || '')[COOKIE_NAME];
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (session.expires < Date.now()) {
    sessions.delete(token);
    return null;
  }
  session.expires = Date.now() + SESSION_TTL; // 滑动续期
  return session;
}

function parseCookies(header) {
  const out = {};
  header.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx < 0) return;
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  });
  return out;
}

function sessionCookie(token) {
  const attrs = [
    `${COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(SESSION_TTL / 1000)}`
  ];
  if (process.env.COOKIE_SECURE === '1') attrs.push('Secure');
  return attrs.join('; ');
}

function clearCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

setInterval(() => {
  const now = Date.now();
  for (const [token, session] of sessions) {
    if (session.expires < now) sessions.delete(token);
  }
  for (const [ip, record] of loginTries) {
    if (record.resetAt < now) loginTries.delete(ip);
  }
}, 10 * 60 * 1000).unref();

function tooManyTries(ip) {
  const record = loginTries.get(ip);
  if (!record) return false;
  if (record.resetAt < Date.now()) {
    loginTries.delete(ip);
    return false;
  }
  return record.count >= LOGIN_MAX_TRIES;
}

function noteTry(ip) {
  const now = Date.now();
  const record = loginTries.get(ip);
  if (!record || record.resetAt < now) {
    loginTries.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW });
    return;
  }
  record.count += 1;
}

/* ------------------------------------------------------------------ */
/* 工具                                                                */
/* ------------------------------------------------------------------ */

function sendJson(res, status, payload, headers) {
  const body = JSON.stringify(payload);
  res.writeHead(status, Object.assign({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body)
  }, headers || {}));
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('请求体过大'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(Object.assign(new Error('请求内容不是合法 JSON'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function cleanText(value, max) {
  if (value == null) return '';
  return String(value)
    .replace(/\r\n/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .trim()
    .slice(0, max);
}

function cleanUrl(value) {
  const text = cleanText(value, 400);
  if (!text) return '';
  if (/^(https?:|mailto:|\/|#)/i.test(text)) return text;
  return 'https://' + text.replace(/^\/+/, '');
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded) return forwarded.split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

function publicData() {
  return {
    basic: data.basic,
    education: data.education,
    experience: data.experience,
    awards: data.awards,
    skills: data.skills,
    updatedAt: data.updatedAt
  };
}

/* ------------------------------------------------------------------ */
/* API                                                                 */
/* ------------------------------------------------------------------ */

async function handleLogin(req, res) {
  const ip = getClientIp(req);
  if (tooManyTries(ip)) {
    return sendJson(res, 429, { error: '尝试次数过多，请 10 分钟后再试。' });
  }
  let body;
  try {
    body = await readBody(req);
  } catch (err) {
    return sendJson(res, err.status || 400, { error: err.message });
  }
  const username = cleanText(body.username, 80);
  const password = String(body.password == null ? '' : body.password);
  if (!username || !password) {
    return sendJson(res, 400, { error: '请填写用户名和密码。' });
  }
  const auth = readAuth();
  const okUser = username === auth.username;
  const okPass = verifyPassword(password, auth);
  if (!okUser || !okPass) {
    noteTry(ip);
    return sendJson(res, 401, { error: '用户名或密码不正确。' });
  }
  loginTries.delete(ip);
  const token = createSession(auth.username);
  return sendJson(res, 200, { ok: true, user: auth.username }, { 'Set-Cookie': sessionCookie(token) });
}

async function handleLogout(req, res) {
  const token = parseCookies(req.headers.cookie || '')[COOKIE_NAME];
  if (token) sessions.delete(token);
  return sendJson(res, 200, { ok: true }, { 'Set-Cookie': clearCookie() });
}

async function handleChangePassword(req, res, session) {
  let body;
  try {
    body = await readBody(req);
  } catch (err) {
    return sendJson(res, err.status || 400, { error: err.message });
  }
  const current = String(body.current == null ? '' : body.current);
  const next = String(body.next == null ? '' : body.next);
  const auth = readAuth();
  if (!verifyPassword(current, auth)) {
    return sendJson(res, 400, { error: '当前密码不正确。' });
  }
  if (next.length < 8) {
    return sendJson(res, 400, { error: '新密码至少 8 位。' });
  }
  const { salt, hash } = hashPassword(next);
  await fsp.writeFile(AUTH_FILE, JSON.stringify({ username: auth.username, salt, hash }, null, 2), 'utf8');
  // 改密后让所有会话失效，前端会退回登录页
  sessions.clear();
  return sendJson(res, 200, { ok: true }, { 'Set-Cookie': clearCookie() });
}

async function handleUpdateBasic(req, res) {
  let body;
  try {
    body = await readBody(req);
  } catch (err) {
    return sendJson(res, err.status || 400, { error: err.message });
  }
  const input = body.basic && typeof body.basic === 'object' ? body.basic : body;
  const next = {};
  for (const field of BASIC_FIELDS) {
    if (!(field in input)) {
      next[field] = data.basic[field] || '';
      continue;
    }
    const max = FIELD_LIMITS[field] || 200;
    next[field] = field === 'website' || field === 'github' || field === 'avatar'
      ? cleanUrl(input[field])
      : cleanText(input[field], max);
  }
  if (!next.name) return sendJson(res, 400, { error: '姓名不能为空。' });
  data.basic = next;
  data.updatedAt = new Date().toISOString();
  await persist();
  return sendJson(res, 200, { ok: true, basic: data.basic, updatedAt: data.updatedAt });
}

function readSectionItem(section, input) {
  const fields = SECTION_FIELDS[section];
  const item = {};
  for (const field of fields) {
    const limitKey = section === 'awards' && field === 'title' ? 'award_title' : field;
    const max = FIELD_LIMITS[limitKey] || 200;
    item[field] = cleanText(input[field], field === 'note' || field === 'items' ? 4000 : max);
  }
  return item;
}

async function handleCreateItem(req, res, section) {
  let body;
  try {
    body = await readBody(req);
  } catch (err) {
    return sendJson(res, err.status || 400, { error: err.message });
  }
  const item = readSectionItem(section, body || {});
  const full = Object.assign({ id: newId() }, item);
  data[section].push(full);
  data.updatedAt = new Date().toISOString();
  await persist();
  return sendJson(res, 201, { ok: true, item: full, updatedAt: data.updatedAt });
}

async function handleUpdateItem(req, res, section, id) {
  const list = data[section];
  const index = list.findIndex((entry) => entry.id === id);
  if (index < 0) return sendJson(res, 404, { error: '记录不存在。' });
  let body;
  try {
    body = await readBody(req);
  } catch (err) {
    return sendJson(res, err.status || 400, { error: err.message });
  }
  const item = readSectionItem(section, body || {});
  if (section === 'awards' && !item.title) return sendJson(res, 400, { error: '奖项名称不能为空。' });
  if (section === 'education' && !item.school) return sendJson(res, 400, { error: '学校名称不能为空。' });
  if (section === 'experience' && !item.company) return sendJson(res, 400, { error: '公司名称不能为空。' });
  if (section === 'skills' && !item.group) return sendJson(res, 400, { error: '技能分组名称不能为空。' });
  list[index] = Object.assign({ id }, item);
  data.updatedAt = new Date().toISOString();
  await persist();
  return sendJson(res, 200, { ok: true, item: list[index], updatedAt: data.updatedAt });
}

async function handleDeleteItem(req, res, section, id) {
  const list = data[section];
  const index = list.findIndex((entry) => entry.id === id);
  if (index < 0) return sendJson(res, 404, { error: '记录不存在。' });
  list.splice(index, 1);
  data.updatedAt = new Date().toISOString();
  await persist();
  return sendJson(res, 200, { ok: true, updatedAt: data.updatedAt });
}

async function handleMoveItem(req, res, section, id) {
  let body;
  try {
    body = await readBody(req);
  } catch (err) {
    return sendJson(res, err.status || 400, { error: err.message });
  }
  const list = data[section];
  const index = list.findIndex((entry) => entry.id === id);
  if (index < 0) return sendJson(res, 404, { error: '记录不存在。' });
  const target = body.direction === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= list.length) {
    return sendJson(res, 200, { ok: true, updatedAt: data.updatedAt });
  }
  const [moved] = list.splice(index, 1);
  list.splice(target, 0, moved);
  data.updatedAt = new Date().toISOString();
  await persist();
  return sendJson(res, 200, { ok: true, updatedAt: data.updatedAt });
}

/* ------------------------------------------------------------------ */
/* 静态资源                                                            */
/* ------------------------------------------------------------------ */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8'
};

async function serveStatic(req, res, pathname) {
  let relative = pathname;
  if (relative === '/' || relative === '') relative = '/index.html';
  if (relative === '/admin' || relative === '/admin/') relative = '/admin.html';
  const filePath = path.join(PUBLIC_DIR, path.normalize(relative).replace(/^(\.\.[/\\])+/, ''));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Forbidden');
  }
  try {
    const content = await fsp.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=600'
    });
    res.end(content);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><meta charset="utf-8"><title>404</title><p style="font-family:sans-serif;padding:48px">页面不存在。<a href="/">返回首页</a></p>');
  }
}

/* ------------------------------------------------------------------ */
/* 路由                                                                */
/* ------------------------------------------------------------------ */

async function route(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(url.pathname);
  const method = req.method || 'GET';

  if (!pathname.startsWith('/api/')) {
    if (method !== 'GET' && method !== 'HEAD') {
      res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Method Not Allowed');
    }
    return serveStatic(req, res, pathname);
  }

  const segments = pathname.split('/').filter(Boolean); // ['api', ...]
  const rest = segments.slice(1);

  // 公开接口
  if (rest[0] === 'profile' && rest.length === 1 && method === 'GET') {
    return sendJson(res, 200, publicData());
  }
  if (rest[0] === 'session' && method === 'GET') {
    const session = getSession(req);
    return sendJson(res, 200, { loggedIn: Boolean(session), user: session ? session.user : null });
  }
  if (rest[0] === 'login' && method === 'POST') {
    return handleLogin(req, res);
  }
  if (rest[0] === 'logout' && method === 'POST') {
    return handleLogout(req, res);
  }

  // 以下都需要登录
  const session = getSession(req);
  if (!session) {
    return sendJson(res, 401, { error: '请先登录。' });
  }

  if (rest[0] === 'password' && method === 'POST') {
    return handleChangePassword(req, res, session);
  }
  if (rest[0] === 'profile' && method === 'PUT') {
    return handleUpdateBasic(req, res);
  }

  const section = rest[0];
  if (!SECTIONS.includes(section)) {
    return sendJson(res, 404, { error: '接口不存在。' });
  }
  if (rest.length === 1 && method === 'POST') {
    return handleCreateItem(req, res, section);
  }
  if (rest.length === 2 && method === 'PUT') {
    return handleUpdateItem(req, res, section, rest[1]);
  }
  if (rest.length === 2 && method === 'DELETE') {
    return handleDeleteItem(req, res, section, rest[1]);
  }
  if (rest.length === 3 && rest[2] === 'move' && method === 'POST') {
    return handleMoveItem(req, res, section, rest[1]);
  }
  return sendJson(res, 405, { error: '请求方式不支持。' });
}

/* ------------------------------------------------------------------ */
/* 启动                                                                */
/* ------------------------------------------------------------------ */

ensureAuthFile();
loadData();

const server = http.createServer((req, res) => {
  route(req, res).catch((err) => {
    console.error('[server] 未处理的错误：', err);
    if (!res.headersSent) {
      sendJson(res, 500, { error: '服务器内部错误。' });
    } else {
      res.end();
    }
  });
});

server.listen(PORT, HOST, () => {
  console.log(`个人档案站点已启动：http://localhost:${PORT}`);
  console.log(`后台管理：http://localhost:${PORT}/admin`);
  console.log(`数据文件：${DATA_FILE}`);
});

process.on('SIGTERM', () => {
  console.log('收到 SIGTERM，正在关闭…');
  server.close(() => process.exit(0));
});
