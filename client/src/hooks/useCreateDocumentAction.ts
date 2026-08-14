import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createDocument } from "../services/document.service";
import { actions, useAppStore } from "../app/store";

export const useCreateDocumentAction = (workspaceId: string) => {
  const navigate = useNavigate();
  const { dispatch } = useAppStore();
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const createNewDocument = useCallback(async () => {
    if (!workspaceId || isCreating) {
      return;
    }

    setIsCreating(true);
    setCreateError(null);

    try {
      const document = await createDocument({
        title: "",
        workspaceId
      });

      dispatch(
        actions.addRecentDocument({
          id: document.id,
          title: document.title,
          updatedAt: document.updatedAt,
          ownerId: document.ownerId,
          workspaceId: document.workspaceId || workspaceId,
          isStarred: document.isStarred
        })
      );

      navigate(
        `/editor/${encodeURIComponent(document.id)}?workspaceId=${encodeURIComponent(workspaceId)}`,
        {
          state: { focusTitle: true }
        }
      );
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Failed to create document.");
    } finally {
      setIsCreating(false);
    }
  }, [dispatch, workspaceId, isCreating, navigate]);

  return {
    createNewDocument,
    isCreating,
    createError
  };
};
