import { useCallback, useState } from "react";
import { useAppStore, actions } from "../app/store";
import { useAuth } from "../auth/AuthContext";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

interface UsePendingChangesOptions {
  documentId: string;
  workspaceId: string;
  shareToken?: string;
  enabled?: boolean;
}

interface SaveDocumentOptions {
  applyPendingChanges: boolean;
  specificUserChanges?: string[];
  title?: string;
  content?: Record<string, unknown>;
  saveType?: "version";
}

const buildVersionSaveUrl = (
  documentId: string,
  workspaceId: string,
  shareToken?: string
) => {
  const params = new URLSearchParams();
  if (workspaceId) {
    params.set("workspaceId", workspaceId);
  }
  if (shareToken) {
    params.set("token", shareToken);
  }

  const query = params.toString();
  return `${API_BASE_URL}/api/documents/${encodeURIComponent(documentId)}/save${query ? `?${query}` : ""}`;
};

export const usePendingChanges = ({
  documentId,
  workspaceId,
  shareToken,
  enabled = true
}: UsePendingChangesOptions) => {
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const { dispatch } = useAppStore();
  const { user: currentUser } = useAuth();

  const versionSaveDocument = useCallback(
    async (options: SaveDocumentOptions = { applyPendingChanges: true }) => {
      if (!enabled || !documentId || !workspaceId || !currentUser) {
        throw new Error("Missing required parameters");
      }

      try {
        setIsSaving(true);
        setError(null);
        dispatch(actions.setSaveStatus("saving"));

        const response = await fetch(buildVersionSaveUrl(documentId, workspaceId, shareToken), {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            ...options,
            saveType: "version"
          })
        });

        if (!response.ok) {
          throw new Error(`Failed to save document: ${response.statusText}`);
        }

        const result = await response.json();
        dispatch(actions.setSaveStatus("saved"));
        dispatch(actions.clearPendingChanges(documentId));
        return result;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Unknown error";
        setError(errorMessage);
        dispatch(actions.setSaveStatus("error"));
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [currentUser, dispatch, documentId, enabled, shareToken, workspaceId]
  );

  const clearPendingChanges = useCallback(() => {
    dispatch(actions.clearPendingChanges(documentId));
  }, [dispatch, documentId]);

  return {
    pendingChanges: [],
    loading: false,
    error,
    isSaving,
    hasPendingChanges: false,
    totalPendingChanges: 0,
    fetchPendingChanges: async () => {},
    saveDocument: versionSaveDocument,
    versionSaveDocument,
    clearPendingChanges
  };
};
