require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 3000;
const DASH_PASSWORD = process.env.DASH_PASSWORD || 'aw26admin';

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'phones.db'));
db.exec(`
  CREATE TABLE IF NOT EXISTS phones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="KNOTS Dashboard"');
    return res.status(401).send('Unauthorized');
  }
  const decoded = Buffer.from(auth.slice(6), 'base64').toString();
  const password = decoded.includes(':') ? decoded.split(':').slice(1).join(':') : decoded;
  if (password !== DASH_PASSWORD) {
    res.setHeader('WWW-Authenticate', 'Basic realm="KNOTS Dashboard"');
    return res.status(401).send('Unauthorized');
  }
  next();
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

app.post('/submit', (req, res) => {
  const { phone } = req.body;
  if (!phone || typeof phone !== 'string') {
    return res.status(400).json({ error: 'Phone number required.' });
  }
  const cleaned = phone.replace(/\s+/g, '').trim();
  if (!cleaned) {
    return res.status(400).json({ error: 'Invalid phone number.' });
  }
  try {
    db.prepare('INSERT INTO phones (phone) VALUES (?)').run(cleaned);
    return res.json({ success: true });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.json({ success: true });
    }
    console.error(err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

app.get('/dash', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT phone, created_at FROM phones ORDER BY created_at DESC').all();
  const tableRows = rows.map((r, i) => `
    <tr>
      <td>${rows.length - i}</td>
      <td>${escapeHtml(r.phone)}</td>
      <td>${escapeHtml(r.created_at)}</td>
    </tr>`).join('');

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>KNOTS AW26 — Dashboard</title>
  <style>
    body{font-family:monospace;background:#0c2d45;color:#fff;padding:2rem;margin:0}
    h1{margin-bottom:.5rem;font-size:1.4rem;letter-spacing:.1em}
    .meta{margin-bottom:1.5rem;font-size:.85rem;color:#7dd3d3}
    a{color:#7dd3d3;text-decoration:none}a:hover{text-decoration:underline}
    table{border-collapse:collapse;width:100%;max-width:700px}
    th,td{border:1px solid #1e4a6e;padding:8px 14px;text-align:left;font-size:.85rem}
    th{background:#1a3f5c;letter-spacing:.08em;text-transform:uppercase}
    tr:nth-child(even){background:#0e3555}
    tr:hover{background:#163d5a}
  </style>
</head>
<body>
  <h1>KNOTS AW26</h1>
  <div class="meta">
    ${rows.length} number${rows.length !== 1 ? 's' : ''} collected &nbsp;|&nbsp;
    <a href="/export">Download CSV</a>
  </div>
  <table>
    <thead><tr><th>#</th><th>Phone</th><th>Submitted</th></tr></thead>
    <tbody>${tableRows || '<tr><td colspan="3" style="text-align:center;opacity:.5">No submissions yet</td></tr>'}</tbody>
  </table>
</body>
</html>`);
});

app.get('/export', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT phone, created_at FROM phones ORDER BY created_at ASC').all();
  const csv = ['phone,submitted_at', ...rows.map(r => `"${r.phone}","${r.created_at}"`)].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="knots-aw26-phones.csv"');
  res.send(csv);
});

app.listen(PORT, () => console.log(`KNOTS AW26 running on :${PORT}`));
