// No package.json needed - uses Node.js built-in modules only.
// Run: node server.js

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const apiUrls = { NA: 'https://advertising-api.amazon.com', EU: 'https://advertising-api-eu.amazon.com', FE: 'https://advertising-api-fe.amazon.com' };

function request(url, opts) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const headers = { ...opts.headers };
    if (opts.body) headers['Content-Length'] = Buffer.byteLength(opts.body);
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: opts.method || 'GET',
      headers
    }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try { body = res.headers['content-type']?.includes('json') ? JSON.parse(body) : body; } catch (_) {}
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, data: body });
      });
    });
    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

const server = http.createServer(async (req, res) => {
  if (req.url === '/api/check' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      try {
        const { clientId, clientSecret, refreshToken, region } = JSON.parse(body);
        if (!clientId || !clientSecret || !refreshToken) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'Missing credentials' }));
          return;
        }
        const tokenRes = await request('https://api.amazon.com/auth/o2/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ grant_type: 'refresh_token', client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken }).toString()
        });
        if (!tokenRes.ok) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: tokenRes.data?.error_description || tokenRes.data?.error || JSON.stringify(tokenRes.data) }));
          return;
        }
        const profilesRes = await request((apiUrls[region] || apiUrls.NA) + '/v2/profiles', {
          headers: { 'Authorization': 'Bearer ' + tokenRes.data.access_token, 'Amazon-Advertising-API-ClientId': clientId, 'Content-Type': 'application/json' }
        });
        if (profilesRes.ok) {
          const d = profilesRes.data;
          const count = Array.isArray(d) ? d.length : (d?.profiles?.length ?? 0);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, profiles: count, expiresIn: tokenRes.data.expires_in }));
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: typeof profilesRes.data === 'string' ? profilesRes.data : JSON.stringify(profilesRes.data) }));
        }
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }
  const file = req.url === '/' ? 'index.html' : req.url;
  fs.readFile(path.join(__dirname, file), (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': file.endsWith('.css') ? 'text/css' : 'text/html' });
    res.end(data);
  });
});

server.listen(3000, () => console.log('Open http://localhost:3000'));
