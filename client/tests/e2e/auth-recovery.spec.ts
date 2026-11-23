import { expect, test } from "@playwright/test";
import { API_BASE_URL, createAuthenticatedPage } from "./helpers/editor";

test("unconfigured Google OAuth is not shown on authentication screens", async ({ page, request }) => {
  const providers = await request.get(`${API_BASE_URL}/api/auth/providers`);
  expect(providers.ok()).toBeTruthy();
  expect(await providers.json()).toEqual({ google: false });

  await page.goto("/auth/sign-in");
  await expect(page.getByRole("button", { name: "Sign in with Google" })).toHaveCount(0);
  await page.goto("/auth/sign-up");
  await expect(page.getByRole("button", { name: "Sign up with Google" })).toHaveCount(0);
});

test("password recovery is private, single-use, and invalidates existing sessions", async ({ browser }) => {
  const account = await createAuthenticatedPage(browser, "password-reset");
  try {
    const unknownEmail = `missing-${Date.now()}@example.com`;
    const unknownRequest = await account.context.request.post(`${API_BASE_URL}/api/auth/password/request`, {
      data: { email: unknownEmail }
    });
    const knownRequest = await account.context.request.post(`${API_BASE_URL}/api/auth/password/request`, {
      data: { email: account.user.email }
    });
    expect(unknownRequest.status()).toBe(202);
    expect(knownRequest.status()).toBe(202);
    expect(await unknownRequest.json()).toEqual(await knownRequest.json());

    const invalidToken = await account.context.request.post(`${API_BASE_URL}/api/auth/password/reset`, {
      data: { token: "not-a-valid-reset-token", newPassword: "New-Password-123!" }
    });
    expect(invalidToken.status()).toBe(400);

    const mailbox = await account.context.request.get(
      `${API_BASE_URL}/api/auth/__test/reset-email?to=${encodeURIComponent(account.user.email)}`
    );
    expect(mailbox.ok()).toBeTruthy();
    const email = await mailbox.json() as { url: string };
    await account.page.goto(email.url);
    await expect(account.page).toHaveURL(/\/auth\/reset-password\?token=/);
    await account.page.getByLabel("New password", { exact: true }).fill("Changed-Password-123!");
    await account.page.getByLabel("Confirm new password", { exact: true }).fill("Changed-Password-123!");
    await account.page.getByRole("button", { name: "Update password" }).click();
    await expect(account.page.getByRole("status")).toContainText("Password updated");

    const oldSession = await account.context.request.get(`${API_BASE_URL}/api/auth/me`);
    expect(await oldSession.json()).toBeNull();
    const oldPassword = await account.context.request.post(`${API_BASE_URL}/api/auth/login`, {
      data: { email: account.user.email, password: account.user.password }
    });
    expect(oldPassword.status()).toBe(401);
    const newPassword = await account.context.request.post(`${API_BASE_URL}/api/auth/login`, {
      data: { email: account.user.email, password: "Changed-Password-123!" }
    });
    expect(newPassword.ok()).toBeTruthy();

    const reusedToken = new URL(email.url).pathname.split("/").at(-1);
    const replay = await account.context.request.post(`${API_BASE_URL}/api/auth/password/reset`, {
      data: { token: reusedToken, newPassword: "Another-Password-123!" }
    });
    expect(replay.status()).toBe(400);
  } finally {
    await account.context.close();
  }
});
