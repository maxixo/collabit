import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { Pool } from "pg";
import { createMigrationRunner } from "../src/config/migrationRunner.js";

const execute = promisify(execFile);
const serverRoot = fileURLToPath(new URL("../", import.meta.url));
const migrationsDirectory = path.join(serverRoot, "migrations");
const adminUrl = process.env.MIGRATION_TEST_DATABASE_URL;
if (!adminUrl || !["127.0.0.1", "localhost", "[::1]"].includes(new URL(adminUrl).hostname)) {
  throw new Error("Set MIGRATION_TEST_DATABASE_URL to a local disposable PostgreSQL admin connection.");
}

const withDatabase = async (t: TestContext) => {
  const database = `mvp_migrations_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: adminUrl, connectionTimeoutMillis: 3000 });
  try {
    await admin.query(`CREATE DATABASE "${database}"`);
  } catch (error) {
    await admin.end();
    throw error;
  }
  const connection = new URL(adminUrl);
  connection.pathname = `/${database}`;
  const pool = new Pool({ connectionString: connection.toString(), connectionTimeoutMillis: 3000 });
  t.after(async () => {
    await pool.end();
    try {
      if (!/^mvp_migrations_[a-f0-9]{32}$/.test(database)) {
        throw new Error("Refusing to drop an unexpected test database");
      }
      await admin.query(`DROP DATABASE "${database}"`);
    } finally {
      await admin.end();
    }
  });
  return { pool, connectionString: connection.toString() };
};

const withFiles = async (t: TestContext, files: Record<string, string>) => {
  const directory = await fs.mkdtemp(path.join(tmpdir(), "collabit-migrations-"));
  t.after(async () => {
    const resolved = path.resolve(directory);
    if (path.dirname(resolved) !== path.resolve(tmpdir()) || !path.basename(resolved).startsWith("collabit-migrations-")) {
      throw new Error("Refusing to remove an unexpected migration fixture directory");
    }
    await fs.rm(resolved, { recursive: true, force: true });
  });
  await Promise.all(Object.entries(files).map(([filename, sql]) =>
    fs.writeFile(path.join(directory, filename), sql)
  ));
  return directory;
};

const runNode = (connectionString: string, args: string[]) => execute(
  process.execPath,
  args,
  {
    cwd: serverRoot,
    timeout: 20_000,
    windowsHide: true,
    env: {
      ...process.env,
      NODE_ENV: "production",
      DATABASE_URL: connectionString,
      AUTH_SECRET: "migration-tests-only-secret-at-least-32-characters",
      JWT_SECRET: "migration-tests-only-jwt-at-least-32-characters",
      AUTH_BASE_URL: "https://api.example.test",
      CORS_ORIGINS: "https://app.example.test",
      GOOGLE_CLIENT_ID: "",
      GOOGLE_CLIENT_SECRET: ""
    }
  }
);

const runCli = (connectionString: string, args: string[], source = false) => runNode(
  connectionString,
  source ? ["--import", "tsx", "scripts/run-migrations.ts", ...args] : ["dist/migrate.js", ...args]
);

test("production API refuses pending migrations without bootstrapping schema", async (t) => {
  const { pool, connectionString } = await withDatabase(t);
  await assert.rejects(runNode(connectionString, ["dist/server.js"]), /Pending database migrations/);
  for (const table of ["user", "documents", "schema_migrations"]) {
    assert.equal((await pool.query("SELECT to_regclass($1) AS name", [`public.${table}`])).rows[0].name, null);
  }
});

test("status lists pending assets without creating schema on an empty database", async (t) => {
  const { pool, connectionString } = await withDatabase(t);
  const { stdout } = await runCli(connectionString, ["status"]);
  assert.match(stdout, /0 applied, 11 pending/);
  const { rows } = await pool.query("SELECT to_regclass('public.schema_migrations') AS table_name");
  assert.equal(rows[0].table_name, null);
});

test("production CLI initializes auth and documents, repeats safely, and exits", async (t) => {
  const { pool, connectionString } = await withDatabase(t);
  const first = await runCli(connectionString, ["run"]);
  assert.match(first.stdout, /Applied 11 new migration/);
  assert.doesNotMatch(first.stdout, /Server listening|WebSocket server initialized/);
  for (const table of ["user", "session", "account", "verification", "documents", "document_members", "document_suggestions"]) {
    const { rows } = await pool.query("SELECT to_regclass($1) AS table_name", [`public.${table}`]);
    assert.ok(rows[0].table_name, `${table} exists`);
  }
  const before = (await pool.query("SELECT * FROM schema_migrations ORDER BY filename")).rows;
  const second = await runCli(connectionString, ["run"], true);
  assert.match(second.stdout, /Applied 0 new migration/);
  assert.deepEqual((await pool.query("SELECT * FROM schema_migrations ORDER BY filename")).rows, before);
  const source = await runCli(connectionString, ["status"], true);
  assert.match(source.stdout, /11 applied, 0 pending/);
});

test("concurrent processes coordinate auth and application migrations", async (t) => {
  const { pool, connectionString } = await withDatabase(t);
  const results = await Promise.allSettled([runCli(connectionString, ["run"]), runCli(connectionString, ["run"])]);
  for (const result of results) {
    if (result.status === "rejected") {
      throw result.reason;
    }
  }
  const { rows } = await pool.query("SELECT COUNT(*)::int AS count FROM schema_migrations");
  assert.equal(rows[0].count, 11);
});

test("a failed migration rolls back DDL and tracking, then retries without repeating earlier files", async (t) => {
  const { pool } = await withDatabase(t);
  const directory = await withFiles(t, {
    "001_first.sql": "CREATE TABLE kept (id integer); INSERT INTO kept VALUES (1);",
    "002_second.sql": "CREATE TABLE rolled_back (id integer); SELECT missing_column;"
  });
  const runner = createMigrationRunner(pool, { directory });
  await assert.rejects(runner.run(), /Migration failed: 002_second.sql/);
  assert.equal((await pool.query("SELECT to_regclass('rolled_back') AS name")).rows[0].name, null);
  assert.equal((await runner.status()).filter((item) => item.appliedAt).length, 1);
  await fs.writeFile(path.join(directory, "002_second.sql"), "CREATE TABLE rolled_back (id integer);");
  assert.equal(await runner.run(), 1);
  assert.equal((await pool.query("SELECT COUNT(*)::int AS count FROM kept")).rows[0].count, 1);
});

test("failure to record a migration also rolls back its schema changes", async (t) => {
  const { pool } = await withDatabase(t);
  const directory = await withFiles(t, { "001_first.sql": "CREATE TABLE atomic_change (id integer);" });
  await pool.query(`
    CREATE TABLE schema_migrations (filename text PRIMARY KEY, applied_at timestamptz DEFAULT NOW());
    CREATE FUNCTION reject_tracking() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'tracking unavailable'; END;
    $$;
    CREATE TRIGGER reject_tracking BEFORE INSERT ON schema_migrations
      FOR EACH ROW EXECUTE FUNCTION reject_tracking();
  `);
  const runner = createMigrationRunner(pool, { directory });
  await assert.rejects(runner.run(), /Migration failed/);
  assert.equal((await pool.query("SELECT to_regclass('atomic_change') AS name")).rows[0].name, null);
  assert.equal((await pool.query("SELECT COUNT(*)::int AS count FROM schema_migrations")).rows[0].count, 0);
  await pool.query("DROP TRIGGER reject_tracking ON schema_migrations");
  assert.equal(await runner.run(), 1);
});

test("missing, empty, or invalid assets fail before auth initialization or schema changes", async (t) => {
  const { pool } = await withDatabase(t);
  const directory = await withFiles(t, {});
  let initialized = false;
  const initializeAuth = async () => { initialized = true; };
  await assert.rejects(createMigrationRunner(pool, { directory, initializeAuth }).run(), /No SQL migration/);
  await assert.rejects(createMigrationRunner(pool, {
    directory: path.join(directory, "absent"), initializeAuth
  }).run(), /ENOENT/);
  await fs.writeFile(path.join(directory, "001_first.sql"), "SELECT 1");
  const runner = createMigrationRunner(pool, { directory, initializeAuth });
  await assert.rejects(runner.run("../outside.sql"), /Unknown migration/);
  assert.equal(initialized, false);
  assert.equal((await pool.query("SELECT to_regclass('schema_migrations') AS name")).rows[0].name, null);
});

test("upgrade preserves existing documents, memberships, and migration timestamps", async (t) => {
  const { pool, connectionString } = await withDatabase(t);
  const filenames = (await fs.readdir(migrationsDirectory)).filter((name) => name.endsWith(".sql")).sort();
  const directory = await withFiles(t, Object.fromEntries(await Promise.all(
    filenames.slice(0, 5).map(async (name) => [name, await fs.readFile(path.join(migrationsDirectory, name), "utf8")])
  )));
  await createMigrationRunner(pool, { directory }).run();
  await pool.query(`
    INSERT INTO documents (id, title, content, owner_id, workspace_id)
      VALUES ('preserved', 'Earlier document', '{"type":"doc","content":[]}', 'owner', 'default');
    INSERT INTO document_members (document_id, user_id, role) VALUES ('preserved', 'owner', 'owner');
  `);
  const before = (await pool.query("SELECT * FROM schema_migrations ORDER BY filename")).rows;
  await runCli(connectionString, ["run"]);
  assert.equal((await pool.query("SELECT title FROM documents WHERE id = 'preserved'")).rows[0].title, "Earlier document");
  assert.equal((await pool.query("SELECT role FROM document_members WHERE document_id = 'preserved'")).rows[0].role, "owner");
  assert.deepEqual((await pool.query("SELECT * FROM schema_migrations ORDER BY filename LIMIT 5")).rows, before);
  assert.equal((await pool.query("SELECT revision FROM documents LIMIT 1")).rows[0].revision, 0);
  assert.equal((await pool.query("SELECT COUNT(*)::int AS count FROM schema_migrations")).rows[0].count, 11);
});

test("targeted runs include prerequisites and reject arbitrary paths", async (t) => {
  const { pool } = await withDatabase(t);
  const directory = await withFiles(t, {
    "001_first.sql": "CREATE TABLE prerequisites (id integer);",
    "002_second.sql": "INSERT INTO prerequisites VALUES (2);",
    "003_third.sql": "INSERT INTO prerequisites VALUES (3);"
  });
  const runner = createMigrationRunner(pool, { directory });
  assert.equal(await runner.run("002_second.sql"), 2);
  assert.deepEqual((await pool.query("SELECT id FROM prerequisites")).rows, [{ id: 2 }]);
  assert.equal((await runner.status()).filter((item) => item.appliedAt).length, 2);
});
