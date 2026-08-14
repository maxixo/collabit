import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DocumentState } from "../types";
import { fetchDocumentById, updateDocument } from "../services/document.service";
import { saveDocument as cacheDocument } from "../offline/indexedDb";
import { indexDocument } from "../offline/searchIndex";
import {
  enqueueDocumentUpdate,
  getQueuedDocumentUpdate,
  subscribeToDocumentQueue
} from "../offline/documentQueue";
import { debounce } from "../utils/debounce";
import { sanitizeTipTapContent } from "../utils/tiptapContent";

const DEFAULT_AUTOSAVE_MS = 1200;

export type SaveStatus =
  | "idle"
  | "offline"
  | "queued"
  | "syncing"
  | "saved"
  | "error"
  | "conflict";

export type DocumentConflictState = {
  local: {
    title: string;
    content: DocumentState["content"];
    updatedAt: string;
  };
  server: DocumentState;
};

const isConnectivityError = (error: unknown) => {
  return error instanceof TypeError || !navigator.onLine;
};

const toDocumentState = <T extends { content: Record<string, unknown> }>(document: T) => {
  return {
    ...document,
    content: sanitizeTipTapContent(document.content) as DocumentState["content"]
  };
};

const applyQueuedDraft = (
  document: DocumentState,
  queued: Awaited<ReturnType<typeof getQueuedDocumentUpdate>>
) => {
  if (!queued) {
    return document;
  }

  return {
    ...document,
    title: queued.payload.title,
    content: sanitizeTipTapContent(queued.payload.content) as DocumentState["content"],
    updatedAt: queued.payload.updatedAtClient
  };
};

