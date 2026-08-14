import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppStore, actions } from "../app/store";
import { useAuth } from "../auth/AuthContext";
import type { DocumentSuggestion, SuggestionBatchSummary } from "@shared/types";
import { createSuggestion, fetchSuggestions, reviewSuggestions } from "../services/suggestion.service";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

interface UsePendingChangesOptions {
  documentId: string;
  workspaceId: string;
  shareToken?: string;
  enabled?: boolean;
  pollIntervalMs?: number;
}

interface SaveDocumentOptions {
  applyPendingChanges: boolean;
  specificUserChanges?: string[];
  title?: string;
  content?: Record<string, unknown>;
  saveType?: "version";
}

interface CreateSuggestionOptions {
  suggestionType: "insert" | "delete" | "replace" | "format";
  from: number;
  to: number;
  originalText?: string | null;
  suggestedText?: string | null;
  metadata?: Record<string, unknown>;
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
  enabled = true,
  pollIntervalMs = 3000
}: UsePendingChangesOptions) => {
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<DocumentSuggestion[]>([]);
  const { dispatch, pendingChanges: pendingChangesMap } = useAppStore();
  const { user: currentUser } = useAuth();
  const pendingChanges = useMemo<SuggestionBatchSummary[]>(() => pendingChangesMap[documentId] ?? [], [documentId, pendingChangesMap]);

  const removeSuggestionsById = useCallback((suggestionIds: string[]) => {
    if (suggestionIds.length === 0) {
      return;
    }

    const idSet = new Set(suggestionIds);
    setSuggestions((current) => current.filter((suggestion) => !idSet.has(suggestion.id)));
  }, []);

  const removeSuggestionsByAuthor = useCallback((authorUserIds: string[]) => {
    if (authorUserIds.length === 0) {
      return [] as string[];
    }

    const authorSet = new Set(authorUserIds);
    let removedIds: string[] = [];

    setSuggestions((current) => {
      removedIds = current
        .filter((suggestion) => authorSet.has(suggestion.authorUserId))
        .map((suggestion) => suggestion.id);

      if (removedIds.length === 0) {
        return current;
      }

      return current.filter((suggestion) => !authorSet.has(suggestion.authorUserId));
    });

    return removedIds;
  }, []);

  const fetchPendingChanges = useCallback(async () => {
    if (!enabled || !documentId || !workspaceId || !currentUser) {
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const result = await fetchSuggestions(documentId, workspaceId, "pending");
      setSuggestions(result.suggestions ?? []);
      dispatch(actions.setPendingChanges(documentId, result.pendingChanges ?? []));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch pending changes");
    } finally {
      setLoading(false);
    }
  }, [currentUser, dispatch, documentId, enabled, workspaceId]);

  useEffect(() => {
    void fetchPendingChanges();
  }, [fetchPendingChanges]);

  useEffect(() => {
    if (!enabled || !documentId || !workspaceId || !currentUser || pollIntervalMs <= 0) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void fetchPendingChanges();
    }, pollIntervalMs);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [currentUser, documentId, enabled, fetchPendingChanges, pollIntervalMs, workspaceId]);

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
        await fetchPendingChanges();
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
    [currentUser, dispatch, documentId, enabled, fetchPendingChanges, shareToken, workspaceId]
  );

  const reviewSingleSuggestion = useCallback(
    async (suggestionId: string, action: "accept" | "reject") => {
      if (!documentId || !workspaceId) {
        throw new Error("Missing required parameters");
      }

      setIsSaving(true);
      setError(null);
      try {
        removeSuggestionsById([suggestionId]);
        const result = await reviewSuggestions(documentId, workspaceId, {
          action,
          suggestionIds: [suggestionId]
        });
        await fetchPendingChanges();
        return result;
      } catch (err) {
        void fetchPendingChanges().catch(() => {});
        setError(err instanceof Error ? err.message : "Failed to review suggestion");
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [documentId, fetchPendingChanges, removeSuggestionsById, workspaceId]
  );

  const reviewSuggestionsByAuthor = useCallback(
    async (authorUserIds: string[], action: "accept" | "reject") => {
      if (!documentId || !workspaceId || authorUserIds.length === 0) {
        throw new Error("Missing required parameters");
      }

      setIsSaving(true);
      setError(null);
      try {
        removeSuggestionsByAuthor(authorUserIds);
        const result = await reviewSuggestions(documentId, workspaceId, {
          action,
          authorUserIds
        });
        await fetchPendingChanges();
        return result;
      } catch (err) {
        void fetchPendingChanges().catch(() => {});
        setError(err instanceof Error ? err.message : "Failed to review collaborator changes");
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [documentId, fetchPendingChanges, removeSuggestionsByAuthor, workspaceId]
  );

  const createDocumentSuggestion = useCallback(
    async (options: CreateSuggestionOptions) => {
      if (!enabled || !documentId || !workspaceId || !currentUser) {
        throw new Error("Missing required parameters");
      }

      setError(null);
      const created = await createSuggestion(documentId, workspaceId, options);
      await fetchPendingChanges();
      return created;
    },
    [currentUser, documentId, enabled, fetchPendingChanges, workspaceId]
  );

  const clearPendingChanges = useCallback(() => {
    dispatch(actions.clearPendingChanges(documentId));
  }, [dispatch, documentId]);

  return {
    pendingChanges,
    suggestions,
    loading,
    error,
    isSaving,
    hasPendingChanges: pendingChanges.length > 0,
    totalPendingChanges: pendingChanges.reduce((sum, change) => sum + change.changeCount, 0),
    fetchPendingChanges,
    saveDocument: versionSaveDocument,
    versionSaveDocument,
    clearPendingChanges,
    reviewSingleSuggestion,
    reviewSuggestionsByAuthor,
    createDocumentSuggestion
  };
};
