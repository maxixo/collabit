import type { DocumentDetail, TipTapContent } from "../services/document.service";
import { fetchDocumentById, updateDocument, mergeDocument, DocumentRequestError } from "../services/document.service";
import { getOfflineAccount, isCurrentAccount, verifyOfflineSession, type OfflineAccount } from "./accountScope";
import { createOfflineQueue, type OfflineQueueItem } from "./offlineQueue";
import { replaceDocumentOperation, updateOperationIfPresent, discardDocumentOperation, saveServerDocument } from "./indexedDb";
import { collapseDocumentQueueEntries, hasDocumentConflict, type DocumentQueuePayload } from "./documentQueue.helpers";

type SyncState = { status: "pending" | "conflict" | "blocked"; server?: DocumentDetail; message?: string };
export type DocumentQueueItem = OfflineQueueItem & { workspaceId: string; payload: DocumentQueuePayload & { sync?: SyncState } };
export type QueueStatusEvent = {
  documentId: string; status: "queued" | "syncing" | "saved" | "conflict" | "error";
  document?: DocumentDetail; server?: DocumentDetail; message?: string; operationId?: string;
  local?: { title: string; content: TipTapContent; updatedAtClient: string };
};
const queue = createOfflineQueue();
const EVENT = "document-queue-status";
const flights = new Map<OfflineAccount, Promise<void>>();
const acknowledgedBases = new WeakMap<OfflineAccount, Map<string, { from: string | null; to: string; revision?: number }>>();
const isDocument = (item: OfflineQueueItem): item is DocumentQueueItem => {
  const payload = item.payload as Partial<DocumentQueuePayload> | null;
  return typeof item.workspaceId === "string" && payload?.type === "document_update" &&
    payload.operation === "update_title_content" && typeof payload.title === "string" && Boolean(payload.content);
};
const emit = (event: QueueStatusEvent, account: OfflineAccount) => {
  if (isCurrentAccount(account) && typeof window !== "undefined") window.dispatchEvent(new CustomEvent(EVENT, { detail: event }));
};
const local = (entry: DocumentQueueItem) => ({
  title: entry.payload.title, content: entry.payload.content, updatedAtClient: entry.payload.updatedAtClient
});
const emitStored = (entry: DocumentQueueItem, account: OfflineAccount) => {
  const sync = entry.payload.sync;
  emit({
    documentId: entry.documentId, operationId: entry.id,
    status: sync?.status === "conflict" ? "conflict" : sync?.status === "blocked" ? "error" : "queued",
    local: local(entry), server: sync?.server, message: sync?.message
  }, account);
};
export const subscribeToDocumentQueue = (handler: (event: QueueStatusEvent) => void) => {
  const account = getOfflineAccount();
  const listener = (event: Event) => { if (isCurrentAccount(account)) handler((event as CustomEvent<QueueStatusEvent>).detail); };
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
};
export const getQueuedDocumentUpdate = async (documentId: string, account = getOfflineAccount()) =>
  (await queue.list(account)).filter(isDocument).filter((item) => item.documentId === documentId)
    .sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;
export const listQueuedDocumentUpdates = async (account = getOfflineAccount()) =>
  (await queue.list(account)).filter(isDocument);

