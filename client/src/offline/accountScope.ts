export type OfflineAccount = Readonly<{ userId: string; signal: AbortSignal }>;
let current: OfflineAccount | null = null;
let controller: AbortController | null = null;
const listeners = new Set<() => void>();

export const setOfflineAccount = (userId: string | null) => {
  if (current?.userId === userId && !current.signal.aborted) return;
  controller?.abort();
  controller = userId ? new AbortController() : null;
  current = userId && controller ? { userId, signal: controller.signal } : null;
  listeners.forEach((listener) => listener());
};
export const getOfflineAccount = (): OfflineAccount => {
  if (!current) throw new DOMException("No authenticated offline account", "AbortError");
  return current;
};
export const isCurrentAccount = (account: OfflineAccount) => current === account && !account.signal.aborted;
export const assertCurrentAccount = (account: OfflineAccount) => {
  if (!isCurrentAccount(account)) throw new DOMException("Account changed", "AbortError");
};
export const subscribeToAccountChange = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
const responses = new WeakMap<Response, OfflineAccount>();
export const responseAccount = (response: Response) => {
  const account = responses.get(response);
  if (!account) throw new Error("Missing response account");
  assertCurrentAccount(account);
  return account;
};
export const accountFetch = async (input: RequestInfo | URL, init: RequestInit = {}, account = getOfflineAccount()) => {
  assertCurrentAccount(account);
  const headers = new Headers(init.headers);
  headers.set("x-expected-user-id", account.userId);
  const signal = init.signal ? AbortSignal.any([account.signal, init.signal]) : account.signal;
  const response = await fetch(input, { ...init, headers, signal, credentials: "include", cache: "no-store" });
  assertCurrentAccount(account);
  responses.set(response, account);
  return response;
};

export const verifyOfflineSession = async (account = getOfflineAccount()) => {
  const base = import.meta.env?.VITE_API_BASE_URL ?? "http://localhost:4000";
  const response = await accountFetch(base + "/api/auth/me", {}, account);
  if (!response.ok) return false;
  const payload = await response.json();
  assertCurrentAccount(account);
  return (payload?.user?.id ?? payload?.session?.userId) === account.userId;
};
