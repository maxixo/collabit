import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import * as Y from "yjs";
import { encoding, decoding } from "lib0";
import * as sync from "y-protocols/sync";
import { Pool } from "pg";

if (!process.env.DATABASE_URL || !/^\/mvp_stack_[a-f0-9]{32}$/.test(new URL(process.env.DATABASE_URL).pathname))
  throw new Error("Lifecycle tests require the disposable database owned by test:stack.");

const freePort = async () => new Promise<number>((resolve, reject) => {
  const listener = net.createServer();
  listener.once("error", reject);
  listener.listen(0, "127.0.0.1", () => {
    const address = listener.address();
    if (!address || typeof address === "string") { reject(new Error("No ephemeral port")); return; }
    listener.close((error) => error ? reject(error) : resolve(address.port));
  });
});

const waitReady = async (base: string, child: ChildProcess) => {
  for (let attempt = 0; attempt < 150; attempt++) {
    if (child.exitCode !== null) throw new Error(`API exited during startup (${child.exitCode})`);
    try { if ((await fetch(`${base}/ready`)).ok) return; } catch { /* Wait for startup. */ }
    await delay(100);
  }
  throw new Error("API readiness timed out");
};

const start = (serverPath: string, port: number, base: string) => spawn(process.execPath, [serverPath], {
  cwd: path.dirname(path.dirname(serverPath)),
  env: {
    ...process.env, NODE_ENV: "test", PORT: String(port), AUTH_BASE_URL: base,
    AUTH_SECRET: "lifecycle-test-secret-at-least-32-characters",
    JWT_SECRET: "lifecycle-test-jwt-at-least-32-characters",
    SHUTDOWN_TIMEOUT_MS: "5000"
  },
  stdio: ["ignore", "ignore", "ignore", "ipc"],
  windowsHide: true
});

const stop = async (child: ChildProcess) => {
  const exited = new Promise<number | null>((resolve) => child.once("exit", resolve));
  if (child.connected) child.send("shutdown");
  const result = await Promise.race([exited, delay(7000).then(() => "timeout" as const)]);
  assert.equal(result, 0, "graceful shutdown should complete before its deadline");
};

const asBytes = (raw: WebSocket.RawData) => raw instanceof ArrayBuffer
  ? new Uint8Array(raw)
  : Array.isArray(raw) ? new Uint8Array(Buffer.concat(raw)) : new Uint8Array(raw as Buffer);

test("shutdown drains an active collaboration socket and restart retains acknowledged edits", async () => {
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const serverPath = fileURLToPath(new URL("../dist/server.js", import.meta.url));
  let child = start(serverPath, port, base);
  let socket: WebSocket | undefined;
  try {
    await waitReady(base, child);
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const signup = await fetch(`${base}/api/auth/signup`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "Lifecycle test", email: `lifecycle-${suffix}@example.com`, password: `Pass-${suffix}!` })
    });
    assert.ok(signup.ok, await signup.text());
    const cookie = signup.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
    assert.ok(cookie, "signup should establish an authenticated session");
    const create = await fetch(`${base}/api/documents`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ title: "Shutdown recovery", workspaceId: "default", content: { type: "doc", content: [{ type: "paragraph" }] } })
    });
    if (!create.ok) throw new Error(await create.text());
    const { document } = await create.json() as { document: { id: string } };

    socket = new WebSocket(`ws://127.0.0.1:${port}/ws/${encodeURIComponent(document.id)}`, { headers: { Cookie: cookie } });
    let latestRevision = -1;
    let resolveRoomReady!: () => void;
    let resolveDurableUpdate!: () => void;
    const roomReady = new Promise<void>((resolve) => { resolveRoomReady = resolve; });
    const durableUpdate = new Promise<void>((resolve) => { resolveDurableUpdate = resolve; });
    socket.on("message", (raw) => {
      try {
        const decoder = decoding.createDecoder(asBytes(raw));
        if (decoding.readVarUint(decoder) !== 4) return;
        const data = JSON.parse(decoding.readVarString(decoder)) as { document?: { revision?: number } };
        if (!data.document || typeof data.document.revision !== "number") return;
        latestRevision = Math.max(latestRevision, data.document.revision);
        resolveRoomReady();
        if (latestRevision > 0) resolveDurableUpdate();
      } catch { /* Ignore non-durable or malformed collaboration frames. */ }
    });
    await new Promise<void>((resolve, reject) => {
      socket!.once("open", resolve);
      socket!.once("error", reject);
    });
    await Promise.race([roomReady, delay(5000).then(() => { throw new Error("server did not finish attaching the collaboration room"); })]);
    const liveDoc = new Y.Doc();
    const paragraph = new Y.XmlElement("paragraph");
    const text = new Y.XmlText();
    text.insert(0, "durable before shutdown");
    paragraph.insert(0, [text]);
    liveDoc.getXmlFragment("content").insert(0, [paragraph]);
    const acknowledgement = Promise.race([durableUpdate, delay(5000).then(() => { throw new Error("collaboration update was not durably acknowledged"); })]);
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, 0);
    sync.writeUpdate(encoder, Y.encodeStateAsUpdate(liveDoc));
    socket.send(encoding.toUint8Array(encoder));
    await acknowledgement;

    const close = new Promise<void>((resolve) => socket!.once("close", () => resolve()));
    await stop(child);
    await close;
    assert.equal((await fetch(`${base}/ready`).catch(() => null)), null, "listener should close after drain");
    child = start(serverPath, port, base);
    await waitReady(base, child);
    const read = await fetch(`${base}/api/documents/${encodeURIComponent(document.id)}?workspaceId=default`, { headers: { Cookie: cookie } });
    if (!read.ok) throw new Error(await read.text());
    assert.match(JSON.stringify(await read.json()), /durable before shutdown/);
    liveDoc.destroy();
  } finally {
    if (socket && socket.readyState < WebSocket.CLOSING) socket.terminate();
    if (child.exitCode === null && child.signalCode === null) {
      if (child.connected) child.send("shutdown");
      await Promise.race([new Promise((resolve) => child.once("exit", resolve)), delay(7000)]);
      if (child.exitCode === null && child.signalCode === null) child.kill();
    }
    if (child.connected) child.disconnect();
  }
});

