import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getOfflineAccount, isCurrentAccount } from "../offline/accountScope";
import {
  discardQueuedDocument, listQueuedDocumentUpdates, retryQueuedDocument,
  subscribeToDocumentQueue, type DocumentQueueItem
} from "../offline/documentQueue";
import { exportDocumentAsDoc } from "../utils/exportDocument";

export const LocalDraftRecovery = () => {
  const account = getOfflineAccount();
  const [drafts, setDrafts] = useState<DocumentQueueItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    const entries = await listQueuedDocumentUpdates(account);
    if (isCurrentAccount(account)) setDrafts(entries);
  }, [account]);
  useEffect(() => {
    const reload = () => { void refresh().catch(() => setError("Unable to read local drafts.")); };
    reload();
    return subscribeToDocumentQueue(reload);
  }, [refresh]);

  const act = async (entry: DocumentQueueItem, discard: boolean) => {
    if (discard && !window.confirm(`Discard the local draft "${entry.payload.title}"? Download a copy first if you want to keep it.`)) return;
    setBusy(entry.id); setError(null);
    try {
      if (discard) await discardQueuedDocument(entry.documentId, entry.id, account);
      else await retryQueuedDocument(entry.documentId, account);
      await refresh();
    } catch (failure) {
      if (isCurrentAccount(account)) setError(failure instanceof Error ? failure.message : "Unable to recover this draft.");
    } finally { if (isCurrentAccount(account)) setBusy(null); }
  };
  return (
    <section aria-label="Local draft recovery" className="rounded-2xl border border-[#e7e7f3] bg-white p-6 dark:border-[#2a2b4a] dark:bg-[#16172d]">
      <h2 className="text-lg font-bold">Local drafts</h2>
      <p className="mt-2 text-sm">Unsaved work stays on this browser for your account until saved or discarded. Downloads keep your draft here.</p>
      {error && <p role="alert" className="mt-3 text-sm text-rose-600">{error}</p>}
      {drafts.length === 0 && <p className="mt-3 text-sm">No pending local drafts.</p>}
      <ul className="mt-4 space-y-4">
        {drafts.map((entry) => (
          <li key={entry.id} className="rounded-lg border border-current/20 p-3">
            <Link className="font-semibold underline" to={`/editor/${encodeURIComponent(entry.documentId)}?workspaceId=${encodeURIComponent(entry.workspaceId)}`}>
              {entry.payload.title || "Untitled document"}
            </Link>
            <p className="mt-1 text-sm">
              {entry.payload.sync?.status === "conflict" ? "Conflict: open the document to compare both copies."
                : entry.payload.sync?.message ?? "Waiting to sync."}
            </p>
            <div className="mt-3 flex flex-wrap gap-4 text-sm">
              <button type="button" className="underline" onClick={() => {
                exportDocumentAsDoc({ title: entry.payload.title, content: entry.payload.content, updatedAt: entry.payload.updatedAtClient });
              }}>Download draft</button>
              <button type="button" className="underline" disabled={busy !== null || !navigator.onLine}
                onClick={() => void act(entry, false)}>Retry sync</button>
              <button type="button" className="underline" disabled={busy !== null}
                onClick={() => void act(entry, true)}>Discard draft</button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
};
