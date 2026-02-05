const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

export interface DocumentVersion {
  id: string;
  documentId: string;
  versionNumber: number;
  title: string;
  content: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
  workspaceId: string;
}

/**
 * Fetch document history/versions
 */
export const getDocumentHistory = async (
  documentId: string,
  workspaceId: string
): Promise<DocumentVersion[]> => {
  const response = await fetch(
    `${API_BASE_URL}/api/documents/${documentId}/history?workspaceId=${workspaceId}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("auth_token")}`
      }
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch document history: ${response.statusText}`);
  }

  const data = await response.json();
  return data.versions;
};

/**
 * Restore document to a specific version
 */
export const restoreDocumentVersion = async (
  documentId: string,
  versionNumber: number,
  workspaceId: string
): Promise<{ message: string; content: Record<string, unknown> }> => {
  const response = await fetch(
    `${API_BASE_URL}/api/documents/${documentId}/restore?workspaceId=${workspaceId}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("auth_token")}`
      },
      body: JSON.stringify({ versionNumber })
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to restore document: ${response.statusText}`);
  }

  return response.json();
};