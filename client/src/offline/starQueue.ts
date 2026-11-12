import { createOfflineQueue, type OfflineQueueItem } from "./offlineQueue";
import { getOfflineAccount, isCurrentAccount, verifyOfflineSession } from "./accountScope";

const STAR_QUEUE_TYPE = "star_toggle";

type StarQueuePayload = {
  type: typeof STAR_QUEUE_TYPE;
};

const queue = createOfflineQueue();

const isStarQueueItem = (item: OfflineQueueItem): item is OfflineQueueItem & { payload: StarQueuePayload } => {
  const payload = item.payload as Partial<StarQueuePayload> | null;
  return payload?.type === STAR_QUEUE_TYPE;
};

export const enqueueStarToggle = async (documentId: string, workspaceId: string) => {
  return queue.enqueue({
    documentId,
    workspaceId,
    payload: { type: STAR_QUEUE_TYPE }
  });
};

export const flushStarQueue = async (
  handler: (entry: { documentId: string; workspaceId: string }) => Promise<void>
) => {
  const account = getOfflineAccount();
  const items = await queue.list(account);
  const starItems = items.filter(isStarQueueItem);
  if (!starItems.length || !await verifyOfflineSession(account)) return;
  const grouped = new Map<string, { documentId: string; workspaceId: string; ids: string[] }>();

  for (const item of starItems) {
    const workspaceId = item.workspaceId ?? "default";
    const key = `${workspaceId}:${item.documentId}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.ids.push(item.id);
    } else {
      grouped.set(key, { documentId: item.documentId, workspaceId, ids: [item.id] });
    }
  }

  for (const entry of grouped.values()) {
    if (!isCurrentAccount(account)) return;
    if (entry.ids.length % 2 === 1) {
      await handler({ documentId: entry.documentId, workspaceId: entry.workspaceId });
    }
    for (const id of entry.ids) {
      if (!isCurrentAccount(account)) return;
      await queue.remove(id, account);
    }
  }
};
