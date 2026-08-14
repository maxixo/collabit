import type { DocumentSuggestion, SuggestionBatchSummary } from "@shared/types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

const parseJson = async <T>(response: Response): Promise<T> => {
  const data = (await response.json()) as T;
  if (!response.ok) {
    const message = (data as { message?: string }).message ?? "Suggestion request failed";
    throw new Error(message);
  }
  return data;
};

const buildSuggestionUrl = (documentId: string, workspaceId: string, status?: string) => {
  const params = new URLSearchParams({ workspaceId });
  if (status) {
    params.set("status", status);
  }
  return `${API_BASE_URL}/api/documents/${encodeURIComponent(documentId)}/suggestions?${params.toString()}`;
};

export const fetchSuggestions = async (
  documentId: string,
  workspaceId: string,
  status: "pending" | "accepted" | "rejected" | "all" = "pending"
): Promise<{ suggestions: DocumentSuggestion[]; pendingChanges: SuggestionBatchSummary[] }> => {
  const response = await fetch(buildSuggestionUrl(documentId, workspaceId, status), {
    credentials: "include"
  });
  return parseJson<{ suggestions: DocumentSuggestion[]; pendingChanges: SuggestionBatchSummary[] }>(response);
};

export const createSuggestion = async (
  documentId: string,
  workspaceId: string,
  payload: {
    suggestionType: "insert" | "delete" | "replace" | "format";
    from: number;
    to: number;
    originalText?: string | null;
    suggestedText?: string | null;
    metadata?: Record<string, unknown>;
  }
): Promise<DocumentSuggestion> => {
  const response = await fetch(buildSuggestionUrl(documentId, workspaceId), {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const data = await parseJson<{ suggestion: DocumentSuggestion }>(response);
  return data.suggestion;
};

export const reviewSuggestions = async (
  documentId: string,
  workspaceId: string,
  payload:
    | { action: "accept" | "reject"; suggestionIds: string[] }
    | { action: "accept" | "reject"; authorUserIds: string[] }
): Promise<{ suggestions?: DocumentSuggestion[]; resolvedCount: number }> => {
  const response = await fetch(
    `${API_BASE_URL}/api/documents/${encodeURIComponent(documentId)}/suggestions/review?workspaceId=${encodeURIComponent(workspaceId)}`,
    {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    }
  );

  return parseJson<{ suggestions?: DocumentSuggestion[]; resolvedCount: number }>(response);
};
