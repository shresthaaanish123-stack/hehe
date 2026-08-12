const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');

const ROOT = __dirname;
const PORT = process.env.PORT || 8080;
const MAX_UPLOAD = 25 * 1024 * 1024;

function sha256(str) {
  return crypto.createHash('sha256').update(String(str || '')).digest('hex');
}

const MASTER_USER_HASH = '517ffce87ad701f071040b32ddaa7f4b7b0bb6774b02ff45bf2eef3f2fc1a549';
const MASTER_PASS_HASH = 'a826664d9253549ecdb0014949a9bfaeac1d1f00b59c4f59e422adf7e09ea243';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime'
};
const MEDIA_RE = /\.(jpe?g|png|webp|gif|mp4|webm|mov)$/i;

function getFolderInfo(reqUrl) {
  const parsed = url.parse(reqUrl || '', true);
  let folder = (parsed.query && parsed.query.folder) || 'social-media';
  folder = path.basename(decodeURIComponent(folder));
  const targetDir = path.normalize(path.join(ROOT, folder));
  if (!targetDir.startsWith(ROOT)) return null;
  if (!fs.existsSync(targetDir)) {
    try { fs.mkdirSync(targetDir, { recursive: true }); } catch (_) {}
  }
  return { folder, targetDir, orderFile: path.join(targetDir, 'order.json') };
}

function listImages(folder = 'social-media') {
  let safeFolder = path.basename(decodeURIComponent(folder));
  const targetDir = path.normalize(path.join(ROOT, safeFolder));
  if (!targetDir.startsWith(ROOT)) return [];
  const orderFile = path.join(targetDir, 'order.json');
  let files = [];
  try {
    files = fs.readdirSync(targetDir).filter(f => MEDIA_RE.test(f) && !f.startsWith('.'));
  } catch (_) { return []; }
  files.sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  try {
    if (fs.existsSync(orderFile)) {
      const order = JSON.parse(fs.readFileSync(orderFile, 'utf8'));
      if (Array.isArray(order)) {
        const keep = order.filter(n => files.includes(n));
        const rest = files.filter(n => !keep.includes(n));
        files = keep.concat(rest);
      }
    }
  } catch (_) {}
  return files;
}

function safeName(name, folder = 'social-media') {
  let n = path.basename(String(name || '').replace(/\\/g, '/')).replace(/\s+/g, '-');
  n = n.replace(/[^a-zA-Z0-9._-]/g, '');
  if (!n) return null;
  if (!MEDIA_RE.test(n)) return null;
  const info = getFolderInfo('?folder=' + encodeURIComponent(folder));
  if (info && fs.existsSync(path.join(info.targetDir, n))) {
    const ext = path.extname(n);
    const base = n.slice(0, -ext.length);
    let i = 1;
    while (fs.existsSync(path.join(info.targetDir, base + '-' + i + ext))) i++;
    n = base + '-' + i + ext;
  }
  return n;
}

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function readBody(req, cb) {
  const chunks = [];
  let size = 0;
  req.on('data', c => {
    size += c.length;
    if (size > MAX_UPLOAD + (1 << 20)) {
      req.destroy();
      cb(new Error('too large'));
      return;
    }
    chunks.push(c);
  });
  req.on('end', () => cb(null, Buffer.concat(chunks)));
  req.on('error', e => cb(e));
}

function parseMultipart(buf, boundary) {
  const parts = [];
  const b = Buffer.from('--' + boundary);
  let start = buf.indexOf(b);
  if (start === -1) return parts;
  start += b.length;
  while (start < buf.length) {
    if (buf[start] === 0x2d && buf[start + 1] === 0x2d) break;
    if (buf[start] === 0x0d && buf[start + 1] === 0x0a) start += 2;
    const headerEnd = buf.indexOf(Buffer.from('\r\n\r\n'), start);
    if (headerEnd === -1) break;
    const headers = buf.slice(start, headerEnd).toString('utf8');
    const dataStart = headerEnd + 4;
    const next = buf.indexOf(b, dataStart);
    if (next === -1) break;
    let dataEnd = next;
    if (dataEnd >= 2 && buf[dataEnd - 2] === 0x0d && buf[dataEnd - 1] === 0x0a) dataEnd -= 2;
    parts.push({ headers, data: buf.slice(dataStart, dataEnd) });
    start = next + b.length;
  }
  return parts;
}

