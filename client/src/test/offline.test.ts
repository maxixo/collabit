import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { setOfflineAccount, getOfflineAccount, accountFetch, isCurrentAccount } from "../offline/accountScope";
import { saveDocument, saveServerDocument, getDocument, listDocumentsByWorkspace, saveOperation, listOperations, exportLegacyDrafts, setMeta, getMeta } from "../offline/indexedDb";
import { enqueueDocumentUpdate, flushDocumentQueue, getQueuedDocumentUpdate, retryQueuedDocument, discardQueuedDocument } from "../offline/documentQueue";
import type { DocumentDetail } from "../services/document.service";
import { enqueueStarToggle, flushStarQueue } from "../offline/starQueue";
import { indexDocument, searchDocumentsLocal } from "../offline/searchIndex";

afterEach(() => setOfflineAccount(null));
const document = { id: 'shared-id', title: 'Account A draft', content: { type: 'doc', content: [] }, ownerId: 'a', workspaceId: 'default', updatedAt: '2026-01-01', isStarred: false };

test('cached documents, queues and metadata belong to the signed-in account', async () => {
  setOfflineAccount('isolation-a');
  await saveDocument(document);
  await setMeta('search-index', { owner: 'A' });
  await saveOperation({ id: 'operation-a', documentId: document.id, workspaceId: 'default', payload: { type: 'star_toggle' }, createdAt: 1 });
  setOfflineAccount('isolation-b');
  assert.equal(await getDocument(document.id), null);
  assert.deepEqual(await listDocumentsByWorkspace('default'), []);
  assert.deepEqual(await listOperations(), []);
  assert.equal(await getMeta('search-index'), null);
  let replayed = false;
  await flushStarQueue(async () => { replayed = true; });
  assert.equal(replayed, false);
  setOfflineAccount('isolation-a');
  assert.deepEqual(await getMeta('search-index'), { owner: 'A' });
  assert.equal((await getDocument(document.id))?.title, document.title);
  assert.equal((await listOperations()).length, 1);
});

test('account transitions cancel old requests and prevent late responses', async () => {
  setOfflineAccount('late-a');
  const account = getOfflineAccount();
  const originalFetch = globalThis.fetch;
  let finish!: (response: Response) => void;
  globalThis.fetch = async (_input, init) => {
    assert.equal(new Headers(init?.headers).get('x-expected-user-id'), 'late-a');
    return new Promise((resolve) => { finish = resolve; });
  };
  try {
    const request = accountFetch('http://localhost/private');
    setOfflineAccount('late-b');
    assert.equal(account.signal.aborted, true);
    assert.equal(isCurrentAccount(account), false);
    finish(Response.json({ private: 'A only' }));
    await assert.rejects(request, { name: 'AbortError' });
  } finally { globalThis.fetch = originalFetch; }
});

test('local search does not reuse another account\'s in-memory index', async () => {
  setOfflineAccount('search-a');
  await saveDocument({ ...document, title: 'privateneedle' });
  await indexDocument({ ...document, title: 'privateneedle' });
  assert.equal((await searchDocumentsLocal('default', 'privateneedle')).length, 1);
  setOfflineAccount('search-b');
  assert.deepEqual(await searchDocumentsLocal('default', 'privateneedle'), []);
});

test('writes already captured for A cannot land in B after an account switch', async () => {
  setOfflineAccount('captured-a');
  const account = getOfflineAccount();
  const pending = saveDocument(document, account);
  setOfflineAccount('captured-b');
  await pending;
  assert.equal(await getDocument(document.id), null);
  setOfflineAccount('captured-a');
  assert.equal((await getDocument(document.id))?.title, document.title);
});

