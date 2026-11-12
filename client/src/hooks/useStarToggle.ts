import { useCallback } from "react";
import { actions, useAppStore } from "../app/store";
import { setStarDocument, type DocumentSummary } from "../services/document.service";
import { enqueueStarToggle, flushStarQueue } from "../offline/starQueue";
import { updateCachedDocumentStar } from "../offline/indexedDb";
import { emitStarUpdate } from "../utils/starEvents";
import { getOfflineAccount, isCurrentAccount } from "../offline/accountScope";

type Callbacks = { onOptimisticUpdate?: (value: boolean) => void; onFinalUpdate?: (value: boolean) => void };
export const useStarToggle = () => {
  const { dispatch } = useAppStore();
  const toggleStar = useCallback(async (document: DocumentSummary, callbacks?: Callbacks) => {
    const account = getOfflineAccount();
    const isStarred = !document.isStarred;
    await enqueueStarToggle(document.id, document.workspaceId, isStarred);
    if (!isCurrentAccount(account)) return;
    dispatch(actions.setDocumentStar({ id: document.id, isStarred }));
    await updateCachedDocumentStar(document.id, isStarred, document, account);
    callbacks?.onOptimisticUpdate?.(isStarred);
    emitStarUpdate({ documentId: document.id, workspaceId: document.workspaceId, isStarred });
    if (!navigator.onLine) return { documentId: document.id, isStarred, queued: true };
    try {
      await flushStarQueue(async (entry) => { await setStarDocument(entry.documentId, entry.workspaceId, entry.isStarred); });
      if (isCurrentAccount(account)) callbacks?.onFinalUpdate?.(isStarred);
      return { documentId: document.id, isStarred, queued: false };
    } catch {
      return { documentId: document.id, isStarred, queued: true };
    }
  }, [dispatch]);
  return { toggleStar };
};
