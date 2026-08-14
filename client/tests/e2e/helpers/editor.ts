import { expect, type APIRequestContext, type Browser, type Page } from "@playwright/test";

type TestUser = {
  email: string;
  password: string;
  displayName: string;
};

type CreatedDocument = {
  id: string;
  title: string;
  updatedAt: string;
  ownerId: string;
  workspaceId: string;
  isStarred: boolean;
  content: Record<string, unknown>;
};

type ShareToken = {
  token: string;
};

const uniqueSuffix = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export const WORKSPACE_ID = process.env.PLAYWRIGHT_WORKSPACE_ID ?? "default";
export const API_BASE_URL = process.env.PLAYWRIGHT_API_BASE_URL ?? "http://localhost:4000";
export const APP_BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173";

export const makeUser = (label: string): TestUser => {
  const suffix = uniqueSuffix();
  return {
    email: `${label}-${suffix}@example.com`,
    password: `Pass-${suffix}!`,
    displayName: `${label} ${suffix.slice(0, 6)}`
  };
};

export const createParagraphDocument = (text = ""): Record<string, unknown> => ({
  type: "doc",
  content: [
    text
      ? {
          type: "paragraph",
          content: [{ type: "text", text }]
        }
      : {
          type: "paragraph"
        }
  ]
});

export const signUpViaApi = async (request: APIRequestContext, user: TestUser) => {
  const response = await request.post(`${API_BASE_URL}/api/auth/signup`, {
    data: {
      displayName: user.displayName,
      email: user.email,
      password: user.password
    }
  });

  expect(response.ok(), await response.text()).toBeTruthy();
};

export const createDocumentViaApi = async (
  request: APIRequestContext,
  options: { title: string; content?: Record<string, unknown>; workspaceId?: string }
) => {
  const response = await request.post(`${API_BASE_URL}/api/documents`, {
    data: {
      title: options.title,
      content: options.content ?? createParagraphDocument(),
      workspaceId: options.workspaceId ?? WORKSPACE_ID
    }
  });

  expect(response.ok(), await response.text()).toBeTruthy();
  const payload = (await response.json()) as { document: CreatedDocument };
  return payload.document;
};

export const createShareTokenViaApi = async (
  request: APIRequestContext,
  documentId: string,
  options?: { permission?: "viewer" | "editor"; workspaceId?: string }
) => {
  const workspaceId = options?.workspaceId ?? WORKSPACE_ID;
  const response = await request.post(
    `${API_BASE_URL}/api/documents/${encodeURIComponent(documentId)}/share?workspaceId=${encodeURIComponent(workspaceId)}`,
    {
      data: {
        permission: options?.permission ?? "editor"
      }
    }
  );

  expect(response.ok(), await response.text()).toBeTruthy();
  const payload = (await response.json()) as { shareToken: ShareToken };
  return payload.shareToken;
};

export const buildShareUrl = (documentId: string, token: string, workspaceId = WORKSPACE_ID) => {
  const params = new URLSearchParams({
    share: "true",
    collab: "true",
    token,
    workspaceId
  });
  return `${APP_BASE_URL}/editor/${encodeURIComponent(documentId)}?${params.toString()}`;
};

export const openWorkspace = async (page: Page, workspaceId = WORKSPACE_ID) => {
  await page.goto(`/editor/recent?workspaceId=${encodeURIComponent(workspaceId)}`);
  await expect(page.getByTestId("create-document-button")).toBeVisible();
};

export const openDocument = async (page: Page, documentId: string, workspaceId = WORKSPACE_ID) => {
  await page.goto(`/editor/${encodeURIComponent(documentId)}?workspaceId=${encodeURIComponent(workspaceId)}`);
  await waitForEditorReady(page);
};

export const waitForEditorReady = async (page: Page) => {
  await expect(page.getByTestId("editor-surface")).toBeVisible();
  await expect(page.getByTestId("editor-title-input")).toBeVisible();
  await expect(getEditorRoot(page)).toBeVisible();
};

export const getEditorRoot = (page: Page) =>
  page.locator('[data-testid="editor-content"] .ProseMirror').first();

export const typeInEditor = async (page: Page, text: string) => {
  const editor = getEditorRoot(page);
  await editor.click();
  await page.keyboard.type(text, { delay: 20 });
};

export const assertNoUnexpectedSuggestionArtifacts = async (page: Page) => {
  const root = page.locator("body");
  await expect(root.locator(".suggestion-decoration-delete-widget")).toHaveCount(0);
  await expect(root.locator(".suggestion-decoration-delete")).toHaveCount(0);
  await expect(root.locator(".suggestion-mark-pending")).toHaveCount(0);
  await expect(root.locator(".suggestion-mark-accepted")).toHaveCount(0);
  await expect(root.locator(".suggestion-mark-rejected")).toHaveCount(0);
  await expect(root.locator("[data-suggestion-id]")).toHaveCount(0);
};

export const expectNoCrashScreen = async (page: Page) => {
  await expect(page.getByText("Unexpected Application Error!")).toHaveCount(0);
  await expect(page.getByText("Cannot read properties of null")).toHaveCount(0);
};

export const createAuthenticatedPage = async (browser: Browser, label: string) => {
  const context = await browser.newContext();
  const user = makeUser(label);
  await signUpViaApi(context.request, user);
  const page = await context.newPage();
  await openWorkspace(page);
  return { context, page, user };
};
