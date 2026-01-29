import type { DocumentState } from "../types";

export type StoredDocument = Omit<DocumentState, "content"> & {
  content?: DocumentState["content"];
};

export type OfflineOperation = {
  id: string;
  documentId: string;
  workspaceId?: string;
  payload: unknown;
  createdAt: number;
};

type MetaRecord = {
  key: string;
  value: unknown;
  updatedAt: number;
};

const DB_NAME = "collab-editor";
const DB_VERSION = 3;
const DOCUMENT_STORE = "documents";
const OPERATIONS_STORE = "operations";
const META_STORE = "meta";

let dbPromise: Promise<IDBDatabase> | null = null;

const resolveRequest = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });

const runTransaction = async <T>(
  storeName: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> => {
  const db = await openEditorDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const request = run(store);
    let result: T;

    request.onsuccess = () => {
      result = request.result;
    };

    request.onerror = () => {
      reject(request.error ?? new Error("IndexedDB request failed"));
    };

    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
};

export const openEditorDb = (): Promise<IDBDatabase> => {
  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      const transaction = request.transaction;

      const documentsStore = db.objectStoreNames.contains(DOCUMENT_STORE)
        ? transaction!.objectStore(DOCUMENT_STORE)
        : db.createObjectStore(DOCUMENT_STORE, { keyPath: "id" });

      if (!documentsStore.indexNames.contains("by_workspace")) {
        documentsStore.createIndex("by_workspace", "workspaceId", { unique: false });
      }

      const operationsStore = db.objectStoreNames.contains(OPERATIONS_STORE)
        ? transaction!.objectStore(OPERATIONS_STORE)
        : db.createObjectStore(OPERATIONS_STORE, { keyPath: "id" });

      if (!operationsStore.indexNames.contains("by_created_at")) {
        operationsStore.createIndex("by_created_at", "createdAt", { unique: false });
      }

      if (!operationsStore.indexNames.contains("by_document")) {
        operationsStore.createIndex("by_document", "documentId", { unique: false });
      }

      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB error"));
  });

  return dbPromise;
};

export const saveDocument = async (document: StoredDocument): Promise<void> => {
  await runTransaction(DOCUMENT_STORE, "readwrite", (store) => store.put(document));
};

export const saveDocuments = async (documents: StoredDocument[]): Promise<void> => {
  const db = await openEditorDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(DOCUMENT_STORE, "readwrite");
    const store = tx.objectStore(DOCUMENT_STORE);

    documents.forEach((document) => {
      store.put(document);
    });

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
};

export const getDocument = async (id: string): Promise<DocumentState | null> => {
  const result = await runTransaction(DOCUMENT_STORE, "readonly", (store) => store.get(id));
  const document = result as StoredDocument | undefined;
  if (!document || !document.content) {
    return null;
  }
  return document as DocumentState;
};

export const getDocumentRecord = async (id: string): Promise<StoredDocument | null> => {
  const result = await runTransaction(DOCUMENT_STORE, "readonly", (store) => store.get(id));
  return (result as StoredDocument | undefined) ?? null;
};

export const updateCachedDocumentStar = async (
  id: string,
  isStarred: boolean,
  fallback?: StoredDocument
): Promise<void> => {
  try {
    const record = await getDocumentRecord(id);
    if (record) {
      await saveDocument({ ...record, isStarred });
      return;
    }
    if (fallback) {
      await saveDocument({ ...fallback, isStarred });
    }
  } catch {
    // Ignore IndexedDB failures to avoid blocking UI updates.
  }
};

export const listDocumentsByWorkspace = async (workspaceId: string): Promise<StoredDocument[]> => {
  const db = await openEditorDb();
  const tx = db.transaction(DOCUMENT_STORE, "readonly");
  const store = tx.objectStore(DOCUMENT_STORE);
  const index = store.index("by_workspace");
  const request = index.getAll(IDBKeyRange.only(workspaceId));
  const result = await resolveRequest(request);
  return Array.isArray(result) ? (result as StoredDocument[]) : [];
};

export const saveOperation = async (operation: OfflineOperation): Promise<void> => {
  await runTransaction(OPERATIONS_STORE, "readwrite", (store) => store.put(operation));
};

export const listOperations = async (): Promise<OfflineOperation[]> => {
  const operations = await runTransaction(OPERATIONS_STORE, "readonly", (store) => store.getAll());
  const list = Array.isArray(operations) ? (operations as OfflineOperation[]) : [];
  return list.sort((a, b) => a.createdAt - b.createdAt);
};

export const removeOperation = async (id: string): Promise<void> => {
  await runTransaction(OPERATIONS_STORE, "readwrite", (store) => store.delete(id));
};

export const clearOperations = async (): Promise<void> => {
  await runTransaction(OPERATIONS_STORE, "readwrite", (store) => store.clear());
};

export const setMeta = async (key: string, value: unknown): Promise<void> => {
  const record: MetaRecord = { key, value, updatedAt: Date.now() };
  await runTransaction(META_STORE, "readwrite", (store) => store.put(record));
};

export const getMeta = async <T = unknown>(key: string): Promise<T | null> => {
  const record = await runTransaction(META_STORE, "readonly", (store) => store.get(key));
  const entry = record as MetaRecord | undefined;
  return entry ? (entry.value as T) : null;
};