export const enqueueDocumentUpdate = async (input: {
  documentId: string; workspaceId: string; title: string; content: TipTapContent;
  updatedAtClient: string; baseUpdatedAt?: string | null; shareToken?: string;
  baseRevision?: number;
  yjsUpdate?: number[];
}, account = getOfflineAccount()) => {
  const acknowledged = acknowledgedBases.get(account)?.get(input.documentId);
  const baseUpdatedAt = acknowledged && acknowledged.from === (input.baseUpdatedAt ?? null)
    ? acknowledged.to : input.baseUpdatedAt ?? null;
  const entry: DocumentQueueItem = {
    id: crypto.randomUUID(), documentId: input.documentId, workspaceId: input.workspaceId, createdAt: Date.now(),
    payload: {
      type: "document_update", operation: "update_title_content", title: input.title, content: input.content,
      updatedAtClient: input.updatedAtClient, baseUpdatedAt, shareToken: input.shareToken,
      baseRevision: acknowledged && acknowledged.from === (input.baseUpdatedAt ?? null) ? acknowledged.revision : input.baseRevision,
      yjsUpdate: input.yjsUpdate
    }
  };
  const persisted = await replaceDocumentOperation(entry, account) as DocumentQueueItem;
  emitStored(persisted, account);
  return persisted;
};
export const discardQueuedDocument = async (documentId: string, expectedId?: string, account = getOfflineAccount()) => {
  const entry = await getQueuedDocumentUpdate(documentId, account);
  if (entry && expectedId && entry.id !== expectedId)
    throw new Error("Your draft changed. Review the latest copy before discarding it.");
  if (entry && !await discardDocumentOperation(entry.id, account))
    throw new Error("Your draft changed. Review the latest copy before discarding it.");
};
export const retryQueuedDocument = async (documentId: string, account = getOfflineAccount()) => {
  const entry = await getQueuedDocumentUpdate(documentId, account);
  if (entry) {
    await updateOperationIfPresent({ ...entry, payload: { ...entry.payload, sync: { status: "pending" } } }, account);
    await flushDocumentQueue(account);
  }
};
const replay = async (account: OfflineAccount) => {
  if (!isCurrentAccount(account)) return;
  const items = (await queue.list(account)).filter(isDocument);
  const pending = collapseDocumentQueueEntries(items).filter((entry) => !entry.payload.sync || entry.payload.sync.status === "pending");
  if (!pending.length) return;
  try { if (!await verifyOfflineSession(account)) return; }
  catch { return; }
  for (const entry of pending) {
    if (!isCurrentAccount(account)) return;
    emit({ documentId: entry.documentId, status: "syncing" }, account);
    try {
      // Historical drafts can adopt a revision only when their known base still matches.
      if (!entry.payload.yjsUpdate && entry.payload.baseRevision === undefined) {
        const server = await fetchDocumentById(entry.documentId, entry.workspaceId, { shareToken: entry.payload.shareToken, cache: false, account });
        if (!server) throw new DocumentRequestError("Document not found. Your local draft is retained.", 404);
        if (!entry.payload.baseUpdatedAt || hasDocumentConflict(entry.payload, server)) {
          const conflict: DocumentQueueItem = { ...entry, payload: { ...entry.payload, sync: { status: "conflict", server } } };
          if (await updateOperationIfPresent(conflict, account)) emitStored(conflict, account);
          continue;
        }
        if (server.revision === undefined) throw new DocumentRequestError("Reload after the server upgrade. Draft retained.", 428);
        entry.payload.baseRevision = server.revision;
        await updateOperationIfPresent(entry, account);
      }
      const document = entry.payload.yjsUpdate
        ? await mergeDocument(entry.documentId, entry.workspaceId, entry.payload.yjsUpdate, { shareToken: entry.payload.shareToken, account })
        : await updateDocument({
        id: entry.documentId, workspaceId: entry.workspaceId, title: entry.payload.title, content: entry.payload.content,
        expectedRevision: entry.payload.baseRevision!, mutationId: entry.id
      }, { shareToken: entry.payload.shareToken, account });
      if (!isCurrentAccount(account)) return;
      let bases = acknowledgedBases.get(account);
      if (!bases) { bases = new Map(); acknowledgedBases.set(account, bases); }
      bases.set(entry.documentId, { from: entry.payload.baseUpdatedAt ?? null, to: document.updatedAt, revision: document.revision });
      // Remove only the acknowledged generation, never a newer edit queued during the request.
      for (const previous of items.filter((item) => item.documentId === entry.documentId && item.workspaceId === entry.workspaceId))
        await queue.remove(previous.id, account);
      const newer = await getQueuedDocumentUpdate(entry.documentId, account);
      if (newer && newer.payload.baseUpdatedAt === entry.payload.baseUpdatedAt &&
        (!newer.payload.sync || newer.payload.sync.status === "pending")) {
        await updateOperationIfPresent({ ...newer, payload: { ...newer.payload, baseUpdatedAt: document.updatedAt, baseRevision: document.revision } }, account);
      }
      await saveServerDocument(document, account);
      emit({ documentId: entry.documentId, status: "saved", document, operationId: entry.id }, account);
    } catch (error) {
      if (!isCurrentAccount(account)) return;
      if (error instanceof DocumentRequestError && error.status === 409 && error.document) {
        const conflict: DocumentQueueItem = { ...entry, payload: { ...entry.payload, sync: { status: "conflict", server: error.document } } };
        if (await updateOperationIfPresent(conflict, account)) emitStored(conflict, account);
        continue;
      }
      const retryable = error instanceof TypeError || !navigator.onLine ||
        (error instanceof DocumentRequestError && (error.status >= 500 || error.status === 429));
      const failed: DocumentQueueItem = { ...entry, payload: { ...entry.payload, sync: {
        status: retryable ? "pending" : "blocked",
        message: error instanceof Error ? error.message : "Sync failed. Your local draft is retained."
      } } };
      await updateOperationIfPresent(failed, account);
      emit({ documentId: entry.documentId, status: "error", message: failed.payload.sync?.message }, account);
      if (retryable) break;
    }
  }
};
export const flushDocumentQueue = (account = getOfflineAccount()): Promise<void> => {
  const next = (flights.get(account) ?? Promise.resolve()).catch(() => {}).then(() => replay(account));
  flights.set(account, next);
  return next.finally(() => { if (flights.get(account) === next) flights.delete(account); });
};
