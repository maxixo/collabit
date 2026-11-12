import { expect, test } from '@playwright/test';
import { API_BASE_URL, createDocumentViaApi, makeUser, signUpViaApi } from './helpers/editor';

test('authentication and document lifecycle use the real API and database', async ({ request }) => {
  expect((await request.get(`${API_BASE_URL}/api/documents?workspaceId=default`)).status()).toBe(401);
  const user = makeUser('api-smoke');
  await signUpViaApi(request, user);
  const created = await createDocumentViaApi(request, { title: 'API fixture' });
  const url = `${API_BASE_URL}/api/documents/${created.id}?workspaceId=default`;
  const update = await request.patch(url, { data: { title: 'Saved through API' } });
  expect(update.ok(), await update.text()).toBeTruthy();
  expect((await (await request.get(url)).json()).document.title).toBe('Saved through API');
  expect((await request.patch(`${API_BASE_URL}/api/documents/${created.id}/trash?workspaceId=default`)).ok()).toBeTruthy();
  expect((await request.patch(`${API_BASE_URL}/api/documents/${created.id}/restore?workspaceId=default`)).ok()).toBeTruthy();
  expect((await request.post(`${API_BASE_URL}/api/auth/logout`)).ok()).toBeTruthy();
  expect((await request.get(url)).status()).toBe(401);
  expect((await request.post(`${API_BASE_URL}/api/auth/login`, { data: { email: user.email, password: user.password } })).ok()).toBeTruthy();
  expect((await request.get(url)).ok()).toBeTruthy();
});

test('a second account cannot read a private document', async ({ playwright }) => {
  const owner = await playwright.request.newContext();
  const other = await playwright.request.newContext();
  try {
    await signUpViaApi(owner, makeUser('api-owner'));
    const document = await createDocumentViaApi(owner, { title: 'Private fixture' });
    await signUpViaApi(other, makeUser('api-other'));
    expect((await other.get(`${API_BASE_URL}/api/documents/${document.id}?workspaceId=default`)).status()).toBe(403);
  } finally { await owner.dispose(); await other.dispose(); }
});
