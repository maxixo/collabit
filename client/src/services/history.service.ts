const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

export interface DocumentVersion {
  id: string;
  documentId: string;
  versionNumber: number;
  title: string;
  content: Record<string, unknown>;
  createdBy: string;
  createdByName?: string;
  createdAt: string;
  workspaceId: string;
}

type HistoryRequestOptions = {
  shareToken?: string;
};

const buildHistoryUrl = (
  documentId: string,
  path: "history" | "restore",
  workspaceId: string,
  options?: HistoryRequestOptions
) => {
  const params = new URLSearchParams();
  if (workspaceId) {
    params.set("workspaceId", workspaceId);
  }
  if (options?.shareToken) {
    params.set("token", options.shareToken);
  }

  const query = params.toString();
  return `${API_BASE_URL}/api/documents/${encodeURIComponent(documentId)}/${path}${query ? `?${query}` : ""}`;
};

const getErrorMessage = async (response: Response, fallback: string) => {
  try {
    const data = (await response.json()) as { message?: string };
    return data.message ?? fallback;
  } catch {
    return fallback;
  }
};

/**
 * Fetch document history/versions
 */
export const getDocumentHistory = async (
  documentId: string,
  workspaceId: string,
  options?: HistoryRequestOptions
): Promise<DocumentVersion[]> => {
  const response = await fetch(buildHistoryUrl(documentId, "history", workspaceId, options), {
    method: "GET",
    credentials: "include",
    headers: {
      "Content-Type": "application/json"
    }
  });

  if (!response.ok) {
    const message = await getErrorMessage(response, response.statusText || "Request failed");
    throw new Error(`Failed to fetch document history: ${message}`);
  }

  const data = (await response.json()) as { versions?: DocumentVersion[] };
  return data.versions ?? [];
};

/**
 * Restore document to a specific version
 */
export const restoreDocumentVersion = async (
  documentId: string,
  versionNumber: number,
  workspaceId: string,
  options?: HistoryRequestOptions
): Promise<{ message: string; content: Record<string, unknown> }> => {
  const response = await fetch(buildHistoryUrl(documentId, "restore", workspaceId, options), {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ versionNumber })
  });

  if (!response.ok) {
    const message = await getErrorMessage(response, response.statusText || "Request failed");
    throw new Error(`Failed to restore document: ${message}`);
  }

  return response.json();
};
