import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DocumentState } from "../types";
import { fetchDocumentById, type DocumentDetail } from "../services/document.service";
import { getDocument as getCachedDocument, saveDocument as cacheDocument } from "../offline/indexedDb";
import { indexDocument } from "../offline/searchIndex";
import { discardQueuedDocument, enqueueDocumentUpdate, flushDocumentQueue, getQueuedDocumentUpdate, subscribeToDocumentQueue, type DocumentQueueItem } from "../offline/documentQueue";
import { getOfflineAccount, isCurrentAccount } from "../offline/accountScope";
import { debounce } from "../utils/debounce";
import { sanitizeTipTapContent } from "../utils/tiptapContent";

export type SaveStatus = "idle" | "offline" | "queued" | "syncing" | "saved" | "error" | "conflict";
export type DocumentConflictState = {
  operationId: string;
  local: { title: string; content: DocumentState["content"]; updatedAt: string };
  server: DocumentState;
};
const normalize = <T extends { content: Record<string, unknown> }>(document: T) => ({
  ...document, content: sanitizeTipTapContent(document.content) as DocumentState["content"]
});

export const useDocument = (documentId?: string, workspaceId?: string, options?: { shareToken?: string }) => {
  const account = getOfflineAccount();
  const shareToken = options?.shareToken;
  const [document, setDocument] = useState<DocumentState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [accessRole, setAccessRole] = useState<"viewer" | "editor" | "owner" | null>(null);
  const [conflictState, setConflictState] = useState<DocumentConflictState | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [hydrationVersion, setHydrationVersion] = useState(0);
  const synced = useRef<DocumentState | null>(null);
  const mounted = useRef(true);
  const writes = useRef(0);
  const latestWrite = useRef<Promise<DocumentQueueItem> | null>(null);
  const selectedDocument = useRef(documentId);
  selectedDocument.current = documentId;

  const showDraftStatus = useCallback((entry: DocumentQueueItem) => {
    const sync = entry.payload.sync;
    if (sync?.status === "conflict" && sync.server) {
      setConflictState({ operationId: entry.id, local: {
        title: entry.payload.title, content: normalize({ content: entry.payload.content }).content,
        updatedAt: entry.payload.updatedAtClient
      }, server: normalize(sync.server) });
      setSaveStatus("conflict"); setSaveError(null);
    } else if (sync?.status === "blocked") {
      setSaveStatus("error"); setSaveError(sync.message ?? "Your local draft is retained. Retry after signing in.");
    } else {
      setSaveStatus(navigator.onLine ? "queued" : "offline");
      setSaveError(sync?.message ?? null);
    }
  }, []);

  const syncNow = useCallback(async () => {
    if (!navigator.onLine || !isCurrentAccount(account)) return;
    try { await flushDocumentQueue(account); }
    catch (failure) {
      if (mounted.current && isCurrentAccount(account)) {
        setSaveStatus("error"); setSaveError(failure instanceof Error ? failure.message : "Local draft is retained.");
      }
    }
  }, [account]);
  const debouncedSync = useMemo(() => debounce(() => { void syncNow(); }, 1200), [syncNow]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      debouncedSync.cancel();
      // Persistence is already queued for the original account/document before navigation.
      if (latestWrite.current) void latestWrite.current.then(syncNow).catch(() => {});
    };
  }, [debouncedSync, syncNow]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    synced.current = null;
    setDocument(null); setConflictState(null); setSaveStatus("idle"); setAccessRole(null);
    setSaveError(null); setError(null); setLoading(true);
    const load = async () => {
      if (!documentId || (!workspaceId && !shareToken)) { setLoading(false); return; }
      let remote: DocumentDetail | null = null;
      let failure: unknown;
      try { remote = await fetchDocumentById(documentId, workspaceId, { shareToken, signal: controller.signal, cache: false, account }); }
      catch (caught) { failure = caught; }
      if (!active || !isCurrentAccount(account)) return;
      const queued = await getQueuedDocumentUpdate(documentId, account);
      const cached = await getCachedDocument(documentId, account);
      if (!active || !isCurrentAccount(account)) return;
      // A replay may have acknowledged a save while the initial GET was in flight.
      if (remote && synced.current?.id === remote.id && synced.current.updatedAt > remote.updatedAt)
        remote = { ...remote, ...synced.current };
      const base = remote ?? cached ?? (queued ? {
        id: documentId, workspaceId: queued.workspaceId, ownerId: account.userId, isStarred: false,
        title: queued.payload.title, content: queued.payload.content, updatedAt: queued.payload.updatedAtClient
      } : null);
      if (!base) {
        setError(failure instanceof Error ? failure.message : "Document not found"); setLoading(false); return;
      }
      if (remote) synced.current = normalize(remote);
      const hydrated = normalize(queued ? {
        ...base, title: queued.payload.title, content: queued.payload.content, updatedAt: queued.payload.updatedAtClient
      } : base);
      await cacheDocument(hydrated, account);
      if (!active || !isCurrentAccount(account)) return;
      setDocument(hydrated);
      setAccessRole(failure ? "viewer" : remote?.accessRole ?? "viewer");
      setHydrationVersion((version) => version + 1);
      if (queued) showDraftStatus(queued);
      else { setSaveStatus(failure ? "error" : "saved"); setSaveError(failure instanceof Error ? failure.message : null); }
      if (isCurrentAccount(account)) void indexDocument(hydrated);
      setLoading(false);
    };
    void load().catch((failure) => {
      if (active && isCurrentAccount(account)) { setError(String(failure)); setLoading(false); }
    });
    return () => { active = false; controller.abort(); };
  }, [account, documentId, workspaceId, shareToken, reloadNonce, showDraftStatus]);

  useEffect(() => {
    if (!documentId) return;
    let active = true;
    const unsubscribe = subscribeToDocumentQueue((event) => {
      if (event.documentId !== documentId) return;
      if (event.status === "saved" && event.document) {
        const saved = normalize(event.document);
        synced.current = saved;
        void getQueuedDocumentUpdate(documentId, account).then((queued) => {
          if (!active || !isCurrentAccount(account)) return;
          if (queued) { showDraftStatus(queued); return; }
          if (writes.current > 0) return;
          setDocument(saved); setSaveStatus("saved"); setSaveError(null); setConflictState(null);
        });
      } else if (event.status === "conflict" || event.status === "queued") {
        void getQueuedDocumentUpdate(documentId, account).then((entry) => {
          if (entry && active && isCurrentAccount(account)) showDraftStatus(entry);
        });
      } else if (event.status === "syncing") setSaveStatus("syncing");
      else if (event.status === "error") { setSaveStatus(navigator.onLine ? "error" : "offline"); setSaveError(event.message ?? "Local draft retained."); }
    });
    return () => { active = false; unsubscribe(); };
  }, [account, documentId, showDraftStatus]);

  const updateDocumentState = useCallback((next: DocumentState) => {
    if (!isCurrentAccount(account)) return;
    setDocument(next); setSaveStatus(navigator.onLine ? "queued" : "offline");
    writes.current++;
    const pending = enqueueDocumentUpdate({
      documentId: next.id, workspaceId: next.workspaceId || workspaceId || "default", title: next.title,
      content: next.content, updatedAtClient: next.updatedAt, baseUpdatedAt: synced.current?.updatedAt ?? null,
      baseRevision: synced.current?.revision ?? next.revision, shareToken
    }, account);
    latestWrite.current = pending;
    void cacheDocument(next, account).catch(() => {});
    void pending.then((entry) => {
      if (mounted.current && selectedDocument.current === next.id && isCurrentAccount(account)) {
        showDraftStatus(entry); void indexDocument(next);
      }
      if (isCurrentAccount(account) && navigator.onLine) {
        if (mounted.current) debouncedSync(); else void syncNow();
      }
    }).catch((failure) => {
      if (mounted.current && selectedDocument.current === next.id && isCurrentAccount(account)) {
        setSaveStatus("error");
        setSaveError(`Unable to store this draft on this browser: ${String(failure)}. Keep this page open and download a copy.`);
      }
    }).finally(() => { writes.current--; });
  }, [account, workspaceId, shareToken, showDraftStatus, debouncedSync, syncNow]);

  const setLocalDocument = useCallback((next: DocumentState | ((current: DocumentState | null) => DocumentState | null)) => {
    setDocument((current) => {
      const resolved = typeof next === "function" ? next(current) : next;
      if (resolved) void cacheDocument(resolved, account).catch(() => {});
      return resolved;
    });
  }, [account]);

  const discardLocalDraft = useCallback(async () => {
    debouncedSync.cancel();
    await latestWrite.current?.catch(() => {});
    if (documentId) await discardQueuedDocument(documentId, conflictState?.operationId, account);
    setConflictState(null); setSaveError(null); setSaveStatus("idle");
  }, [account, documentId, conflictState, debouncedSync]);
  const reloadDocument = useCallback(() => setReloadNonce((nonce) => nonce + 1), []);
  return {
    document, accessRole, updateDocument: updateDocumentState, setLocalDocument, loading, error,
    saveStatus, saveError, conflictState, discardLocalDraft, clearConflict: discardLocalDraft,
    reloadDocument, hydrationVersion
  };
};
