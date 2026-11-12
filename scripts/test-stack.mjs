import { spawn, execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const native = (command, args) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { windowsHide: true, stdio: 'ignore' });
  child.once('error', reject);
  child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`${path.basename(command)} failed (${code})`)));
});
const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(new URL('../server/package.json', import.meta.url));
const { Pool } = require('pg');
const children = new Set();
const database = `mvp_stack_${randomUUID().replaceAll('-', '')}`;
let cluster;
let admin;
let created = false;
let stopping;
await fs.mkdir(path.join(root, 'test-results'), { recursive: true });
const log = createWriteStream(path.join(root, 'test-results/stack.log'));

const port = () => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const value = server.address().port;
    server.close((error) => error ? reject(error) : resolve(value));
  });
});

const launch = (args, cwd, env, label) => {
  const child = spawn(process.execPath, args, { cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  children.add(child);
  child.stdout.on('data', (data) => log.write(`[${label}] ${data}`));
  child.stderr.on('data', (data) => log.write(`[${label}] ${data}`));
  child.once('exit', () => children.delete(child));
  child.on('error', (error) => log.write(`[${label}] ${error.message}\n`));
  return child;
};

const run = (args, cwd, env, label) => new Promise((resolve, reject) => {
  const child = launch(args, cwd, env, label);
  if (label === 'playwright') {
    child.stdout.pipe(process.stdout);
    child.stderr.pipe(process.stderr);
  }
  child.once('error', reject);
  child.once('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`${label} failed (${code ?? signal}); see test-results/stack.log`)));
});

const ready = async (url, child) => {
  for (let attempt = 0; attempt < 300; attempt++) {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error(`Server exited before ${url} was ready`);
    try { if ((await fetch(url)).ok) return; } catch { /* Server is starting. */ }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Readiness timed out: ${url}; see test-results/stack.log`);
};

const cleanup = () => stopping ??= (async () => {
  for (const child of [...children]) {
    if (child.exitCode !== null || child.signalCode !== null) continue;
    if (process.platform === 'win32') {
      await execute('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }).catch(() => {});
    } else {
      child.kill('SIGTERM');
      await Promise.race([new Promise((resolve) => child.once('exit', resolve)), new Promise((resolve) => setTimeout(resolve, 3000))]);
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }
  }
  try {
    if (created && /^mvp_stack_[a-f0-9]{32}$/.test(database)) await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);
  } finally {
    await admin?.end();
    if (cluster) {
      if (cluster.started) await native(path.join(cluster.bin, 'pg_ctl'), ['-D', path.join(cluster.directory, 'data'), '-m', 'fast', '-w', 'stop']);
      const resolved = path.resolve(cluster.directory);
      if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('collabit-stack-')) throw new Error('Unexpected temporary cluster path');
      await fs.rm(resolved, { recursive: true, force: true });
    }
    log.end();
  }
})();

for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  void cleanup().finally(() => process.exit(130));
});

try {
  let adminUrl = process.env.TEST_DATABASE_ADMIN_URL;
  if (!adminUrl) {
    const bin = process.env.PG_BIN || (await execute('pg_config', ['--bindir'], { windowsHide: true })).stdout.trim();
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'collabit-stack-'));
    cluster = { bin, directory, started: false };
    const pgPort = await port();
    console.info('Initializing a temporary PostgreSQL cluster...');
    await native(path.join(bin, 'initdb'), ['-D', path.join(directory, 'data'), '-U', 'mvp_test', '--auth=trust', '--no-locale', '--encoding=UTF8']);
    await native(path.join(bin, 'pg_ctl'), ['-D', path.join(directory, 'data'), '-l', path.join(directory, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${pgPort}`, '-w', 'start']);
    cluster.started = true;
    adminUrl = `postgresql://mvp_test@127.0.0.1:${pgPort}/postgres`;
  }
  const connection = new URL(adminUrl);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(connection.hostname)) throw new Error('TEST_DATABASE_ADMIN_URL must point to a local disposable PostgreSQL server');
  admin = new Pool({ connectionString: connection.toString(), connectionTimeoutMillis: 5000 });
  await admin.query(`CREATE DATABASE "${database}"`);
  created = true;
  connection.pathname = `/${database}`;
  const apiPort = await port();
  const appPort = await port();
  const api = `http://127.0.0.1:${apiPort}`;
  const app = `http://127.0.0.1:${appPort}`;
  const env = {
    ...process.env, NODE_ENV: 'test', PORT: String(apiPort), DATABASE_URL: connection.toString(),
    AUTH_SECRET: 'isolated-test-stack-secret-more-than-32-characters', JWT_SECRET: 'isolated-test-stack-jwt-more-than-32-characters',
    AUTH_BASE_URL: api, CORS_ORIGINS: app, GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '',
    VITE_API_BASE_URL: api, VITE_WS_URL: `ws://127.0.0.1:${apiPort}/ws`,
    PLAYWRIGHT_API_BASE_URL: api, PLAYWRIGHT_BASE_URL: app, PLAYWRIGHT_WORKSPACE_ID: 'default',
    PLAYWRIGHT_HTML_OPEN: 'never'
  };
  console.info('Building the isolated test application...');
  const reuseServer = process.argv.includes('--reuse-server-build');
  if (reuseServer) await fs.access(path.join(root, 'server/dist/server.js'));
  await run([process.env.npm_execpath, 'run', 'build', ...(reuseServer ? ['--workspace', 'client'] : [])], root, env, 'build');
  await run(['dist/migrate.js', 'run'], path.join(root, 'server'), env, 'migrate');
  const backend = launch(['dist/server.js'], path.join(root, 'server'), env, 'api');
  const frontend = launch([path.join(root, 'node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', String(appPort), '--strictPort'], path.join(root, 'client'), env, 'client');
  await Promise.all([ready(`${api}/ready`, backend), ready(app, frontend)]);
  console.info('Fresh database and application servers ready. Running browser/API checks...');
  await run([process.env.npm_execpath, 'run', 'test:e2e', '--workspace', 'client', '--', ...process.argv.slice(2).filter((arg) => arg !== '--reuse-server-build')], root, env, 'playwright');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await cleanup();
}
