import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import {
  API_BASE_URL, createAuthenticatedPage, createDocumentViaApi, createParagraphDocument,
  getEditorRoot, openDocument, typeInEditor, waitForEditorReady
} from "./helpers/editor";

const drafts = async (page: Page) => {
  const session = await (await page.request.get(API_BASE_URL + "/api/auth/me")).json();
  return page.evaluate(async (userId: string) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("collab-editor:user:" + encodeURIComponent(userId));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<{ id: string; payload: { content: unknown; sync?: { status: string } } }[]>((resolve, reject) => {
        const request = database.transaction("operations").objectStore("operations").getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } finally { database.close(); }
  }, session.user.id);
};

for (const resolution of ["duplicate", "server"] as const) {
  test(`conflict survives reload and resolves through ${resolution}`, async ({ browser }) => {
    const owner = await createAuthenticatedPage(browser, "conflict-" + resolution);
    try {
      const doc = await createDocumentViaApi(owner.context.request, { title: "Conflict fixture", content: createParagraphDocument("original body") });
      await openDocument(owner.page, doc.id);
      await owner.context.setOffline(true);
      await typeInEditor(owner.page, " local draft");
      await expect.poll(async () => JSON.stringify(await drafts(owner.page))).toContain("local draft");
      const remote = await owner.context.request.patch(`${API_BASE_URL}/api/documents/${doc.id}?workspaceId=default`, {
        data: { title: "Remote title", content: createParagraphDocument("remote body"), expectedRevision: doc.revision, mutationId: crypto.randomUUID() }
      });
      expect(remote.ok(), await remote.text()).toBeTruthy();
      await owner.context.setOffline(false);
      const dialog = owner.page.getByRole("dialog", { name: "Resolve document conflict" });
      await expect(dialog).toBeVisible();
      await owner.page.reload();
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText("local draft");
      await expect(dialog).toContainText("remote body");
      const downloadEvent = owner.page.waitForEvent("download");
      await dialog.getByRole("button", { name: "Download Local Copy" }).click();
      const download = await downloadEvent;
      expect(await readFile((await download.path())!, "utf8")).toContain("local draft");
      expect(await drafts(owner.page)).toHaveLength(1);
      if (resolution === "duplicate") {
        // A rejected copy must leave the original draft recoverable.
        await owner.page.route("**/api/documents", async (route) => {
          if (route.request().method() === "POST") await route.fulfill({ status: 500, json: { message: "Copy failed" } });
          else await route.continue();
        });
        await dialog.getByRole("button", { name: "Duplicate Local Copy" }).click();
        await expect(owner.page.getByText("Export failed: Copy failed")).toBeVisible();
        expect(await drafts(owner.page)).toHaveLength(1);
        await owner.page.unroute("**/api/documents");
        await dialog.getByRole("button", { name: "Duplicate Local Copy" }).click();
        await owner.page.waitForURL((url) => url.pathname.startsWith("/editor/") && !url.pathname.endsWith(doc.id));
        await waitForEditorReady(owner.page);
        await expect(getEditorRoot(owner.page)).toContainText("local draft");
      } else {
        await dialog.getByRole("button", { name: "Reload Server Version" }).click();
        await expect(dialog).toHaveCount(0);
        await expect(getEditorRoot(owner.page)).toContainText("remote body");
        await expect(getEditorRoot(owner.page)).not.toContainText("local draft");
      }
      expect(await drafts(owner.page)).toHaveLength(0);
      const original = await (await owner.context.request.get(`${API_BASE_URL}/api/documents/${doc.id}?workspaceId=default`)).json();
      expect(JSON.stringify(original.document.content)).toContain("remote body");
    } finally { await owner.context.close(); }
  });
}

for (const status of [401, 403]) {
  test(`a rejected ${status} save is recoverable from profile after reload`, async ({ browser }) => {
    const owner = await createAuthenticatedPage(browser, "blocked-" + status);
    try {
      const doc = await createDocumentViaApi(owner.context.request, { title: "Retained draft", content: createParagraphDocument("original") });
      await openDocument(owner.page, doc.id);
      const pattern = "**/api/documents/" + doc.id + "?*";
      await owner.page.route(pattern, async (route) => {
        if (route.request().method() === "PATCH") await route.fulfill({ status, json: { message: "Access denied" } });
        else await route.continue();
      });
      await typeInEditor(owner.page, " retained work");
      await expect.poll(async () => (await drafts(owner.page))[0]?.payload.sync?.status).toBe("blocked");
      await owner.page.goto("/profile?workspaceId=default");
      const recovery = owner.page.getByRole("region", { name: "Local draft recovery" });
      await expect(recovery).toContainText("Retained draft");
      await owner.page.reload();
      await expect(recovery).toContainText("Access denied");
      await owner.page.unroute(pattern);
      await recovery.getByRole("button", { name: "Retry sync" }).click();
      await expect(recovery).toContainText("No pending local drafts.");
      await openDocument(owner.page, doc.id);
      await expect(getEditorRoot(owner.page)).toContainText("retained work");
    } finally { await owner.context.close(); }
  });
}

test("navigation before autosave debounce preserves the newest local edit", async ({ browser }) => {
  const owner = await createAuthenticatedPage(browser, "navigate-draft");
  try {
    const doc = await createDocumentViaApi(owner.context.request, { title: "Navigation draft", content: createParagraphDocument("original") });
    await openDocument(owner.page, doc.id);
    await typeInEditor(owner.page, " retained before debounce");
    await expect.poll(async () => JSON.stringify(await drafts(owner.page))).toContain("retained before debounce");
    await owner.page.goto("/profile?workspaceId=default");
    await expect.poll(async () => {
      const response = await owner.context.request.get(`${API_BASE_URL}/api/documents/${doc.id}?workspaceId=default`);
      return JSON.stringify((await response.json()).document.content);
    }).toContain("retained before debounce");
  } finally { await owner.context.close(); }
});