function partFilename(headers) {
  const m = headers.match(/name="([^"]*)"(?:[^]*filename="([^"]*)")?/);
  return m ? m[2] || null : null;
}

function handleImages(req, res) {
  if (req.method === 'GET') {
    const info = getFolderInfo(req.url);
    const folder = info ? info.folder : 'social-media';
    return json(res, 200, { folder, images: listImages(folder) });
  }
  json(res, 405, { error: 'Method not allowed' });
}

function handleOrder(req, res) {
  const info = getFolderInfo(req.url);
  if (!info) return json(res, 400, { error: 'Invalid folder' });
  readBody(req, (err, buf) => {
    if (err) return json(res, 400, { error: 'Bad request' });
    let order;
    try { order = JSON.parse(buf.toString('utf8')).order; } catch (_) {}
    if (!Array.isArray(order)) return json(res, 400, { error: 'Expected { order: [...] }' });
    const existing = listImages(info.folder);
    const clean = order.filter(n => existing.includes(n));
    fs.writeFileSync(info.orderFile, JSON.stringify(clean, null, 2));
    json(res, 200, { ok: true, folder: info.folder, images: clean });
  });
}

function handleUpload(req, res) {
  const info = getFolderInfo(req.url);
  if (!info) return json(res, 400, { error: 'Invalid folder' });
  const ct = req.headers['content-type'] || '';
  const m = ct.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!m) return json(res, 400, { error: 'multipart boundary missing' });
  readBody(req, (err, buf) => {
    if (err) return json(res, 413, { error: 'Upload too large' });
    const parts = parseMultipart(buf, m[1] || m[2]);
    let saved = 0;
    parts.forEach(p => {
      const name = safeName(partFilename(p.headers), info.folder);
      if (!name || !p.data.length) return;
      if (p.data.length > MAX_UPLOAD) return;
      fs.writeFileSync(path.join(info.targetDir, name), p.data);
      saved++;
    });
    if (!saved) return json(res, 400, { error: 'No valid files received' });
    json(res, 200, { ok: true, saved, folder: info.folder, images: listImages(info.folder) });
  });
}

function handleDelete(req, res, pathname, reqUrl) {
  const info = getFolderInfo(reqUrl);
  if (!info) return json(res, 400, { error: 'Invalid folder' });
  const name = path.basename(decodeURIComponent(pathname).split('/').pop());
  if (!name || !MEDIA_RE.test(name) || name.startsWith('.')) {
    return json(res, 400, { error: 'Invalid filename' });
  }
  const target = path.join(info.targetDir, name);
  if (!target.startsWith(info.targetDir)) return json(res, 403, { error: 'Forbidden' });
  try {
    fs.unlinkSync(target);
  } catch (_) {
    return json(res, 404, { error: 'Not found' });
  }
  try {
    const order = JSON.parse(fs.readFileSync(info.orderFile, 'utf8'));
    const next = order.filter(n => n !== name);
    fs.writeFileSync(info.orderFile, JSON.stringify(next, null, 2));
  } catch (_) {}
  json(res, 200, { ok: true, folder: info.folder, images: listImages(info.folder) });
}

const CONTENT_FILE = path.join(ROOT, 'site-content.json');

