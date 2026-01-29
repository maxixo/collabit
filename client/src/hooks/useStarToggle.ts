import { useCallback } from "react";
import { actions, useAppStore } from "../app/store";
import { toggleStarDocument, type DocumentSummary } from "../services/document.service";
import { enqueueStarToggle } from "../offline/starQueue";
import { updateCachedDocumentStar } from "../offline/indexedDb";
import { emitStarUpdate } from "../utils/starEvents";

type StarToggleDocument = Pick<
  DocumentSummary,
  "id" | "workspaceId" | "isStarred" | "title" | "updatedAt" | "ownerId"
>;

type StarToggleCallbacks = {
  onOptimisticUpdate?: (isStarred: boolean) => void;
  onFinalUpdate?: (isStarred: boolean) => void;
};

export const useStarToggle = () => {
  const { dispatch } = useAppStore();

  const applyUpdate = useCallback(
    (documentId: string, isStarred: boolean, fallback: StarToggleDocument) => {
      dispatch(actions.setDocumentStar({ id: documentId, isStarred }));
      void updateCachedDocumentStar(documentId, isStarred, fallback);
    },
    [dispatch]
  );

  const toggleStar = useCallback(
    async (document: StarToggleDocument, callbacks?: StarToggleCallbacks) => {
      const nextIsStarred = !document.isStarred;
      applyUpdate(document.id, nextIsStarred, document);
      callbacks?.onOptimisticUpdate?.(nextIsStarred);
      emitStarUpdate({
        documentId: document.id,
        workspaceId: document.workspaceId,
        isStarred: nextIsStarred
      });

      if (!navigator.onLine) {
        await enqueueStarToggle(document.id, document.workspaceId);
        return { documentId: document.id, isStarred: nextIsStarred, queued: true };
      }

      try {
        const result = await toggleStarDocument(document.id, document.workspaceId);
        if (result.isStarred !== nextIsStarred) {
          applyUpdate(result.documentId, result.isStarred, document);
          callbacks?.onFinalUpdate?.(result.isStarred);
          emitStarUpdate({
            documentId: result.documentId,
            workspaceId: document.workspaceId,
            isStarred: result.isStarred
          });
        } else {
          callbacks?.onFinalUpdate?.(result.isStarred);
        }
        return { ...result, queued: false };
      } catch (error) {
        if (!navigator.onLine) {
          await enqueueStarToggle(document.id, document.workspaceId);
          return { documentId: document.id, isStarred: nextIsStarred, queued: true };
        }
        applyUpdate(document.id, document.isStarred, document);
        callbacks?.onFinalUpdate?.(document.isStarred);
        emitStarUpdate({
          documentId: document.id,
          workspaceId: document.workspaceId,
          isStarred: document.isStarred
        });
        throw error;
      }
    },
    [applyUpdate]
  );

  return { toggleStar };
};