test('legacy unscoped drafts are preserved only as an explicit unassigned export', async () => {
  const legacy = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('collab-editor', 3);
    request.onupgradeneeded = () => request.result.createObjectStore('operations', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await new Promise<void>((resolve) => {
    const tx = legacy.transaction('operations', 'readwrite');
    tx.objectStore('operations').put({ id: 'unknown-owner', payload: { body: 'old work' } });
    tx.oncomplete = () => resolve();
  });
  legacy.close();
  setOfflineAccount('legacy-next-login');
  assert.deepEqual(await listOperations(), []);
  const exported = await exportLegacyDrafts();
  assert.equal(exported?.unassigned, true);
  assert.equal(exported?.operations.length, 1);
  assert.deepEqual(await listOperations(), []);
});

const body = (text: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
const draftInput = (text = "local work") => ({
  documentId: document.id, workspaceId: "default", title: "Local title", content: body(text),
  updatedAtClient: "2026-01-02", baseUpdatedAt: document.updatedAt, baseRevision: 0
});
const withQueue = async (id: string, run: (server: { document: DocumentDetail; respond?: typeof fetch; patches: number }) => Promise<void>) => {
  setOfflineAccount(id);
  const originalFetch = globalThis.fetch;
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const onlineDescriptor = Object.getOwnPropertyDescriptor(navigator, "onLine");
  Object.defineProperty(globalThis, "window", { configurable: true, value: new EventTarget() });
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  const server: { document: DocumentDetail; respond?: typeof fetch; patches: number } = { document: { ...document, content: body("original"), revision: 0 }, patches: 0 };
  globalThis.fetch = async (input, init) => {
    if (String(input).endsWith("/api/auth/me")) return Response.json({ user: { id } });
    if (server.respond) return server.respond(input, init);
    if (init?.method === "PATCH") {
      if (JSON.parse(String(init.body)).expectedRevision !== server.document.revision)
        return Response.json({ message: "Conflict", document: server.document }, { status: 409 });
      server.patches++;
      server.document = { ...server.document, ...JSON.parse(String(init.body)), revision: (server.document.revision ?? 0) + 1, updatedAt: "2026-01-03" };
      return Response.json({ document: server.document });
    }
    return Response.json({ document: server.document, accessRole: "owner" });
  };
  try { await run(server); }
  finally {
    globalThis.fetch = originalFetch;
    if (windowDescriptor) Object.defineProperty(globalThis, "window", windowDescriptor);
    else Reflect.deleteProperty(globalThis, "window");
    if (onlineDescriptor) Object.defineProperty(navigator, "onLine", onlineDescriptor);
    else Reflect.deleteProperty(navigator, "onLine");
  }
};

test("conflicts retain local and server copies across account reloads and reads", async () => withQueue("conflict-owner", async (server) => {
  await saveDocument({ ...document, title: "Local title", content: body("local work") });
  await enqueueDocumentUpdate(draftInput());
  server.document = { ...server.document, title: "Remote title", content: body("remote work"), updatedAt: "2026-01-02", revision: 1 };
  await flushDocumentQueue();
  await saveServerDocument(server.document);
  assert.equal((await getDocument(document.id))?.title, "Local title");
  const conflict = await getQueuedDocumentUpdate(document.id);
  assert.equal(conflict?.payload.sync?.status, "conflict");
  assert.deepEqual(conflict?.payload.sync?.server?.content, body("remote work"));
  setOfflineAccount(null);
  setOfflineAccount("conflict-owner");
  assert.deepEqual((await getQueuedDocumentUpdate(document.id))?.payload.content, body("local work"));
  await flushDocumentQueue();
  assert.equal(server.patches, 0);
  const edited = await enqueueDocumentUpdate({ ...draftInput("more local work"), baseUpdatedAt: "2026-01-02" });
  assert.equal(edited.payload.baseUpdatedAt, document.updatedAt);
  assert.equal(edited.payload.sync?.status, "conflict");
  await assert.rejects(discardQueuedDocument(document.id, conflict!.id), /draft changed/);
  assert.ok(await getQueuedDocumentUpdate(document.id));
  await discardQueuedDocument(document.id, edited.id);
  assert.equal(await getQueuedDocumentUpdate(document.id), null);
  assert.equal(await getDocument(document.id), null);
}));

for (const status of [401, 403]) {
  test(`HTTP ${status} retains a blocked draft until explicit retry succeeds`, async () => withQueue("rejected-" + status, async (server) => {
    await enqueueDocumentUpdate(draftInput());
    let requests = 0;
    server.respond = async () => { requests++; return Response.json({ message: "Access denied" }, { status }); };
    await flushDocumentQueue();
    const rejected = await getQueuedDocumentUpdate(document.id);
    assert.equal(rejected?.payload.sync?.status, "blocked");
    assert.deepEqual(rejected?.payload.content, body("local work"));
    await flushDocumentQueue();
    assert.equal(requests, 1);
    server.respond = undefined;
    await retryQueuedDocument(document.id);
    assert.equal(await getQueuedDocumentUpdate(document.id), null);
    assert.deepEqual(server.document.content, body("local work"));
  }));
}

test("a transient outage retains the draft and a later replay acknowledges it", async () => withQueue("outage-owner", async (server) => {
  await enqueueDocumentUpdate(draftInput());
  server.respond = async () => { throw new TypeError("Network unavailable"); };
  await flushDocumentQueue();
  assert.equal((await getQueuedDocumentUpdate(document.id))?.payload.sync?.status, "pending");
  server.respond = undefined;
  await flushDocumentQueue();
  assert.equal(await getQueuedDocumentUpdate(document.id), null);
  assert.deepEqual((await getDocument(document.id))?.content, body("local work"));
}));

test("acknowledging an older save preserves edits queued during the request", async () => withQueue("generation-owner", async (server) => {
  const first = await enqueueDocumentUpdate(draftInput("first edit"));
  let release!: () => void;
  let started!: () => void;
  const reachedPatch = new Promise<void>((resolve) => { started = resolve; });
  const released = new Promise<void>((resolve) => { release = resolve; });
  server.respond = async (_input, init) => {
    if (init?.method === "PATCH") {
      started(); await released;
      server.document = { ...server.document, content: body("first edit"), updatedAt: "2026-01-03", revision: 1 };
    }
    return Response.json({ document: server.document, accessRole: "owner" });
  };
  const saving = flushDocumentQueue();
  await reachedPatch;
  const newer = await enqueueDocumentUpdate(draftInput("newer edit"));
  assert.notEqual(first.id, newer.id);
  release(); await saving;
  const retained = await getQueuedDocumentUpdate(document.id);
  assert.equal(retained?.id, newer.id);
  assert.deepEqual(retained?.payload.content, body("newer edit"));
  assert.equal(retained?.payload.baseUpdatedAt, "2026-01-03");
  server.respond = undefined;
  await flushDocumentQueue();
  assert.equal(await getQueuedDocumentUpdate(document.id), null);
  assert.deepEqual(server.document.content, body("newer edit"));
}));

test("a document replay reuses its mutation identity after a lost response", async () => withQueue("lost-response", async (server) => {
  await enqueueDocumentUpdate(draftInput());
  const identities: string[] = [];
  server.respond = async (_input, init) => {
    const payload = JSON.parse(String(init?.body));
    identities.push(payload.mutationId);
    if (identities.length === 1) {
      server.document = { ...server.document, title: payload.title, content: payload.content, revision: 1 };
      throw new TypeError("Response lost after commit");
    }
    return Response.json({ document: server.document });
  };
  await flushDocumentQueue();
  assert.ok(await getQueuedDocumentUpdate(document.id));
  await flushDocumentQueue();
  assert.equal(identities.length, 2);
  assert.equal(identities[0], identities[1]);
  assert.equal(await getQueuedDocumentUpdate(document.id), null);
}));

test("star replay serializes concurrent flushes and retains a newer desired state", async () => withQueue("star-generations", async () => {
  await enqueueStarToggle(document.id, "default", true);
  let release!: () => void; let started!: () => void;
  const entered = new Promise<void>((resolve) => { started = resolve; });
  const delayed = new Promise<void>((resolve) => { release = resolve; });
  const applied: boolean[] = [];
  const first = flushStarQueue(async (entry) => { applied.push(entry.isStarred); started(); await delayed; });
  await entered;
  await enqueueStarToggle(document.id, "default", false);
  const second = flushStarQueue(async (entry) => { applied.push(entry.isStarred); });
  release(); await Promise.all([first, second]);
  assert.deepEqual(applied, [true, false]);
  assert.deepEqual(await listOperations(), []);
}));