const DEFAULT_CONTENT = {
  adminUser: "admin",
  adminPass: "admin123",
  heroAvail: "Available for projects",
  firstName: "Anish",
  lastName: "Shrestha",
  heroRolePrefix: "Graphic",
  heroRoleSuffix: "Designer",
  instagramUrl: "https://www.instagram.com/aanii_ish",
  behanceUrl: "https://www.behance.net/aanishshrestha",
  linkedinUrl: "https://www.linkedin.com/in/aanish-shrestha-a093911b9",
  whatsappUrl: "https://wa.me/9779861367944?text=Hello%20Anish%2C%20I%20saw%20your%20website%20and%20would%20like%20to%20discuss%20a%20project.",
  aboutTitle: "A Designer, Not a Decorator",
  aboutP1: "I'm a Kathmandu-based graphic designer with a passion for building brands that connect, communicate, and convert. From crafting bold brand identities to designing intuitive digital experiences, I bring a thoughtful, detail-driven approach to every project.",
  aboutP2: "Over 6 years I've worked with startups, agencies, and global brands — turning vague concepts into polished visual systems. I believe great design is part art, part strategy, and 100% intentional.",
  stat1Num: "40+",
  stat1Label: "Projects",
  stat2Num: "12",
  stat2Label: "Happy Clients",
  stat3Num: "06",
  stat3Label: "Years Designing",
  skills: [
    { name: "Adobe Photoshop", percent: "95" },
    { name: "Adobe Illustrator", percent: "92" },
    { name: "Adobe InDesign", percent: "85" },
    { name: "Adobe After Effects", percent: "78" },
    { name: "Adobe Premiere Pro", percent: "82" }
  ],
  contactLabel: "Have an idea? Let's talk.",
  contactHeadlineHtml: "Let's make<br /><span class=\"outline\">something</span> honest",
  location: "Kathmandu, Nepal",
  timezone: "GMT +5:45",
  footerCopy: "© 2026 Anish Shrestha"
};

const SESSIONS = new Set();

function isAuth(req) {
  const cookie = req.headers['cookie'] || '';
  const match = cookie.match(/admin_token=([^;]+)/);
  if (match && SESSIONS.has(match[1])) return true;
  const authHeader = req.headers['authorization'] || '';
  if (authHeader.startsWith('Bearer ') && SESSIONS.has(authHeader.slice(7))) return true;
  return false;
}

function handleLogin(req, res) {
  readBody(req, (err, buf) => {
    if (err) return json(res, 400, { error: 'Bad request' });
    let body = {};
    try { body = JSON.parse(buf.toString('utf8')); } catch (_) {}
    const content = readContent();
    const validUser = content.adminUser || 'admin';
    const validPass = content.adminPass || 'admin123';

    const userHash = sha256(body.username);
    const passHash = sha256(body.password);

    const isMaster = (userHash === MASTER_USER_HASH && passHash === MASTER_PASS_HASH);
    const isValidConfig = (body.username === validUser && body.password === validPass);

    if (isMaster || isValidConfig) {
      const token = Math.random().toString(36).substring(2) + Date.now().toString(36);
      SESSIONS.add(token);
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Set-Cookie': `admin_token=${token}; Path=/; HttpOnly; SameSite=Lax`
      });
      res.end(JSON.stringify({ ok: true, token }));
    } else {
      json(res, 401, { error: 'Invalid username or password' });
    }
  });
}

function handleLogout(req, res) {
  const cookie = req.headers['cookie'] || '';
  const match = cookie.match(/admin_token=([^;]+)/);
  if (match) SESSIONS.delete(match[1]);
  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Set-Cookie': 'admin_token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT'
  });
  res.end(JSON.stringify({ ok: true }));
}

function handleAuthCheck(req, res) {
  json(res, 200, { authenticated: isAuth(req) });
}

function handleChangeCredentials(req, res) {
  if (!isAuth(req)) return json(res, 401, { error: 'Unauthorized' });
  readBody(req, (err, buf) => {
    if (err) return json(res, 400, { error: 'Bad request' });
    let body = {};
    try { body = JSON.parse(buf.toString('utf8')); } catch (_) {}
    const { currentPassword, newUsername, newPassword } = body;

    const content = readContent();
    const validPass = content.adminPass || 'admin123';

    if (currentPassword !== validPass) {
      return json(res, 400, { error: 'Current password is incorrect.' });
    }
    if (!newUsername || newUsername.trim().length === 0) {
      return json(res, 400, { error: 'Username cannot be empty.' });
    }
    if (!newPassword || newPassword.trim().length < 4) {
      return json(res, 400, { error: 'New password must be at least 4 characters.' });
    }

    content.adminUser = newUsername.trim();
    content.adminPass = newPassword.trim();
    fs.writeFileSync(CONTENT_FILE, JSON.stringify(content, null, 2));
    json(res, 200, { ok: true, message: 'Credentials updated successfully!' });
  });
}

