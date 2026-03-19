const https = require('https');

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

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  try {
    const { clientId, clientSecret, refreshToken, region } = req.body || {};
    if (!clientId || !clientSecret || !refreshToken) {
      return res.status(400).json({ ok: false, error: 'Missing credentials' });
    }

    const tokenRes = await request('https://api.amazon.com/auth/o2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken }).toString()
    });

    if (!tokenRes.ok) {
      return res.status(200).json({ ok: false, error: tokenRes.data?.error_description || tokenRes.data?.error || JSON.stringify(tokenRes.data) });
    }

    const profilesRes = await request((apiUrls[region] || apiUrls.NA) + '/v2/profiles', {
      headers: { 'Authorization': 'Bearer ' + tokenRes.data.access_token, 'Amazon-Advertising-API-ClientId': clientId, 'Content-Type': 'application/json' }
    });

    if (profilesRes.ok) {
      const d = profilesRes.data;
      const list = Array.isArray(d) ? d : (d?.profiles || []);
      return res.status(200).json({ ok: true, profiles: list.length, profileList: list, expiresIn: tokenRes.data.expires_in });
    } else {
      return res.status(200).json({ ok: false, error: typeof profilesRes.data === 'string' ? profilesRes.data : JSON.stringify(profilesRes.data) });
    }
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
};
