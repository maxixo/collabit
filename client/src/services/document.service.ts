import {
  getDocument as getCachedDocument,
  listDocumentsByWorkspace,
  saveDocument,
  saveDocuments
} from "../offline/indexedDb";

export type TipTapContent = Record<string, unknown>;

export interface DocumentSummary {
  id: string;
  title: string;
  updatedAt: string;
  ownerId: string;
  workspaceId: string;
  isStarred: boolean;
}

export interface DocumentDetail extends DocumentSummary {
  content: TipTapContent;
  accessRole?: DocumentAccessRole;
}

export type DocumentAccessRole = "viewer" | "editor" | "owner";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

const parseJson = async <T>(response: Response): Promise<T> => {
  const data = (await response.json()) as T;
  if (!response.ok) {
    const message =
      (data as { message?: string }).message ?? "Document request failed";
    throw new Error(message);
  }
  return data;
};

const safeStore = async (task: () => Promise<void>) => {
  try {
    await task();
  } catch {
    // Ignore IndexedDB failures to avoid blocking network responses.
  }
};

const buildDocumentUrl = (id: string, workspaceId?: string, shareToken?: string) => {
  const params = new URLSearchParams();
  if (workspaceId) {
    params.set("workspaceId", workspaceId);
  }
  if (shareToken) {
    params.set("token", shareToken);
  }
  const query = params.toString();
  return `${API_BASE_URL}/api/documents/${encodeURIComponent(id)}${query ? `?${query}` : ""}`;
};

export const fetchDocuments = async (workspaceId: string): Promise<DocumentSummary[]> => {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/documents?workspaceId=${encodeURIComponent(workspaceId)}`,
      { credentials: "include" }
    );
    const data = await parseJson<{ documents: DocumentSummary[] }>(response);
    const documents = data.documents ?? [];
    await safeStore(() => saveDocuments(documents));
    return documents;
  } catch (error) {
    if (!navigator.onLine) {
      return listDocumentsByWorkspace(workspaceId);
    }
    throw error;
  }
};

export const fetchStarredDocuments = async (workspaceId: string): Promise<DocumentSummary[]> => {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/documents/starred?workspaceId=${encodeURIComponent(workspaceId)}`,
      { credentials: "include" }
    );
    const data = await parseJson<{ documents: DocumentSummary[] }>(response);
    const documents = data.documents ?? [];
    await safeStore(() => saveDocuments(documents));
    return documents;
  } catch (error) {
    if (!navigator.onLine) {
      const documents = await listDocumentsByWorkspace(workspaceId);
      return documents.filter((doc) => doc.isStarred);
    }
    throw error;
  }
};

export const fetchTrashDocuments = async (workspaceId: string): Promise<DocumentSummary[]> => {
  const response = await fetch(
    `${API_BASE_URL}/api/documents/trash?workspaceId=${encodeURIComponent(workspaceId)}`,
    { credentials: "include" }
  );
  const data = await parseJson<{ documents: DocumentSummary[] }>(response);
  return data.documents ?? [];
};

export const moveDocumentToTrash = async (
  documentId: string,
  workspaceId: string
): Promise<{ documentId: string; trashed: boolean }> => {
  const response = await fetch(
    `${API_BASE_URL}/api/documents/${encodeURIComponent(documentId)}/trash?workspaceId=${encodeURIComponent(
      workspaceId
    )}`,
    {
      method: "PATCH",
      credentials: "include"
    }
  );

  return await parseJson<{ documentId: string; trashed: boolean }>(response);
};

export const restoreDocument = async (
  documentId: string,
  workspaceId: string
): Promise<{ documentId: string; restored: boolean }> => {
  const response = await fetch(
    `${API_BASE_URL}/api/documents/${encodeURIComponent(documentId)}/restore?workspaceId=${encodeURIComponent(
      workspaceId
    )}`,
    {
      method: "PATCH",
      credentials: "include"
    }
  );

  return await parseJson<{ documentId: string; restored: boolean }>(response);
};

export const permanentlyDeleteDocument = async (
  documentId: string,
  workspaceId: string
): Promise<{ documentId: string; deleted: boolean }> => {
  const response = await fetch(
    `${API_BASE_URL}/api/documents/${encodeURIComponent(documentId)}?workspaceId=${encodeURIComponent(
      workspaceId
    )}`,
    {
      method: "DELETE",
      credentials: "include"
    }
  );

  return await parseJson<{ documentId: string; deleted: boolean }>(response);
};

export const emptyTrash = async (
  workspaceId: string
): Promise<{ deletedCount: number }> => {
  const response = await fetch(
    `${API_BASE_URL}/api/documents/trash?workspaceId=${encodeURIComponent(workspaceId)}`,
    {
      method: "DELETE",
      credentials: "include"
    }
  );

  return await parseJson<{ deletedCount: number }>(response);
};

export const fetchDocumentById = async (
  id: string,
  workspaceId?: string,
  options?: { signal?: AbortSignal; shareToken?: string }
): Promise<DocumentDetail | null> => {
  try {
    const response = await fetch(
      buildDocumentUrl(id, workspaceId, options?.shareToken),
      { credentials: "include", signal: options?.signal }
    );

    if (response.status === 404) {
      return null;
    }

    const data = await parseJson<{
      document: DocumentDetail;
      accessRole?: DocumentAccessRole;
    }>(response);
    const document = data.document
      ? {
          ...data.document,
          accessRole: data.accessRole
        }
      : null;
    if (document) {
      await safeStore(() => saveDocument(document));
    }
    return document;
  } catch (error) {
    if (!navigator.onLine) {
      return getCachedDocument(id);
    }
    throw error;
  }
};

export const toggleStarDocument = async (
  documentId: string,
  workspaceId: string
): Promise<{ documentId: string; isStarred: boolean }> => {
  const response = await fetch(
    `${API_BASE_URL}/api/documents/${encodeURIComponent(documentId)}/star?workspaceId=${encodeURIComponent(
      workspaceId
    )}`,
    {
      method: "PATCH",
      credentials: "include"
    }
  );

  return await parseJson<{ documentId: string; isStarred: boolean }>(response);
};

export const createDocument = async (payload: {
  id?: string;
  title?: string;
  content?: TipTapContent;
  workspaceId: string;
}): Promise<DocumentDetail> => {
  const response = await fetch(`${API_BASE_URL}/api/documents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload)
  });

  const data = await parseJson<{ document: DocumentDetail }>(response);
  if (data.document) {
    await safeStore(() => saveDocument(data.document));
  }
  return data.document;
};

export const updateDocument = async (payload: {
  id: string;
  workspaceId: string;
  title?: string;
  content?: TipTapContent;
}, options?: { signal?: AbortSignal; shareToken?: string }): Promise<DocumentDetail> => {
  const response = await fetch(
    buildDocumentUrl(payload.id, payload.workspaceId, options?.shareToken),
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      signal: options?.signal,
      body: JSON.stringify({
        title: payload.title,
        content: payload.content
      })
    }
  );

  const data = await parseJson<{ document: DocumentDetail }>(response);
  if (data.document) {
    await safeStore(() => saveDocument(data.document));
  }
  return data.document;
};