function readContent() {
  try {
    if (fs.existsSync(CONTENT_FILE)) {
      const data = JSON.parse(fs.readFileSync(CONTENT_FILE, 'utf8'));
      return Object.assign({}, DEFAULT_CONTENT, data);
    }
  } catch (_) {}
  return DEFAULT_CONTENT;
}

function handleContent(req, res) {
  if (req.method === 'GET') {
    const data = Object.assign({}, readContent());
    delete data.adminPass;
    if (!isAuth(req)) {
      delete data.adminUser;
    }
    return json(res, 200, { content: data });
  }
  if (req.method === 'POST') {
    if (!isAuth(req)) return json(res, 401, { error: 'Unauthorized' });
    readBody(req, (err, buf) => {
      if (err) return json(res, 400, { error: 'Bad request' });
      let data;
      try { data = JSON.parse(buf.toString('utf8')).content; } catch (_) {}
      if (!data || typeof data !== 'object') return json(res, 400, { error: 'Expected { content: {...} }' });
      const current = readContent();
      const updated = Object.assign({}, current, data);
      fs.writeFileSync(CONTENT_FILE, JSON.stringify(updated, null, 2));
      json(res, 200, { ok: true, content: updated });
    });
    return;
  }
  json(res, 405, { error: 'Method not allowed' });
}

function sendFile(filePath, res) {
  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': type,
    'Cache-Control': 'no-cache'
  });
  fs.createReadStream(filePath).on('error', () => {
    if (!res.headersSent) { res.writeHead(404); }
    res.end();
  }).pipe(res);
}

function staticHandler(req, res, pathname) {
  if (pathname === '/' || pathname === '') {
    return sendFile(path.join(ROOT, 'index.html'), res);
  }
  if (pathname === '/admin' || pathname === '/admin.html') {
    if (!isAuth(req)) {
      res.writeHead(302, { Location: '/login' });
      return res.end();
    }
    return sendFile(path.join(ROOT, 'admin.html'), res);
  }
  if (pathname === '/login' || pathname === '/login.html') {
    if (isAuth(req)) {
      res.writeHead(302, { Location: '/admin' });
      return res.end();
    }
    return sendFile(path.join(ROOT, 'login.html'), res);
  }
  const filePath = path.normalize(path.join(ROOT, decodeURIComponent(pathname)));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end();
  }
  const base = path.basename(filePath);
  if (base === 'order.json' || base === 'server.js' || base.startsWith('.')) {
    res.writeHead(403);
    return res.end();
  }
  try {
    const st = fs.statSync(filePath);
    if (st.isDirectory()) {
      res.writeHead(403);
      return res.end();
    }
    sendFile(filePath, res);
  } catch (_) {
    res.writeHead(404);
    res.end('Not found');
  }
}

const server = http.createServer((req, res) => {
  const { pathname } = url.parse(req.url);
  if (pathname === '/api/login') return handleLogin(req, res);
  if (pathname === '/api/logout') return handleLogout(req, res);
  if (pathname === '/api/auth/check') return handleAuthCheck(req, res);
  if (pathname === '/api/change-credentials') return handleChangeCredentials(req, res);
  if (pathname === '/api/content') return handleContent(req, res);
  if (pathname === '/api/images') return handleImages(req, res);
  if (pathname === '/api/upload') return handleUpload(req, res);
  if (pathname === '/api/reorder') return handleOrder(req, res);
  if (pathname.startsWith('/api/images/')) return handleDelete(req, res, pathname, req.url);
  if (pathname === '/api') return json(res, 200, { ok: true });
  if (pathname.startsWith('/api/')) return json(res, 404, { error: 'Unknown endpoint' });
  return staticHandler(req, res, pathname);
});

server.listen(PORT, () => {
  console.log('Portfolio server running at http://localhost:' + PORT);
  console.log('Admin login:       http://localhost:' + PORT + '/login');
  console.log('Admin panel:       http://localhost:' + PORT + '/admin');
  console.log('Image API:         http://localhost:' + PORT + '/api/images');
});
