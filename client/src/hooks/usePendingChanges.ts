import { useEffect, useState, useCallback } from "react";
import { useAppStore, actions } from "../app/store";
import { useAuth } from "../auth/AuthContext";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

interface UsePendingChangesOptions {
  documentId: string;
  workspaceId: string;
  shareToken?: string;
  enabled?: boolean;
  pollInterval?: number;
}

interface PendingChangesResponse {
  pendingChanges: Array<{
    userId: string;
    changeCount: number;
    firstChange: string;
    lastChange: string;
    changeTypes: string[];
    user?: {
      id: string;
      displayName?: string;
      email?: string;
    };
  }>;
}

interface SaveDocumentOptions {
  applyPendingChanges: boolean;
  specificUserChanges?: string[];
  title?: string;
  content?: Record<string, unknown>;
  saveType?: "version";
}

export const usePendingChanges = ({
  documentId,
  workspaceId,
  shareToken,
  enabled = true,
  pollInterval = 30000 // 30 seconds by default
}: UsePendingChangesOptions) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const { pendingChanges, dispatch } = useAppStore();
  const { user: currentUser } = useAuth();

  const buildDocumentUrl = useCallback(
    (path: "pending-changes" | "save") => {
      const params = new URLSearchParams();
      if (workspaceId) {
        params.set("workspaceId", workspaceId);
      }
      if (shareToken) {
        params.set("token", shareToken);
      }
      const query = params.toString();
      return `${API_BASE_URL}/api/documents/${encodeURIComponent(documentId)}/${path}${query ? `?${query}` : ""}`;
    },
    [documentId, workspaceId, shareToken]
  );

  // Fetch pending changes from the server
  const fetchPendingChanges = useCallback(async () => {
    if (!enabled || !documentId || !workspaceId || !currentUser) {
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(buildDocumentUrl("pending-changes"), {
        method: "GET",
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch pending changes: ${response.statusText}`);
      }

      const data: PendingChangesResponse = await response.json();
      dispatch(actions.setPendingChanges(documentId, data.pendingChanges));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(errorMessage);
      console.error("Error fetching pending changes:", err);
    } finally {
      setLoading(false);
    }
  }, [buildDocumentUrl, enabled, currentUser, dispatch]);

  // Manually save an explicit version snapshot for history.
  const versionSaveDocument = useCallback(
    async (options: SaveDocumentOptions = { applyPendingChanges: true }) => {
      if (!documentId || !workspaceId || !currentUser) {
        throw new Error("Missing required parameters");
      }

      try {
        setIsSaving(true);
        setError(null);
        dispatch(actions.setSaveStatus("saving"));

        const response = await fetch(buildDocumentUrl("save"), {
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
        console.error("Error saving document:", err);
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [buildDocumentUrl, documentId, workspaceId, currentUser, dispatch]
  );

  // Clear pending changes state (e.g., after save)
  const clearPendingChanges = useCallback(() => {
    dispatch(actions.clearPendingChanges(documentId));
  }, [documentId, dispatch]);

  // Fetch pending changes on mount and when document changes
  useEffect(() => {
    if (enabled && documentId && workspaceId) {
      fetchPendingChanges();
    }
  }, [documentId, workspaceId, enabled, fetchPendingChanges]);

  // Poll for pending changes at specified interval
  useEffect(() => {
    if (!enabled || !documentId || !workspaceId || pollInterval <= 0) {
      return;
    }

    const intervalId = setInterval(() => {
      fetchPendingChanges();
    }, pollInterval);

    return () => clearInterval(intervalId);
  }, [documentId, workspaceId, enabled, pollInterval, fetchPendingChanges]);

  return {
    pendingChanges: pendingChanges[documentId] || [],
    loading,
    error,
    isSaving,
    hasPendingChanges: (pendingChanges[documentId] || []).length > 0,
    totalPendingChanges: (pendingChanges[documentId] || []).reduce(
      (sum, change) => sum + change.changeCount,
      0
    ),
    fetchPendingChanges,
    saveDocument: versionSaveDocument,
    versionSaveDocument,
    clearPendingChanges
  };
};
