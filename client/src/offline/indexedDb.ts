import type { DocumentState } from "../types";
import { getOfflineAccount } from "./accountScope";

export type StoredDocument = Omit<DocumentState, "content"> & { content?: DocumentState["content"] };
export type OfflineOperation = { id: string; documentId: string; workspaceId?: string; payload: unknown; createdAt: number };
const databases = new Map<string, Promise<IDBDatabase>>();

export const accountDatabaseName = (userId: string) => "collab-editor:user:" + encodeURIComponent(userId);
export const openEditorDb = (account = getOfflineAccount()): Promise<IDBDatabase> => {
  const name = accountDatabaseName(account.userId);
  let pending = databases.get(name);
  if (!pending) {
    pending = new Promise((resolve, reject) => {
      const request = indexedDB.open(name, 3);
      request.onupgradeneeded = () => {
        const db = request.result;
        const documents = db.createObjectStore("documents", { keyPath: "id" });
        documents.createIndex("by_workspace", "workspaceId");
        const operations = db.createObjectStore("operations", { keyPath: "id" });
        operations.createIndex("by_created_at", "createdAt");
        operations.createIndex("by_document", "documentId");
        db.createObjectStore("meta", { keyPath: "key" });
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); databases.delete(name); };
        resolve(db);
      };
      request.onerror = () => { databases.delete(name); reject(request.error); };
    });
    databases.set(name, pending);
  }
  return pending;
};

export const transaction = async <T>(
  storeName: string, mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>, account = getOfflineAccount()
): Promise<T> => {
  const db = await openEditorDb(account);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    let request: IDBRequest<T>;
    try { request = action(tx.objectStore(storeName)); }
    catch (error) { tx.abort(); reject(error); return; }
    let result: T;
    request.onsuccess = () => { result = request.result; };
    tx.oncomplete = () => resolve(result);
    tx.onabort = tx.onerror = () => reject(tx.error ?? request.error ?? new Error("Local storage transaction failed"));
  });
};

export const saveDocument = async (document: StoredDocument, account = getOfflineAccount()) => {
  const existing = await getDocumentRecord(document.id, account);
  await transaction("documents", "readwrite", (store) => store.put({ ...existing, ...document }), account);
};
export const saveDocuments = async (documents: StoredDocument[], account = getOfflineAccount()) => {
  await Promise.all(documents.map((document) => saveDocument(document, account)));
};
export const getDocumentRecord = async (id: string, account = getOfflineAccount()): Promise<StoredDocument | null> =>
  (await transaction("documents", "readonly", (store) => store.get(id), account)) ?? null;
export const getDocument = async (id: string, account = getOfflineAccount()): Promise<DocumentState | null> => {
  const document = await getDocumentRecord(id, account);
  return document?.content ? document as DocumentState : null;
};
export const updateCachedDocumentStar = async (id: string, isStarred: boolean, fallback?: StoredDocument, account = getOfflineAccount()) => {
  const record = await getDocumentRecord(id, account);
  if (record || fallback) await saveDocument({ ...(record ?? fallback!), isStarred }, account);
};
export const listDocumentsByWorkspace = async (workspaceId: string, account = getOfflineAccount()): Promise<StoredDocument[]> =>
  transaction("documents", "readonly", (store) => store.index("by_workspace").getAll(IDBKeyRange.only(workspaceId)), account);
export const saveOperation = async (operation: OfflineOperation, account = getOfflineAccount()) => {
  await transaction("operations", "readwrite", (store) => store.put(operation), account);
};
export const listOperations = async (account = getOfflineAccount()): Promise<OfflineOperation[]> => {
  const items: OfflineOperation[] = await transaction("operations", "readonly", (store) => store.getAll(), account);
  return items.sort((a, b) => a.createdAt - b.createdAt);
};
export const removeOperation = async (id: string, account = getOfflineAccount()) => {
  await transaction("operations", "readwrite", (store) => store.delete(id), account);
};
export const clearOperations = async (account = getOfflineAccount()) => {
  await transaction("operations", "readwrite", (store) => store.clear(), account);
};
export const setMeta = async (key: string, value: unknown, account = getOfflineAccount()) => {
  await transaction("meta", "readwrite", (store) => store.put({ key, value, updatedAt: Date.now() }), account);
};
export const getMeta = async <T = unknown>(key: string, account = getOfflineAccount()): Promise<T | null> => {
  const record = await transaction("meta", "readonly", (store) => store.get(key), account);
  return record?.value ?? null;
};

// Never assign unscoped historical data to the next account that signs in.
export const exportLegacyDrafts = async () => {
  const known = await indexedDB.databases();
  if (!known.some((db) => db.name === "collab-editor")) return null;
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("collab-editor");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    const read = (name: string) => new Promise<unknown[]>((resolve, reject) => {
      if (!db.objectStoreNames.contains(name)) return resolve([]);
      const tx = db.transaction(name, "readonly");
      const request = tx.objectStore(name).getAll();
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = tx.onerror = () => reject(tx.error);
    });
    return { unassigned: true, documents: await read("documents"), operations: await read("operations") };
  } finally { db.close(); }
};
