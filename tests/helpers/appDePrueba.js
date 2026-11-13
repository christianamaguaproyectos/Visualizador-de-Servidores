/**
 * Levanta la aplicación REAL (node backend/server.js) contra una base PostgreSQL de pruebas.
 *
 * Requiere TEST_POSTGRES_URL. Por seguridad, el nombre de la base DEBE contener "test" o "ci":
 * el esquema se borra y se vuelve a crear con scripts/sql/*.sql en cada ejecución.
 */
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const URL_BD = process.env.TEST_POSTGRES_URL || '';
const BOM = String.fromCharCode(0xFEFF);

export const CREDENCIALES = {
  admin: { username: 'admin', password: 'Admin-Pruebas-CI-2026' },
  lector: { username: 'lector', password: 'Lector-Pruebas-CI-2026' },
};

/** Motivo para omitir las pruebas de integración (o null si se pueden ejecutar) */
export function motivoParaOmitir() {
  if (!URL_BD) return 'Defina TEST_POSTGRES_URL (base de pruebas) para ejecutar las pruebas de integración';
  const nombreBd = new URL(URL_BD).pathname.replace(/^\//, '');
  if (!/test|ci/i.test(nombreBd)) return `La base "${nombreBd}" no parece de pruebas (debe contener "test" o "ci"): no se tocará`;
  return null;
}

/** Borra y recrea los esquemas aplicando scripts/sql en orden (como docker-entrypoint-initdb.d) */
export async function prepararBaseDeDatos() {
  const cliente = new pg.Client({ connectionString: URL_BD });
  await cliente.connect();
  try {
    await cliente.query('DROP SCHEMA IF EXISTS inventory, monitoring, users CASCADE');
    const carpeta = path.join(RAIZ, 'scripts', 'sql');
    for (const archivo of fs.readdirSync(carpeta).filter((f) => f.endsWith('.sql')).sort()) {
      // Algunos .sql se guardaron con BOM (psql lo ignora; el driver pg no)
      await cliente.query(fs.readFileSync(path.join(carpeta, archivo), 'utf8').replace(BOM, ''));
    }
  } finally {
    await cliente.end();
  }
}

function entorno(extra = {}) {
  return {
    ...process.env,
    NODE_ENV: 'production',
    POSTGRES_URL: URL_BD,
    DATABASE_URL: URL_BD,
    SESSION_SECRET: crypto.randomBytes(32).toString('hex'),
    MONITORING_ENABLED: '1',
    APP_URL: 'http://localhost',
    SMTP_HOST: '',
    TEAMS_WEBHOOK_URL: '',
    ...extra,
  };
}

/** Crea los usuarios de prueba con el CLI real (scripts/manage-users.js) */
export function crearUsuarios() {
  for (const [rol, c] of [['admin', CREDENCIALES.admin], ['viewer', CREDENCIALES.lector]]) {
    const r = spawnSync(process.execPath, ['scripts/manage-users.js', 'add', '--username', c.username, '--password', c.password, '--role', rol, '--name', c.username], {
      cwd: RAIZ, env: entorno(), encoding: 'utf8', timeout: 30000,
    });
    if (r.status !== 0) throw new Error(`No se pudo crear ${c.username}: ${r.stderr || r.stdout}`);
  }
}

function puertoLibre() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => { const { port } = srv.address(); srv.close(() => resolve(port)); });
  });
}

/** Inicia la app y espera a que responda. Devuelve { base, detener() } */
export async function iniciarApp() {
  const puerto = await puertoLibre();
  const proceso = spawn(process.execPath, ['backend/server.js'], {
    cwd: RAIZ, env: entorno({ PORT: String(puerto) }), stdio: ['ignore', 'pipe', 'pipe'],
  });
  let salida = '';
  proceso.stdout.on('data', (d) => { salida += d; });
  proceso.stderr.on('data', (d) => { salida += d; });

  // "localhost" (no 127.0.0.1): fuera de la red corporativa la app escucha en "localhost",
  // que según el sistema resuelve a ::1 (IPv6) o a 127.0.0.1
  const base = `http://localhost:${puerto}`;
  const limite = Date.now() + 30000;
  while (Date.now() < limite) {
    if (proceso.exitCode !== null) throw new Error(`La app terminó al arrancar:\n${salida.slice(-3000)}`);
    try {
      const r = await fetch(`${base}/api/auth/session`);
      if (r.ok) break;
    } catch { /* aún no escucha */ }
    await new Promise((r) => setTimeout(r, 300));
  }
  if (Date.now() >= limite) { proceso.kill('SIGKILL'); throw new Error(`La app no respondió en 30 s:\n${salida.slice(-3000)}`); }

  return {
    base,
    proceso,
    salida: () => salida,
    async detener() {
      if (proceso.exitCode !== null) return proceso.exitCode;
      const fin = new Promise((resolve) => proceso.once('exit', (code) => resolve(code)));
      proceso.kill('SIGTERM');
      const t = setTimeout(() => proceso.kill('SIGKILL'), 15000);
      const code = await fin;
      clearTimeout(t);
      return code;
    },
  };
}

/** Cliente HTTP con cookie de sesión y token CSRF (como el navegador) */
export function clienteHttp(base) {
  let cookie = '';
  let csrf = null;
  async function api(method, ruta, { body, headers = {}, sinCsrf = false } = {}) {
    const h = { ...headers };
    if (cookie) h.cookie = cookie;
    if (body !== undefined) h['content-type'] = 'application/json';
    if (csrf && !sinCsrf && !['GET', 'HEAD'].includes(method)) h['x-csrf-token'] = csrf;
    const res = await fetch(base + ruta, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
    for (const c of res.headers.getSetCookie?.() || []) {
      const par = c.split(';')[0];
      if (par.startsWith('connect.sid=')) cookie = par.endsWith('=') ? '' : par;
    }
    const texto = await res.text();
    let data = texto; try { data = JSON.parse(texto); } catch { /* no es JSON */ }
    return { status: res.status, data, headers: res.headers };
  }
  return {
    api,
    get cookie() { return cookie; },
    async login({ username, password }) {
      const r = await api('POST', '/api/auth/login', { body: { username, password } });
      csrf = r.data?.csrfToken || null;
      return r;
    },
  };
}
