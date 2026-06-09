const express = require('express');
const path    = require('path');
const fs      = require('fs');
const session = require('express-session');
const { exec } = require('child_process');

const app  = express();
const PORT = process.env.PORT || 3003;
const INNERGY_BASE = 'https://app.innergy.com';

const dataDir     = path.join(__dirname, 'data');
const apiKeysFile = path.join(dataDir, 'apikeys.json');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

function loadApiKeys() {
  try { return JSON.parse(fs.readFileSync(apiKeysFile, 'utf8')); }
  catch { return {}; }
}

// ── Auth ───────────────────────────────────────────────────────────────────────
const AUTH_USERS = {};
(process.env.AUTH_USERS || '').split(',').forEach(entry => {
  const colon = entry.indexOf(':');
  if (colon > 0) {
    const user = entry.slice(0, colon).trim().toLowerCase();
    const pass = entry.slice(colon + 1).trim();
    if (user && pass) AUTH_USERS[user] = pass;
  }
});
const AUTH_ENABLED = Object.keys(AUTH_USERS).length > 0;

app.set('trust proxy', 1);
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-only-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 8 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
  }
}));

// Login / logout (always public)
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));

app.post('/login', (req, res) => {
  const user = (req.body.username || '').trim().toLowerCase();
  const pass = (req.body.password || '').trim();
  if (AUTH_USERS[user] && AUTH_USERS[user] === pass) {
    req.session.user = user;
    return req.session.save(() => res.redirect('/'));
  }
  res.redirect('/login?error=1');
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

// Auth middleware
app.use((req, res, next) => {
  if (!AUTH_ENABLED) return next();
  if (req.session?.user) return next();
  if (req.path === '/login') return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Unauthorized' });
  res.redirect('/login');
});

app.use(express.static(path.join(__dirname, 'public')));
app.use('/shared', express.static(path.join(__dirname, 'shared')));

// ── Auth API routes ────────────────────────────────────────────────────────────
app.get('/api/auth-status', (req, res) => res.json({ authEnabled: AUTH_ENABLED }));

app.get('/api/my-key-status', (req, res) => {
  if (!AUTH_ENABLED) return res.json({ hasKey: false });
  const keys = loadApiKeys();
  res.json({ hasKey: !!(keys[req.session.user]) });
});

app.post('/api/save-key', (req, res) => {
  if (!AUTH_ENABLED) return res.status(400).json({ error: 'Auth not enabled' });
  const key = (req.body.key || '').trim();
  if (!key) return res.status(400).json({ error: 'key required' });
  const keys = loadApiKeys();
  keys[req.session.user] = key;
  fs.writeFileSync(apiKeysFile, JSON.stringify(keys, null, 2));
  res.json({ ok: true });
});

// ── Innergy proxy ──────────────────────────────────────────────────────────────
function resolveApiKey(req) {
  if (AUTH_ENABLED && req.session?.user) {
    const stored = loadApiKeys()[req.session.user];
    if (stored) return stored;
  }
  return req.headers['x-api-key'] || '';
}

async function proxyGet(req, res, innergyPath) {
  const apiKey = resolveApiKey(req);
  if (!apiKey) return res.status(401).json({ error: 'API key required' });

  const qs = Object.keys(req.query).length
    ? '?' + new URLSearchParams(req.query).toString()
    : '';
  const url = `${INNERGY_BASE}${innergyPath}${qs}`;

  try {
    const response = await fetch(url, {
      headers: { 'Api-Key': apiKey, 'Accept': 'application/json' }
    });
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { error: text }; }
    res.status(response.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

app.get('/api/projects', (req, res) =>
  proxyGet(req, res, '/api/projects'));

app.get('/api/dateManagement/:projectId', (req, res) =>
  proxyGet(req, res, `/api/dateManagement/${req.params.projectId}`));

app.get('/api/projects/:projectId/workOrders', (req, res) =>
  proxyGet(req, res, `/api/projects/${req.params.projectId}/workOrders`));

app.listen(PORT, () => {
  console.log(`Step Activity Report running at http://localhost:${PORT}`);
  if (process.env.NODE_ENV !== 'production') {
    exec(`start http://localhost:${PORT}`);
  }
});
