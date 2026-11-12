import { clearOperations, listOperations, removeOperation, saveOperation, type OfflineOperation } from "./indexedDb";
import { getOfflineAccount, assertCurrentAccount } from "./accountScope";

export type OfflineQueueItem = OfflineOperation;
type EnqueueInput = Omit<OfflineQueueItem, "id" | "createdAt"> & { id?: string; createdAt?: number };
export const createOfflineQueue = () => ({
  enqueue: async (item: EnqueueInput, account = getOfflineAccount()): Promise<OfflineQueueItem> => {
    const entry = { ...item, id: item.id ?? crypto.randomUUID(), createdAt: item.createdAt ?? Date.now() };
    await saveOperation(entry, account);
    return entry;
  },
  list: (account = getOfflineAccount()) => listOperations(account),
  remove: (id: string, account = getOfflineAccount()) => removeOperation(id, account),
  clear: (account = getOfflineAccount()) => clearOperations(account),
  size: async (account = getOfflineAccount()) => (await listOperations(account)).length,
  dequeue: async (account = getOfflineAccount()) => {
    const item = (await listOperations(account))[0];
    if (item) await removeOperation(item.id, account);
    return item;
  },
  flush: async (handler: (item: OfflineQueueItem) => Promise<void>, account = getOfflineAccount()) => {
    for (const item of await listOperations(account)) {
      assertCurrentAccount(account);
      await handler(item);
      assertCurrentAccount(account);
      await removeOperation(item.id, account);
    }
  }
});
