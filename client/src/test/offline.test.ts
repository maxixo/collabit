import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { setOfflineAccount, getOfflineAccount, accountFetch, isCurrentAccount } from "../offline/accountScope";
import { saveDocument, getDocument, listDocumentsByWorkspace, saveOperation, listOperations, exportLegacyDrafts, setMeta, getMeta } from "../offline/indexedDb";
import { flushStarQueue } from "../offline/starQueue";
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