test("a blocked database write cannot hang shutdown past its deadline", async () => {
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const serverPath = fileURLToPath(new URL("../dist/server.js", import.meta.url));
  const child = start(serverPath, port, base);
  const admin = new Pool({ connectionString: process.env.DATABASE_URL });
  let socket: WebSocket | undefined;
  let triggerName = "";
  let documentId = "";
  try {
    await waitReady(base, child);
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const signup = await fetch(`${base}/api/auth/signup`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "Shutdown timeout", email: `shutdown-${suffix}@example.com`, password: `Pass-${suffix}!` })
    });
    assert.ok(signup.ok, "test account should be created");
    const cookie = signup.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
    const create = await fetch(`${base}/api/documents`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ title: "Blocked write", workspaceId: "default", content: { type: "doc", content: [{ type: "paragraph" }] } })
    });
    if (!create.ok) throw new Error(await create.text());
    documentId = ((await create.json()) as { document: { id: string } }).document.id;
    triggerName = `mvp_shutdown_${suffix.replaceAll(/[^a-z0-9]/gi, "")}`;
    await admin.query(`CREATE FUNCTION ${triggerName}() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.id='${documentId}' THEN PERFORM pg_sleep(30); END IF; RETURN NEW; END $$;
      CREATE TRIGGER ${triggerName} BEFORE UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION ${triggerName}()`);

    socket = new WebSocket(`ws://127.0.0.1:${port}/ws/${encodeURIComponent(documentId)}`, { headers: { Cookie: cookie } });
    let resolveRoomReady!: () => void;
    const roomReady = new Promise<void>((resolve) => { resolveRoomReady = resolve; });
    socket.on("message", (raw) => {
      try {
        const decoder = decoding.createDecoder(asBytes(raw));
        if (decoding.readVarUint(decoder) === 4) resolveRoomReady();
      } catch { /* Ignore other frames. */ }
    });
    await new Promise<void>((resolve, reject) => { socket!.once("open", resolve); socket!.once("error", reject); });
    await Promise.race([roomReady, delay(5000).then(() => { throw new Error("room attach timed out"); })]);
    const draft = new Y.Doc();
    const paragraph = new Y.XmlElement("paragraph");
    paragraph.insert(0, [new Y.XmlText("write intentionally blocked")]);
    draft.getXmlFragment("content").insert(0, [paragraph]);
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, 0);
    sync.writeUpdate(encoder, Y.encodeStateAsUpdate(draft));
    socket.send(encoding.toUint8Array(encoder));

    let writeStarted = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      const result = await admin.query(`SELECT 1 FROM pg_stat_activity WHERE datname=current_database()
        AND pid<>pg_backend_pid() AND state='active' AND query LIKE 'UPDATE documents SET content%'`);
      if (result.rowCount) { writeStarted = true; break; }
      await delay(25);
    }
    assert.equal(writeStarted, true, "the database trigger should hold the document write in flight");
    const exited = new Promise<number | null>((resolve) => child.once("exit", resolve));
    child.send("shutdown");
    assert.equal(await Promise.race([exited, delay(8000).then(() => "timeout" as const)]), 1,
      "the bounded shutdown timer should fail the process instead of hanging or reporting success");
    draft.destroy();
  } finally {
    if (socket && socket.readyState < WebSocket.CLOSING) socket.terminate();
    if (child.exitCode === null && child.signalCode === null) child.kill();
    if (triggerName) {
      await admin.query(`DROP TRIGGER IF EXISTS ${triggerName} ON documents`).catch(() => {});
      await admin.query(`DROP FUNCTION IF EXISTS ${triggerName}()`).catch(() => {});
    }
    await admin.end();
    if (child.connected) child.disconnect();
  }
});
