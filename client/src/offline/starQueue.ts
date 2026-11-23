import { createOfflineQueue } from "./offlineQueue";
import { getOfflineAccount, isCurrentAccount, verifyOfflineSession, type OfflineAccount } from "./accountScope";
import { getDocumentRecord } from "./indexedDb";

const queue = createOfflineQueue();
const flights = new Map<OfflineAccount, Promise<void>>();
export const enqueueStarToggle = (documentId: string, workspaceId: string, isStarred: boolean) =>
  queue.enqueue({ documentId, workspaceId, payload: { type: "star_set", isStarred } });

export const flushStarQueue = (
  handler: (entry: { documentId: string; workspaceId: string; isStarred: boolean }) => Promise<void>
) => {
  const account = getOfflineAccount();
  const run = async () => {
    if (!isCurrentAccount(account)) return;
    const items = (await queue.list(account)).filter((item) => {
      const payload = item.payload as { type?: string };
      return payload?.type === "star_set" || payload?.type === "star_toggle";
    });
    if (!items.length || !await verifyOfflineSession(account)) return;
    const grouped = new Map<string, typeof items>();
    for (const item of items) grouped.set(item.documentId, [...(grouped.get(item.documentId) ?? []), item]);
    for (const entries of grouped.values()) {
      if (!isCurrentAccount(account)) return;
      const latest = entries[entries.length - 1];
      const payload = latest.payload as { isStarred?: boolean };
      const desired = payload.isStarred ?? (await getDocumentRecord(latest.documentId, account))?.isStarred;
      if (typeof desired !== "boolean") continue;
      await handler({ documentId: latest.documentId, workspaceId: latest.workspaceId ?? "default", isStarred: desired });
      if (!isCurrentAccount(account)) return;
      for (const entry of entries) await queue.remove(entry.id, account);
    }
  };
  const next = (flights.get(account) ?? Promise.resolve()).catch(() => {}).then(run);
  flights.set(account, next);
  return next.finally(() => { if (flights.get(account) === next) flights.delete(account); });
};
