import type { ShareToken, ShareTokenOptions } from "@shared/types";

type ShareTokenRequestOptions = ShareTokenOptions & { workspaceId?: string };

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

const parseJson = async <T>(response: Response): Promise<T> => {
  const data = (await response.json()) as T;
  if (!response.ok) {
    const message = (data as { message?: string }).message ?? "Share request failed";
    throw new Error(message);
  }
  return data;
};

const resolveWorkspaceId = (workspaceId?: string): string => {
  if (workspaceId && workspaceId.trim()) {
    return workspaceId;
  }
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get("workspaceId");
  if (fromUrl && fromUrl.trim()) {
    return fromUrl;
  }
  return "default";
};

export const generateShareToken = async (
  documentId: string,
  options: ShareTokenRequestOptions = {}
): Promise<ShareToken> => {
  const workspaceId = resolveWorkspaceId(options.workspaceId);
  const payload: ShareTokenOptions = {};

  if (options.permission) {
    payload.permission = options.permission;
  }
  if (options.expiration !== undefined) {
    payload.expiration = options.expiration;
  }
  if (options.maxUses !== undefined) {
    payload.maxUses = options.maxUses;
  }

  const response = await fetch(
    `${API_BASE_URL}/api/documents/${encodeURIComponent(documentId)}/share?workspaceId=${encodeURIComponent(
      workspaceId
    )}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload)
    }
  );

  const data = await parseJson<{ shareToken: ShareToken }>(response);
  return data.shareToken;
};

export const validateShareToken = async (token: string): Promise<ShareToken> => {
  const response = await fetch(
    `${API_BASE_URL}/api/documents/share/${encodeURIComponent(token)}`,
    { credentials: "include" }
  );
  const data = await parseJson<{ shareToken: ShareToken }>(response);
  return data.shareToken;
};

export const getShareTokens = async (
  documentId: string,
  workspaceId?: string
): Promise<ShareToken[]> => {
  const resolvedWorkspaceId = resolveWorkspaceId(workspaceId);
  const response = await fetch(
    `${API_BASE_URL}/api/documents/${encodeURIComponent(documentId)}/share-tokens?workspaceId=${encodeURIComponent(
      resolvedWorkspaceId
    )}`,
    { credentials: "include" }
  );
  const data = await parseJson<{ tokens: ShareToken[] }>(response);
  return data.tokens ?? [];
};

export const revokeShareToken = async (
  token: string,
  workspaceId?: string
): Promise<{ token: string; revoked: boolean }> => {
  const resolvedWorkspaceId = resolveWorkspaceId(workspaceId);
  const response = await fetch(
    `${API_BASE_URL}/api/documents/share/${encodeURIComponent(token)}?workspaceId=${encodeURIComponent(
      resolvedWorkspaceId
    )}`,
    { method: "DELETE", credentials: "include" }
  );
  return parseJson<{ token: string; revoked: boolean }>(response);
};
