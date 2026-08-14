import { expect, test } from "@playwright/test";
import {
  assertNoUnexpectedSuggestionArtifacts,
  buildShareUrl,
  createAuthenticatedPage,
  createDocumentViaApi,
  createParagraphDocument,
  createShareTokenViaApi,
  expectNoCrashScreen,
  getEditorRoot,
  openDocument,
  typeInEditor,
  waitForEditorReady
} from "./helpers/editor";

test.describe("editor regressions", () => {
  test("creating a new document resets old editor content", async ({ browser }) => {
    const owner = await createAuthenticatedPage(browser, "owner-reset");

    try {
      const seededDocument = await createDocumentViaApi(owner.context.request, {
        title: "Seeded source",
        content: createParagraphDocument("legacy content that must clear")
      });

      await openDocument(owner.page, seededDocument.id);
      await expect(getEditorRoot(owner.page)).toContainText("legacy content that must clear");

      await owner.page.getByTestId("create-document-button").click();
      await owner.page.waitForURL(/\/editor\/[^?]+\?workspaceId=/);
      await waitForEditorReady(owner.page);

      await expect(owner.page.getByTestId("editor-title-input")).toHaveValue("");
      await expect(getEditorRoot(owner.page)).not.toContainText("legacy content that must clear");
      await assertNoUnexpectedSuggestionArtifacts(owner.page);

      await typeInEditor(owner.page, "fresh document");
      await expect(getEditorRoot(owner.page)).toContainText("fresh document");
      await assertNoUnexpectedSuggestionArtifacts(owner.page);
    } finally {
      await owner.context.close();
    }
  });

  test("normal typing does not leave red suggestion artifacts behind", async ({ browser }) => {
    const owner = await createAuthenticatedPage(browser, "owner-typing");

    try {
      await owner.page.getByTestId("create-document-button").click();
      await owner.page.waitForURL(/\/editor\/[^?]+\?workspaceId=/);
      await waitForEditorReady(owner.page);

      await typeInEditor(owner.page, "abcdef");
      await owner.page.keyboard.press("Backspace");
      await owner.page.keyboard.type("g", { delay: 20 });

      await expect(getEditorRoot(owner.page)).toContainText("abcdeg");
      await assertNoUnexpectedSuggestionArtifacts(owner.page);
    } finally {
      await owner.context.close();
    }
  });

  test("shared links load cleanly and do not contaminate a new document", async ({ browser }) => {
    const owner = await createAuthenticatedPage(browser, "owner-share");

    try {
      const sharedDocument = await createDocumentViaApi(owner.context.request, {
        title: "Shared seed",
        content: createParagraphDocument("shared content")
      });
      const shareToken = await createShareTokenViaApi(owner.context.request, sharedDocument.id, {
        permission: "editor"
      });

      const collaborator = await createAuthenticatedPage(browser, "collaborator-share");

      try {
        await collaborator.page.goto(buildShareUrl(sharedDocument.id, shareToken.token));
        await waitForEditorReady(collaborator.page);

        await expectNoCrashScreen(collaborator.page);
        await expect(getEditorRoot(collaborator.page)).toContainText("shared content");
        await assertNoUnexpectedSuggestionArtifacts(collaborator.page);

        await collaborator.page.getByTestId("create-document-button").click();
        await collaborator.page.waitForURL(/\/editor\/[^?]+\?workspaceId=/);
        await waitForEditorReady(collaborator.page);
        await assertNoUnexpectedSuggestionArtifacts(collaborator.page);

        await typeInEditor(collaborator.page, "after share");
        await expect(getEditorRoot(collaborator.page)).toContainText("after share");
        await assertNoUnexpectedSuggestionArtifacts(collaborator.page);
      } finally {
        await collaborator.context.close();
      }
    } finally {
      await owner.context.close();
    }
  });
});
