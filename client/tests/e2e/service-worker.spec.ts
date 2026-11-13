import { expect, test } from "@playwright/test";
import { APP_BASE_URL, createAuthenticatedPage, createDocumentViaApi, createParagraphDocument, getEditorRoot, openDocument, waitForEditorReady } from "./helpers/editor";

test("production worker controls deep links and cached identity remains offline-only", async ({ browser }) => {
  const owner = await createAuthenticatedPage(browser, "offline-worker", { serviceWorkers: "allow" });
  try {
    const doc = await createDocumentViaApi(owner.context.request, {
      title: "Offline worker fixture", content: createParagraphDocument("cached document body")
    });
    await openDocument(owner.page, doc.id);
    await expect(getEditorRoot(owner.page)).toContainText("cached document body");
    await owner.page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    const scriptUrl = await owner.page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      return registration.active?.scriptURL ?? "";
    });
    expect(scriptUrl).toContain("/service-worker.js");

    await owner.page.reload();
    await waitForEditorReady(owner.page);
    await expect(getEditorRoot(owner.page)).toContainText("cached document body");
    await owner.context.setOffline(true);
    await owner.page.reload();
    await expect(owner.page.getByRole("status")).toContainText("Offline mode");
    await expect(getEditorRoot(owner.page)).toContainText("cached document body");

    await owner.context.setOffline(false);
    await owner.page.goto(APP_BASE_URL);
    const response = await owner.context.request.get(`${APP_BASE_URL}/service-worker.js`);
    expect(response.ok()).toBeTruthy();
    expect(await response.text()).toContain("addEventListener(\"fetch\"");
  } finally { await owner.context.close(); }
});
