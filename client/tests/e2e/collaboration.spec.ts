import { expect, test } from "@playwright/test";
import {
  API_BASE_URL, APP_BASE_URL, WORKSPACE_ID, buildShareUrl, createAuthenticatedPage,
  createDocumentViaApi, createParagraphDocument, createShareTokenViaApi,
  getEditorRoot, typeInEditor, waitForEditorReady
} from "./helpers/editor";

test("two live editors converge and the acknowledged collaboration state is durable", async ({ browser }) => {
  const owner = await createAuthenticatedPage(browser, "collaboration-owner");
  let collaborator: Awaited<ReturnType<typeof createAuthenticatedPage>> | undefined;
  try {
    const document = await createDocumentViaApi(owner.context.request, {
      title: "Live collaboration", content: createParagraphDocument("seed")
    });
    const share = await createShareTokenViaApi(owner.context.request, document.id, { permission: "editor" });
    collaborator = await createAuthenticatedPage(browser, "collaboration-editor");
    await owner.page.goto(`${APP_BASE_URL}/editor/${encodeURIComponent(document.id)}?workspaceId=${encodeURIComponent(WORKSPACE_ID)}&collab=true`);
    await waitForEditorReady(owner.page);
    await collaborator.page.goto(buildShareUrl(document.id, share.token));
    await waitForEditorReady(collaborator.page);

    await getEditorRoot(owner.page).press("End");
    await typeInEditor(owner.page, " from owner");
    await expect(getEditorRoot(collaborator.page)).toContainText("seed from owner");
    await getEditorRoot(collaborator.page).press("End");
    await typeInEditor(collaborator.page, " and collaborator");
    await expect(getEditorRoot(owner.page)).toContainText("seed from owner and collaborator");
    await expect(owner.page.getByTitle("Autosave status")).toContainText("Autosave: Saved");

    const response = await owner.context.request.get(`${API_BASE_URL}/api/documents/${encodeURIComponent(document.id)}?workspaceId=${encodeURIComponent(WORKSPACE_ID)}`);
    expect(response.ok(), await response.text()).toBeTruthy();
    expect(JSON.stringify(await response.json())).toContain("seed from owner and collaborator");
  } finally {
    await collaborator?.context.close();
    await owner.context.close();
  }
});
