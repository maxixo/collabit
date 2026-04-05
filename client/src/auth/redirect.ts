export const SHARE_REDIRECT_STORAGE_KEY = "share_redirect_path";

type ShareRedirectPayload = {
  path?: unknown;
};

export const normalizeRedirectPath = (value: string | null) => {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.startsWith("/") ? trimmed : null;
};

export const resolveRedirectFromState = (state: unknown) => {
  const from = (state as { from?: { pathname?: string; search?: string } } | null)?.from;
  if (!from?.pathname) {
    return null;
  }

  return `${from.pathname}${from.search ?? ""}`;
};

export const storeRedirectPath = (path: string) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    sessionStorage.setItem(SHARE_REDIRECT_STORAGE_KEY, JSON.stringify({ path }));
  } catch {
    // Ignore storage access errors.
  }
};

export const readRedirectPath = (): string | null => {
  if (typeof window === "undefined") {
    return null;
  }

  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(SHARE_REDIRECT_STORAGE_KEY);
  } catch {
    return null;
  }

  if (!raw) {
    return null;
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const payload = JSON.parse(trimmed) as ShareRedirectPayload;
    const path = typeof payload?.path === "string" ? payload.path.trim() : "";
    return path.startsWith("/") ? path : null;
  } catch {
    return trimmed.startsWith("/") ? trimmed : null;
  }
};

export const clearRedirectPath = () => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    sessionStorage.removeItem(SHARE_REDIRECT_STORAGE_KEY);
  } catch {
    // Ignore storage access errors.
  }
};
