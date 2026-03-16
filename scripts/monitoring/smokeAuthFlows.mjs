const base = process.env.BASE_URL || 'http://localhost:8082';
const username = process.env.SMOKE_USER || 'admin';
const password = process.env.SMOKE_PASS || 'Admin2025!';

function pickCookie(headers) {
  if (!headers) return '';

  if (typeof headers.getSetCookie === 'function') {
    const cookies = headers.getSetCookie();
    if (Array.isArray(cookies) && cookies.length > 0) {
      return String(cookies[0]).split(';')[0] || '';
    }
  }

  const single = headers.get('set-cookie');
  if (single) return String(single).split(';')[0] || '';

  return '';
}

async function requestJson(path, options = {}) {
  const res = await fetch(`${base}${path}`, options);
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, headers: res.headers, text, json };
}

function row(flow, pass, status, requestId, detail) {
  return { flow, pass, status, requestId, detail };
}

async function main() {
  const results = [];

  const login = await requestJson('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });

  const cookie = pickCookie(login.headers);
  const loginOk = login.status === 200 && (login.json?.success === true || login.json?.ok === true);
  results.push(row('Login admin', loginOk, login.status, Boolean(login.json?.requestId), login.json?.message || 'ok'));

  const authHeaders = cookie ? { Cookie: cookie } : {};

  for (const flow of [
    { name: 'Dashboard', path: '/api/monitoring/dashboard' },
    { name: 'Incidentes', path: '/api/monitoring/incidents?limit=10&offset=0' },
    { name: 'Checks', path: '/api/monitoring/checks?limit=10&offset=0' }
  ]) {
    const r = await requestJson(flow.path, { headers: authHeaders });
    const hasRequestId = Boolean(r.json?.requestId);
    const pass = r.status === 200 && hasRequestId;
    results.push(row(flow.name, pass, r.status, hasRequestId, pass ? 'ok' : (r.text || '').slice(0, 120)));
  }

  const failed = results.filter(r => !r.pass).length;
  console.log(JSON.stringify({ base, username, failed, results }, null, 2));

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(JSON.stringify({ error: err.message }, null, 2));
  process.exit(1);
});
