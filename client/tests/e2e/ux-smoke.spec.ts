import { expect, test } from "@playwright/test";
import { APP_BASE_URL, createAuthenticatedPage, createDocumentViaApi, createParagraphDocument, openDocument, waitForEditorReady } from "./helpers/editor";

test("policy drafts and not-found routes are reachable", async ({ page }) => {
  await page.goto(`${APP_BASE_URL}/privacy`);
  await expect(page.getByRole("heading", { name: "Privacy notice draft" })).toBeVisible();
  await expect(page.getByText("Operator review required.")).toBeVisible();
  await page.goto(`${APP_BASE_URL}/terms`);
  await expect(page.getByRole("heading", { name: "Terms of service draft" })).toBeVisible();
  await page.goto(`${APP_BASE_URL}/no-such-page`);
  await expect(page.getByRole("heading", { name: "That page is not here" })).toBeVisible();
});

test("mobile editor navigation works and share/history dialogs support Escape", async ({ browser }) => {
  const owner = await createAuthenticatedPage(browser, "mobile-ux");
  try {
    await owner.page.setViewportSize({ width: 390, height: 844 });
    const recentUrl = owner.page.url();
    await owner.page.getByRole("navigation", { name: "Workspace navigation" }).getByRole("button", { name: "New document" }).click();
    await owner.page.waitForURL((url) => url.href !== recentUrl);
    await waitForEditorReady(owner.page);
    await expect(owner.page.getByTestId("editor-title-input")).toHaveValue("Untitled document");

    const doc = await createDocumentViaApi(owner.context.request, {
      title: "Mobile viewport fixture", content: createParagraphDocument("mobile editing works")
    });
    await openDocument(owner.page, doc.id);
    await waitForEditorReady(owner.page);
    await expect(owner.page.getByRole("navigation", { name: "Mobile document navigation" })).toBeVisible();
    await expect(owner.page.getByText("mobile editing works")).toBeVisible();

    const shareButton = owner.page.getByTestId("open-share-modal-button");
    await shareButton.click();
    const shareDialog = owner.page.getByRole("dialog", { name: "Share this document" });
    await expect(shareDialog).toBeVisible();
    await owner.page.keyboard.press("Escape");
    await expect(shareDialog).toHaveCount(0);
    await expect(shareButton).toBeFocused();

    const historyButton = owner.page.getByRole("button", { name: "Open document history" });
    await historyButton.click();
    const historyDialog = owner.page.getByRole("dialog", { name: "Document history" });
    await expect(historyDialog).toBeVisible();
    await owner.page.keyboard.press("Escape");
    await expect(historyDialog).toHaveCount(0);
    await expect(historyButton).toBeFocused();

    const oldUrl = owner.page.url();
    await owner.page.getByRole("button", { name: "New document" }).click();
    await owner.page.waitForURL((url) => url.href !== oldUrl);
    await waitForEditorReady(owner.page);
    await expect(owner.page.getByTestId("editor-title-input")).toHaveValue("Untitled document");
  } finally {
    await owner.context.close();
  }
});
