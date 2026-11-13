import { expect, test } from "@playwright/test";
import { API_BASE_URL, createDocumentViaApi, makeUser, signUpViaApi } from "./helpers/editor";

test("HTTP mutation guards reject stale writers and replay successful requests once", async ({ request }) => {
  await signUpViaApi(request, makeUser("revisions"));
  const doc = await createDocumentViaApi(request, { title: "Original" });
  const url = API_BASE_URL + "/api/documents/" + doc.id + "?workspaceId=default";
  expect((await request.patch(url, { data: { title: "Unguarded" } })).status()).toBe(428);
  const requests = [
    { title: "First", expectedRevision: 0, mutationId: crypto.randomUUID() },
    { title: "Second", expectedRevision: 0, mutationId: crypto.randomUUID() }
  ];
  const responses = await Promise.all(requests.map((data) => request.patch(url, { data })));
  expect(responses.map((r) => r.status()).sort()).toEqual([200, 409]);
  const winning = responses.findIndex((r) => r.ok());
  const accepted = await responses[winning].json();
  const repeated = await request.patch(url, { data: requests[winning] });
  expect(await repeated.json()).toEqual(accepted);
  const rejected = await responses[1 - winning].json();
  expect(rejected.document.revision).toBe(1);
  const saveUrl = API_BASE_URL + "/api/documents/" + doc.id + "/save?workspaceId=default";
  const save = { expectedRevision: 1, mutationId: crypto.randomUUID(), title: "Version" };
  const firstSave = await request.post(saveUrl, { data: save });
  expect(firstSave.ok(), await firstSave.text()).toBeTruthy();
  expect(await (await request.post(saveUrl, { data: save })).json()).toEqual(await firstSave.json());
  const history = await (await request.get(API_BASE_URL + "/api/documents/" + doc.id + "/history?workspaceId=default")).json();
  expect(history.versions).toHaveLength(1);
  const restoreUrl = API_BASE_URL + "/api/documents/" + doc.id + "/restore?workspaceId=default";
  expect((await request.post(restoreUrl, { data: { versionNumber: 1, expectedRevision: 1, mutationId: crypto.randomUUID() } })).status()).toBe(409);
  expect((await (await request.get(url)).json()).document.title).toBe("Version");
});

test("repeated desired star requests preserve the requested state", async ({ request }) => {
  await signUpViaApi(request, makeUser("star-retry"));
  const doc = await createDocumentViaApi(request, { title: "Star retry" });
  const url = API_BASE_URL + "/api/documents/" + doc.id + "/star?workspaceId=default";
  for (const isStarred of [true, true, false, false]) {
    const response = await request.patch(url, { data: { isStarred } });
    expect(response.ok(), await response.text()).toBeTruthy();
    expect((await response.json()).isStarred).toBe(isStarred);
  }
  expect((await request.patch(url)).status()).toBe(400);
});
