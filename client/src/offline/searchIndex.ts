import MiniSearch from "minisearch";
import type { DocumentState } from "../types";
import { getMeta, listDocumentsByWorkspace, setMeta } from "./indexedDb";
import { getTipTapText } from "../utils/tiptapContent";
import { debounce } from "../utils/debounce";

export type SearchResult = {
  id: string;
  title: string;
  workspaceId: string;
  updatedAt?: string;
  score: number;
};

type IndexableDocument = {
  id: string;
  title: string;
  workspaceId: string;
  updatedAt?: string;
  content?: DocumentState["content"] | unknown;
};

type IndexedDocument = {
  id: string;
  title: string;
  content: string;
  workspaceId: string;
  updatedAt?: string;
};

type SerializedIndex = ReturnType<MiniSearch<IndexedDocument>["toJSON"]>;

type StoredIndexSnapshot = {
  version: number;
  workspaceId: string;
  updatedAt: number;
  index: SerializedIndex | string;
};

const INDEX_VERSION = 1;
const INDEX_META_PREFIX = "search-index:";
const SEARCH_BOOST = { title: 2 };
const SAVE_DEBOUNCE_MS = 500;

const createIndex = () =>
  new MiniSearch<IndexedDocument>({
    fields: ["title", "content"],
    storeFields: ["title", "workspaceId", "updatedAt"],
    idField: "id"
  });

const indexCache = new Map<string, MiniSearch<IndexedDocument>>();
const lastIndexedContent = new Map<string, string>();
const persistQueue = new Map<string, ReturnType<typeof debounce>>();
const hydratedFromCache = new Set<string>();

const getIndexKey = (workspaceId: string) => `${INDEX_META_PREFIX}${workspaceId}`;
const serializeIndexSnapshot = (index: SerializedIndex | string) =>
  typeof index === "string" ? index : JSON.stringify(index);

const getIndex = async (workspaceId: string): Promise<MiniSearch<IndexedDocument>> => {
  if (indexCache.has(workspaceId)) {
    return indexCache.get(workspaceId)!;
  }

  let stored: StoredIndexSnapshot | null = null;
  try {
    const key = getIndexKey(workspaceId) as string;
    stored = await getMeta<StoredIndexSnapshot>(key);
  } catch {
    stored = null;
  }

  if (stored?.index && stored.version === INDEX_VERSION) {
    try {
      const restored = MiniSearch.loadJSON(serializeIndexSnapshot(stored.index), {
        fields: ["title", "content"],
        storeFields: ["title", "workspaceId", "updatedAt"],
        idField: "id"
      });
      indexCache.set(workspaceId, restored);
      return restored;
    } catch {
      // Fall back to a fresh index if the snapshot cannot be restored.
    }
  }

  const fresh = createIndex();
  indexCache.set(workspaceId, fresh);
  return fresh;
};

const persistIndex = async (workspaceId: string, index: MiniSearch<IndexedDocument>): Promise<void> => {
  const snapshot: StoredIndexSnapshot = {
    version: INDEX_VERSION,
    workspaceId,
    updatedAt: Date.now(),
    index: JSON.stringify(index.toJSON())
  };
  try {
    const key = getIndexKey(workspaceId) as string;
    await setMeta(key, snapshot);
  } catch {
    // Ignore IndexedDB failures to avoid blocking editor updates.
  }
};

const schedulePersist = (workspaceId: string, index: MiniSearch<IndexedDocument>) => {
  let schedule = persistQueue.get(workspaceId);
  if (!schedule) {
    schedule = debounce((nextIndex: unknown) => {
      void persistIndex(workspaceId, nextIndex as MiniSearch<IndexedDocument>);
    }, SAVE_DEBOUNCE_MS);
    persistQueue.set(workspaceId, schedule);
  }
  schedule(index);
};

const buildIndexEntry = (document: IndexableDocument): IndexedDocument => {
  const title = document.title?.trim() ?? "";
  const content = getTipTapText(document.content ?? "");
  return {
    id: document.id,
    title,
    content,
    workspaceId: document.workspaceId,
    updatedAt: document.updatedAt
  };
};

const makeDocumentKey = (workspaceId: string, documentId: string) => `${workspaceId}:${documentId}`;

export const indexDocument = async (document: IndexableDocument): Promise<void> => {
  // Validate required fields
  if (!document.workspaceId || !document.id) {
    console.warn("[SearchIndex] Skipping document: missing workspaceId or id", document);
    return;
  }

  try {
    const entry = buildIndexEntry(document);
    const contentKey = `${entry.title}\n${entry.content}`;
    const cacheKey = makeDocumentKey(entry.workspaceId, entry.id);
    
    // Skip if content hasn't changed
    if (lastIndexedContent.get(cacheKey) === contentKey) {
      return;
    }

    const index = await getIndex(entry.workspaceId);
    
    // Try to remove existing entry, but ignore if it doesn't exist
    const mutableIndex = index as MiniSearch<IndexedDocument> & {
      remove?: (doc: IndexedDocument | string) => void;
      removeAll?: (docs: Array<IndexedDocument | string>) => void;
      discard?: (docId: string) => void;
    };
    
    try {
      if (mutableIndex.remove) {
        mutableIndex.remove(entry.id);
      } else if (mutableIndex.removeAll) {
        mutableIndex.removeAll([entry.id]);
      } else if (mutableIndex.discard) {
        mutableIndex.discard(entry.id);
      }
    } catch {
      // Document might not exist in index yet, that's okay
    }
    
    // Add the new entry
    index.add(entry);
    lastIndexedContent.set(cacheKey, contentKey);
    schedulePersist(entry.workspaceId, index);
  } catch (error) {
    console.error("[SearchIndex] Failed to index document", error, document);
  }
};

const hydrateIndexFromCache = async (workspaceId: string): Promise<void> => {
  if (hydratedFromCache.has(workspaceId)) {
    return;
  }

  let documents: Awaited<ReturnType<typeof listDocumentsByWorkspace>> = [];
  try {
    documents = await listDocumentsByWorkspace(workspaceId);
  } catch {
    return;
  }

  hydratedFromCache.add(workspaceId);

  if (documents.length === 0) {
    return;
  }

  const index = await getIndex(workspaceId);
  const missingDocuments = documents.filter((doc) => !index.has(doc.id));
  if (missingDocuments.length === 0) {
    return;
  }

  await Promise.all(
    missingDocuments.map((doc) =>
      indexDocument({
        id: doc.id,
        title: doc.title ?? "",
        workspaceId: doc.workspaceId ?? workspaceId,
        updatedAt: doc.updatedAt,
        content: doc.content
      })
    )
  );
};

export const searchDocumentsLocal = async (workspaceId: string, query: string): Promise<SearchResult[]> => {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }

  await hydrateIndexFromCache(workspaceId);
  const index = await getIndex(workspaceId);
  const results = index.search(trimmed, {
    prefix: true,
    boost: SEARCH_BOOST
  }) as Array<{
    id: string;
    score: number;
    title?: string;
    workspaceId?: string;
    updatedAt?: string;
  }>;

  return results.map((result) => ({
    id: String(result.id),
    title: result.title ?? "",
    workspaceId: result.workspaceId ?? workspaceId,
    updatedAt: result.updatedAt,
    score: result.score
  }));
};
