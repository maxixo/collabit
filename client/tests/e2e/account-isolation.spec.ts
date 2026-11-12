import { expect, test, type Page } from '@playwright/test';
import { API_BASE_URL, createAuthenticatedPage, createDocumentViaApi, createParagraphDocument, makeUser, openDocument, signUpViaApi, typeInEditor } from './helpers/editor';

const operations = (page: Page, userId: string) => page.evaluate(async (id) => {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('collab-editor:user:' + encodeURIComponent(id));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    if (!database.objectStoreNames.contains('operations')) return [];
    return await new Promise<unknown[]>((resolve, reject) => {
      const request = database.transaction('operations', 'readonly').objectStore('operations').getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally { database.close(); }
}, userId);

test('account switching preserves A drafts without exposing or replaying them as B', async ({ browser }) => {
  const owner = await createAuthenticatedPage(browser, 'account-a');
  try {
    const accountA = (await (await owner.context.request.get(`${API_BASE_URL}/api/auth/me`)).json()).user.id as string;
    const doc = await createDocumentViaApi(owner.context.request, { title: 'A private draft', content: createParagraphDocument('Original body') });
    await openDocument(owner.page, doc.id);
    await expect(owner.page.locator('.ProseMirror')).toContainText('Original body');
    await owner.context.setOffline(true);
    await typeInEditor(owner.page, ' offline A work');
    await expect.poll(async () => (await operations(owner.page, accountA)).length).toBe(1);
    await owner.context.request.post(`${API_BASE_URL}/api/auth/logout`);
    await signUpViaApi(owner.context.request, makeUser('account-b'));
    const accountB = (await (await owner.context.request.get(`${API_BASE_URL}/api/auth/me`)).json()).user.id as string;
    await owner.context.setOffline(false);
    await owner.page.goto('/editor/recent?workspaceId=default');
    await expect(owner.page.getByTestId('create-document-button')).toBeVisible();
    await expect(owner.page.getByRole('link', { name: 'Open A private draft' })).toHaveCount(0);
    expect(await operations(owner.page, accountB)).toHaveLength(0);
    expect(await operations(owner.page, accountA)).toHaveLength(1);
    await owner.context.request.post(`${API_BASE_URL}/api/auth/logout`);
    await owner.context.request.post(`${API_BASE_URL}/api/auth/login`, { data: { email: owner.user.email, password: owner.user.password } });
    await owner.page.reload();
    await expect.poll(async () => {
      const response = await owner.context.request.get(`${API_BASE_URL}/api/documents/${doc.id}?workspaceId=default`);
      return JSON.stringify((await response.json()).document.content);
    }).toContain('offline A work');
  } finally { await owner.context.close(); }
});
