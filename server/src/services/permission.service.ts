import type { ShareToken } from "@shared/types.js";
import { db } from "../config/db.js";
import { getDocumentSchemaInfo } from "./documentSchema.service.js";
import { validateShareToken } from "./shareToken.service.js";

export type DocumentRole = "viewer" | "editor" | "owner";

const normalizeSharePermission = (permissionLevel: string): DocumentRole => {
  if (permissionLevel === "viewer") {
    return "viewer";
  }
  return "editor";
};

export const getDocumentRole = async (
  userId: string,
  documentId: string,
  workspaceId: string
): Promise<DocumentRole | null> => {
  if (!userId || !documentId || !workspaceId) {
    return null;
  }

  const schema = await getDocumentSchemaInfo();
  const params: Array<string> = [documentId, userId];
  const workspaceClause = schema.hasWorkspaceId ? "AND d.workspace_id = $3" : "";
  if (schema.hasWorkspaceId) {
    params.push(workspaceId);
  }
  const joinClause = schema.hasDocumentMembers
    ? "LEFT JOIN document_members m ON d.id = m.document_id AND m.user_id = $2"
    : "";
  const roleColumn = schema.hasDocumentMembers ? ", m.role" : "";

  const { rows } = await db.query(
    `
      SELECT d.owner_id${roleColumn}
      FROM documents d
      ${joinClause}
      WHERE d.id = $1
      ${workspaceClause}
      LIMIT 1
    `,
    params
  );

  if (rows.length === 0) {
    return null;
  }

  const row = rows[0] as { owner_id?: string; role?: string | null };
  if (row.owner_id === userId) {
    return "owner";
  }

  if (row.role === "viewer" || row.role === "editor" || row.role === "owner") {
    return row.role;
  }

  return null;
};

export const checkPermission = async (
  userId: string,
  documentId: string,
  workspaceId: string
) => {
  const role = await getDocumentRole(userId, documentId, workspaceId);
  return role !== null;
};

export type SharePermissionResult = {
  role: DocumentRole | null;
  source: "member" | "share" | "none";
  shareToken?: ShareToken;
  shareReason?: "not_found" | "expired" | "max_uses";
};

export const checkPermissionWithShare = async (
  userId: string,
  documentId: string,
  workspaceId: string,
  shareToken?: string
): Promise<SharePermissionResult> => {
  const role = await getDocumentRole(userId, documentId, workspaceId);
  if (role) {
    return { role, source: "member" };
  }

  if (!shareToken) {
    return { role: null, source: "none" };
  }

  const validation = await validateShareToken(shareToken);
  if (!validation.valid || validation.token.documentId !== documentId) {
    return {
      role: null,
      source: "none",
      shareReason: validation.valid ? "not_found" : validation.reason
    };
  }

  return {
    role: normalizeSharePermission(validation.token.permissionLevel),
    source: "share",
    shareToken: validation.token
  };
};

export const canEditDocument = (role: DocumentRole | null) =>
  role === "editor" || role === "owner";