export const useDocument = (
  documentId?: string,
  workspaceId?: string,
  options?: { shareToken?: string }
) => {
  const [document, setDocument] = useState<DocumentState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [accessRole, setAccessRole] = useState<"viewer" | "editor" | "owner" | null>(null);
  const [conflictState, setConflictState] = useState<DocumentConflictState | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const saveCounterRef = useRef(0);
  const pendingSaveRef = useRef(0);
  const currentDocumentIdRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastSyncedDocumentRef = useRef<DocumentState | null>(null);
  const shareToken = options?.shareToken;

  const queueDocumentUpdate = useCallback(
    async (next: DocumentState, saveId: number) => {
      if (!documentId || !workspaceId) {
        return;
      }

      await enqueueDocumentUpdate({
        documentId,
        workspaceId,
        title: next.title,
        content: next.content,
        updatedAtClient: next.updatedAt,
        baseUpdatedAt: lastSyncedDocumentRef.current?.updatedAt ?? null,
        shareToken
      });

      if (pendingSaveRef.current === saveId) {
        setSaveStatus(navigator.onLine ? "queued" : "offline");
        setSaveError(null);
      }
    },
    [documentId, shareToken, workspaceId]
  );

  const persistDocument = useCallback(
    async (next: DocumentState, saveId: number) => {
      if (!documentId || !workspaceId) {
        return;
      }

      if (!navigator.onLine) {
        await queueDocumentUpdate(next, saveId);
        return;
      }

      try {
        const updated = await updateDocument(
          {
            id: documentId,
            workspaceId,
            title: next.title,
            content: next.content
          },
          { signal: abortControllerRef.current?.signal, shareToken }
        );

        const normalized = toDocumentState(updated);
        lastSyncedDocumentRef.current = normalized;

        if (pendingSaveRef.current === saveId) {
          setDocument((current) => {
            if (!current || current.id !== normalized.id) {
              return normalized;
            }

            return {
              ...current,
              title: normalized.title,
              content: normalized.content,
              updatedAt: normalized.updatedAt,
              workspaceId: normalized.workspaceId,
              ownerId: normalized.ownerId,
              isStarred: normalized.isStarred,
              accessRole: current.accessRole ?? normalized.accessRole
            };
          });
          setSaveStatus("saved");
          setSaveError(null);
          setConflictState(null);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }

        if (isConnectivityError(err)) {
          await queueDocumentUpdate(next, saveId);
          return;
        }

        if (pendingSaveRef.current === saveId) {
          setSaveStatus("error");
          setSaveError(err instanceof Error ? err.message : "Failed to save document");
        }
      }
    },
    [documentId, queueDocumentUpdate, shareToken, workspaceId]
  );

  const debouncedPersist = useMemo(() => {
    return debounce((next: DocumentState, saveId: number) => {
      void persistDocument(next, saveId);
    }, DEFAULT_AUTOSAVE_MS);
  }, [persistDocument]);

  const debouncedIndexUpdate = useMemo(() => {
    return debounce((next: DocumentState) => {
      void indexDocument(next);
    }, DEFAULT_AUTOSAVE_MS);
  }, []);

  const cancelPendingSave = useCallback(() => {
    debouncedPersist.cancel?.();
    debouncedIndexUpdate.cancel?.();
    pendingSaveRef.current = 0;
  }, [debouncedIndexUpdate, debouncedPersist]);

  useEffect(() => {
    let isMounted = true;
    const previousDocumentId = currentDocumentIdRef.current;
    const nextDocumentId = documentId ?? null;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const nextController = new AbortController();
    abortControllerRef.current = nextController;
    currentDocumentIdRef.current = nextDocumentId;
    lastSyncedDocumentRef.current = null;

    setSaveStatus("idle");
    setSaveError(null);
    setAccessRole(null);
    setConflictState(null);
    saveCounterRef.current = 0;
    pendingSaveRef.current = 0;
    cancelPendingSave();

    if (previousDocumentId !== nextDocumentId) {
      setDocument(null);
    }

    const loadDocument = async () => {
      if (!documentId || (!workspaceId && !shareToken)) {
        if (isMounted) {
          setDocument(null);
          setLoading(false);
          setError(null);
        }
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const result = await fetchDocumentById(documentId, workspaceId, {
          signal: nextController.signal,
          shareToken
        });
        if (!isMounted) {
          return;
        }

        if (!result) {
          setDocument(null);
          setAccessRole(null);
          setError("Document not found");
          setLoading(false);
          return;
        }

        const nextDocument = toDocumentState(result);
        setAccessRole(result.accessRole ?? null);

        lastSyncedDocumentRef.current = nextDocument;

        const queuedDraft = await getQueuedDocumentUpdate(documentId);
        const hydratedDocument = applyQueuedDraft(nextDocument, queuedDraft);

        setDocument(hydratedDocument);
        if (queuedDraft) {
          setSaveStatus(navigator.onLine ? "queued" : "offline");
        }

        void cacheDocument(hydratedDocument).catch(() => undefined);
        void indexDocument(hydratedDocument);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Failed to load document");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void loadDocument();

    return () => {
      isMounted = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      cancelPendingSave();
    };
  }, [cancelPendingSave, documentId, reloadNonce, shareToken, workspaceId]);

  useEffect(() => {
    if (!documentId) {
      return;
    }

    return subscribeToDocumentQueue((event) => {
      if (event.documentId !== documentId) {
        return;
      }

      if (event.status === "queued") {
        setSaveStatus(navigator.onLine ? "queued" : "offline");
        setSaveError(null);
        return;
      }

      if (event.status === "syncing") {
        setSaveStatus("syncing");
        setSaveError(null);
        return;
      }

      if (event.status === "saved") {
        const normalized = toDocumentState(event.document);
        lastSyncedDocumentRef.current = normalized;
        setDocument((current) => {
          if (!current || current.id !== normalized.id) {
            return normalized;
          }

          return {
            ...current,
            title: normalized.title,
            content: normalized.content,
            updatedAt: normalized.updatedAt,
            workspaceId: normalized.workspaceId,
            ownerId: normalized.ownerId,
            isStarred: normalized.isStarred,
            accessRole: current.accessRole ?? normalized.accessRole
          };
        });
        setConflictState(null);
        setSaveStatus("saved");
        setSaveError(null);
        void cacheDocument(normalized).catch(() => undefined);
        void indexDocument(normalized);
        return;
      }

      if (event.status === "conflict") {
        setConflictState({
          local: {
            title: event.local.title,
            content: sanitizeTipTapContent(event.local.content) as DocumentState["content"],
            updatedAt: event.local.updatedAtClient
          },
          server: toDocumentState(event.server)
        });
        setSaveStatus("conflict");
        setSaveError(null);
        return;
      }

      if (event.status === "error") {
        setSaveStatus("error");
        setSaveError(event.message);
      }
    });
  }, [documentId]);

  useEffect(() => {
    if (!documentId) {
      return;
    }

    const handleNetworkChange = () => {
      void getQueuedDocumentUpdate(documentId).then((queued) => {
        if (!queued) {
          return;
        }

        setSaveStatus(navigator.onLine ? "queued" : "offline");
      });
    };

    window.addEventListener("online", handleNetworkChange);
    window.addEventListener("offline", handleNetworkChange);

    return () => {
      window.removeEventListener("online", handleNetworkChange);
      window.removeEventListener("offline", handleNetworkChange);
    };
  }, [documentId]);

  const updateDocumentState = useCallback(
    (next: DocumentState) => {
      if (currentDocumentIdRef.current && currentDocumentIdRef.current !== next.id) {
        return;
      }

      setDocument(next);
      void cacheDocument(next).catch(() => undefined);
      saveCounterRef.current += 1;
      const saveId = saveCounterRef.current;
      pendingSaveRef.current = saveId;
      setSaveStatus(navigator.onLine ? "syncing" : "offline");
      debouncedPersist(next, saveId);
      debouncedIndexUpdate(next);
    },
    [debouncedIndexUpdate, debouncedPersist]
  );

  const setLocalDocument = useCallback(
    (next: DocumentState | ((current: DocumentState | null) => DocumentState | null)) => {
      setDocument((current) => {
        const resolved =
          typeof next === "function"
            ? (next as (value: DocumentState | null) => DocumentState | null)(current)
            : next;
        if (resolved) {
          void cacheDocument(resolved).catch(() => undefined);
        }
        return resolved;
      });
    },
    []
  );

  const clearConflict = useCallback(() => {
    setConflictState(null);
    setSaveStatus("saved");
  }, []);

  const reloadDocument = useCallback(() => {
    setReloadNonce((current) => current + 1);
  }, []);

  return {
    document,
    accessRole,
    updateDocument: updateDocumentState,
    setLocalDocument,
    loading,
    error,
    saveStatus,
    saveError,
    conflictState,
    clearConflict,
    reloadDocument
  };
};
