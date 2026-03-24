import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createDocument } from "../services/document.service";

export const useCreateDocumentAction = (workspaceId: string) => {
  const navigate = useNavigate();
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
        title: "Untitled document",
        workspaceId
      });

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
  }, [workspaceId, isCreating, navigate]);

  return {
    createNewDocument,
    isCreating,
    createError
  };
};
