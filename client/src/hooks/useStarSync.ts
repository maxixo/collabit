import { useCallback, useEffect, useRef } from "react";
import { actions, useAppStore } from "../app/store";
import { flushStarQueue } from "../offline/starQueue";
import { updateCachedDocumentStar } from "../offline/indexedDb";
import { syncOnReconnect } from "../offline/syncOnReconnect";
import { toggleStarDocument } from "../services/document.service";
import { emitStarUpdate, subscribeToStarUpdates } from "../utils/starEvents";

export const useStarSync = () => {
  const { dispatch, recentDocuments } = useAppStore();
  const recentDocumentsRef = useRef(recentDocuments);

  useEffect(() => {
    recentDocumentsRef.current = recentDocuments;
  }, [recentDocuments]);

  const applyStarUpdate = useCallback(
    (documentId: string, isStarred: boolean) => {
      dispatch(actions.setDocumentStar({ id: documentId, isStarred }));
      const fallback = recentDocumentsRef.current.find((doc) => doc.id === documentId);
      void updateCachedDocumentStar(documentId, isStarred, fallback);
    },
    [dispatch]
  );

  useEffect(() => {
    const unsubscribe = subscribeToStarUpdates((update) => {
      applyStarUpdate(update.documentId, update.isStarred);
    });
    return unsubscribe;
  }, [applyStarUpdate]);

  const flushQueue = useCallback(async () => {
    await flushStarQueue(async ({ documentId, workspaceId }) => {
      const result = await toggleStarDocument(documentId, workspaceId);
      applyStarUpdate(result.documentId, result.isStarred);
      emitStarUpdate({
        documentId: result.documentId,
        workspaceId,
        isStarred: result.isStarred
      });
    });
  }, [applyStarUpdate]);

  useEffect(() => {
    if (navigator.onLine) {
      void flushQueue().catch(() => undefined);
    }
    return syncOnReconnect({ flushQueue });
  }, [flushQueue]);
};
