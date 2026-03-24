import type { ShareToken } from "@shared/types.js";
import { db } from "../config/db.js";
import type { DocumentModel, DocumentSummary, TipTapContent } from "../models/document.model.js";
import { mapDocumentRow, mapDocumentSummaryRow } from "../models/document.model.js";
import { getDocumentSchemaInfo, type DocumentSchemaInfo } from "./documentSchema.service.js";
import type { DocumentRole } from "./permission.service.js";
import { validateShareToken } from "./shareToken.service.js";
import { joinWorkspaceViaShare } from "./workspace.service.js";

const createParamBuilder = () => {
  const params: Array<unknown> = [];
  const addParam = <T>(value: T) => {
    params.push(value);
    return `$${params.length}`;
  };

  return { params, addParam };
};

const buildVisibilityClause = (schema: DocumentSchemaInfo, userParam: string) => {
  if (!schema.hasDocumentMembers) {
    return `d.owner_id = ${userParam}`;
  }
  return `(d.owner_id = ${userParam} OR EXISTS (SELECT 1 FROM document_members m WHERE m.document_id = d.id AND m.user_id = ${userParam}))`;
};

const normalizeSharePermission = (permissionLevel: string): DocumentRole => {
  if (permissionLevel === "viewer") {
    return "viewer";
  }
  return "editor";
};

const normalizeMemberRole = (role: unknown): DocumentRole | null => {
  if (role === "viewer" || role === "editor" || role === "owner") {
    return role;
  }
  return null;
};

const fetchDocumentAccessInfo = async (documentId: string, schema: DocumentSchemaInfo) => {
  const { params, addParam } = createParamBuilder();
  const idParam = addParam(documentId);
  const workspaceSelect = schema.hasWorkspaceId ? "d.workspace_id" : "NULL AS workspace_id";
  const deletedClause = schema.hasDeletedAt ? "AND d.deleted_at IS NULL" : "";

  const { rows } = await db.query(
    `
      SELECT d.owner_id, ${workspaceSelect}
      FROM documents d
      WHERE d.id = ${idParam}
      ${deletedClause}
      LIMIT 1
    `,
    params
  );

  if (rows.length === 0) {
    return null;
  }

  const row = rows[0] as { owner_id?: string; workspace_id?: string; workspaceId?: string };
  const workspaceId = schema.hasWorkspaceId
    ? typeof row.workspace_id === "string"
      ? row.workspace_id
      : typeof row.workspaceId === "string"
        ? row.workspaceId
        : ""
    : "";

  return {
    ownerId: typeof row.owner_id === "string" ? row.owner_id : "",
    workspaceId
  };
};

const fetchDocumentMemberRole = async (
  documentId: string,
  userId: string,
  schema: DocumentSchemaInfo
): Promise<DocumentRole | null> => {
  if (!schema.hasDocumentMembers || !userId) {
    return null;
  }

  const { rows } = await db.query(
    `
      SELECT role
      FROM document_members
      WHERE document_id = $1
        AND user_id = $2
      LIMIT 1
    `,
    [documentId, userId]
  );

  if (rows.length === 0) {
    return null;
  }

  const row = rows[0] as { role?: unknown };
  return normalizeMemberRole(row.role);
};

export type DocumentShareAccessResult =
  | {
      allowed: true;
      role: DocumentRole;
      source: "member" | "share";
      workspaceId: string;
      shareToken?: ShareToken;
    }
  | {
      allowed: false;
      reason: "not_found" | "unauthorized" | "share_invalid";
      workspaceId?: string;
      shareReason?: "not_found" | "expired" | "max_uses";
    };

export const validateDocumentAccessWithShare = async (
  documentId: string,
  userId: string,
  shareToken?: string
): Promise<DocumentShareAccessResult> => {
  if (!documentId) {
    return { allowed: false, reason: "not_found" };
  }

  const schema = await getDocumentSchemaInfo();
  const accessInfo = await fetchDocumentAccessInfo(documentId, schema);
  if (!accessInfo) {
    return { allowed: false, reason: "not_found" };
  }

  if (userId && accessInfo.ownerId === userId) {
    return {
      allowed: true,
      role: "owner",
      source: "member",
      workspaceId: accessInfo.workspaceId
    };
  }

  const memberRole = await fetchDocumentMemberRole(documentId, userId, schema);
  if (memberRole) {
    return {
      allowed: true,
      role: memberRole,
      source: "member",
      workspaceId: accessInfo.workspaceId
    };
  }

  if (!shareToken) {
    return {
      allowed: false,
      reason: "unauthorized",
      workspaceId: accessInfo.workspaceId
    };
  }

  const validation = await validateShareToken(shareToken);
  if (!validation.valid || validation.token.documentId !== documentId) {
    return {
      allowed: false,
      reason: "share_invalid",
      workspaceId: accessInfo.workspaceId,
      shareReason: validation.valid ? "not_found" : validation.reason
    };
  }

  return {
    allowed: true,
    role: normalizeSharePermission(validation.token.permissionLevel),
    source: "share",
    workspaceId: accessInfo.workspaceId,
    shareToken: validation.token
  };
};

export const autoJoinDocumentViaShare = async (
  documentId: string,
  userId: string,
  shareToken: string,
  permissionLevel: string
): Promise<boolean> => {
  if (!documentId || !userId || !shareToken) {
    return false;
  }

  const schema = await getDocumentSchemaInfo();
  if (!schema.hasDocumentMembers) {
    return false;
  }

  const validation = await validateShareToken(shareToken);
  if (!validation.valid || validation.token.documentId !== documentId) {
    return false;
  }

  const { params, addParam } = createParamBuilder();
  const idParam = addParam(documentId);
  const workspaceSelect = schema.hasWorkspaceId ? "d.workspace_id" : "NULL AS workspace_id";

  const { rows } = await db.query(
    `
      SELECT d.owner_id, ${workspaceSelect}
      FROM documents d
      WHERE d.id = ${idParam}
      LIMIT 1
    `,
    params
  );

  if (rows.length === 0) {
    return false;
  }

  const row = rows[0] as { owner_id?: string; workspace_id?: string; workspaceId?: string };
  const ownerId = typeof row.owner_id === "string" ? row.owner_id : "";
  const workspaceId = schema.hasWorkspaceId
    ? typeof row.workspace_id === "string"
      ? row.workspace_id
      : typeof row.workspaceId === "string"
        ? row.workspaceId
        : ""
    : "";

  if (ownerId && ownerId === userId) {
    return true;
  }

  const resolvedPermission =
    permissionLevel === "viewer" || permissionLevel === "editor" || permissionLevel === "owner"
      ? permissionLevel
      : validation.token.permissionLevel;

  const role = normalizeSharePermission(resolvedPermission);

  await db.query(
    `
      INSERT INTO document_members (document_id, user_id, role)
      VALUES ($1, $2, $3)
      ON CONFLICT (document_id, user_id) DO NOTHING
    `,
    [documentId, userId, role]
  );

  if (workspaceId) {
    await joinWorkspaceViaShare(workspaceId, userId);
  }

  return true;
};

export const listDocuments = async (
  workspaceId: string,
  userId: string
): Promise<DocumentSummary[]> => {
  const schema = await getDocumentSchemaInfo();
  const { params, addParam } = createParamBuilder();
  const userParam = addParam(userId);
  const workspaceParam = addParam(workspaceId);

  const joinClause = schema.hasDocumentMembers
    ? `LEFT JOIN document_members m ON d.id = m.document_id AND m.user_id = ${userParam}`
    : "";
  const visibilityClause = schema.hasDocumentMembers
    ? `(d.owner_id = ${userParam} OR m.user_id = ${userParam})`
    : `d.owner_id = ${userParam}`;
  const starJoin = schema.hasStarredDocuments
    ? `LEFT JOIN starred_documents s ON d.id = s.document_id AND s.user_id = ${userParam}`
    : "";
  const starSelect = schema.hasStarredDocuments
    ? "COALESCE(s.document_id IS NOT NULL, false) AS is_starred"
    : "FALSE AS is_starred";
  const workspaceClause = schema.hasWorkspaceId ? `AND d.workspace_id = ${workspaceParam}` : "";
  const workspaceSelect = schema.hasWorkspaceId ? "d.workspace_id" : `${workspaceParam} AS workspace_id`;
  const deletedClause = schema.hasDeletedAt ? "AND d.deleted_at IS NULL" : "";

  const { rows } = await db.query(
    `
      SELECT d.id, d.title, d.updated_at, d.owner_id, ${workspaceSelect}, ${starSelect}
      FROM documents d
      ${joinClause}
      ${starJoin}
      WHERE ${visibilityClause}
      ${workspaceClause}
      ${deletedClause}
      ORDER BY d.updated_at DESC
    `,
    params
  );

  return rows.map(mapDocumentSummaryRow);
};

export const getDocumentById = async (
  id: string,
  workspaceId: string,
  userId: string,
  options?: { bypassAccessCheck?: boolean }
): Promise<DocumentModel | null> => {
  const schema = await getDocumentSchemaInfo();
  const { params, addParam } = createParamBuilder();
  const idParam = addParam(id);
  const userParam = addParam(userId);
  const workspaceParam = addParam(workspaceId);
  const bypassAccessCheck = Boolean(options?.bypassAccessCheck);

  const joinClause = schema.hasDocumentMembers
    ? `LEFT JOIN document_members m ON d.id = m.document_id AND m.user_id = ${userParam}`
    : "";
  const visibilityClause = bypassAccessCheck
    ? "TRUE"
    : schema.hasDocumentMembers
      ? `(d.owner_id = ${userParam} OR m.user_id = ${userParam})`
      : `d.owner_id = ${userParam}`;
  const starJoin = schema.hasStarredDocuments
    ? `LEFT JOIN starred_documents s ON d.id = s.document_id AND s.user_id = ${userParam}`
    : "";
  const starSelect = schema.hasStarredDocuments
    ? "COALESCE(s.document_id IS NOT NULL, false) AS is_starred"
    : "FALSE AS is_starred";
  const workspaceClause = schema.hasWorkspaceId ? `AND d.workspace_id = ${workspaceParam}` : "";
  const workspaceSelect = schema.hasWorkspaceId ? "d.workspace_id" : `${workspaceParam} AS workspace_id`;
  const deletedClause = schema.hasDeletedAt ? "AND d.deleted_at IS NULL" : "";

  const { rows } = await db.query(
    `
      SELECT d.id, d.title, d.content, d.updated_at, d.owner_id, ${workspaceSelect}, ${starSelect}
      FROM documents d
      ${joinClause}
      ${starJoin}
      WHERE d.id = ${idParam}
        AND ${visibilityClause}
      ${workspaceClause}
      ${deletedClause}
      LIMIT 1
    `,
    params
  );

  if (rows.length === 0) {
    return null;
  }

  return mapDocumentRow(rows[0]);
};

export const createDocument = async (payload: {
  id: string;
  title: string;
  content: TipTapContent;
  ownerId: string;
  workspaceId: string;
}): Promise<DocumentModel> => {
  const schema = await getDocumentSchemaInfo();
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const { params, addParam } = createParamBuilder();
    const columns: string[] = [];
    const values: string[] = [];

    const addColumn = (name: string, value: unknown, cast?: string) => {
      columns.push(name);
      const param = addParam(value);
      values.push(cast ? `${param}::${cast}` : param);
    };

    addColumn("id", payload.id);
    addColumn("title", payload.title);
    addColumn("content", JSON.stringify(payload.content), schema.contentType === "jsonb" ? "jsonb" : undefined);
    addColumn("owner_id", payload.ownerId);
    if (schema.hasWorkspaceId) {
      addColumn("workspace_id", payload.workspaceId);
    }
    columns.push("updated_at");
    values.push("NOW()");

    const returningFields = schema.hasWorkspaceId
      ? "id, title, content, updated_at, owner_id, workspace_id"
      : "id, title, content, updated_at, owner_id";

    const { rows } = await client.query(
      `
        INSERT INTO documents (${columns.join(", ")})
        VALUES (${values.join(", ")})
        RETURNING ${returningFields}
      `,
      params
    );

    if (schema.hasDocumentMembers) {
      await client.query(
        `
          INSERT INTO document_members (document_id, user_id, role)
          VALUES ($1, $2, $3)
          ON CONFLICT (document_id, user_id) DO NOTHING
        `,
        [payload.id, payload.ownerId, "owner"]
      );
    }

    await client.query("COMMIT");
    const document = mapDocumentRow(rows[0]);
    if (!schema.hasWorkspaceId) {
      document.workspaceId = payload.workspaceId;
    }
    return document;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const updateDocument = async (payload: {
  id: string;
  workspaceId: string;
  title?: string;
  content?: TipTapContent;
}): Promise<DocumentModel | null> => {
  const schema = await getDocumentSchemaInfo();
  const { params, addParam } = createParamBuilder();
  const idParam = addParam(payload.id);
  const titleParam = addParam(payload.title ?? null);
  const contentParam = addParam(payload.content ? JSON.stringify(payload.content) : null);
  const contentExpression = schema.contentType === "jsonb" ? `${contentParam}::jsonb` : contentParam;
  let workspaceClause = "";
  if (schema.hasWorkspaceId) {
    const workspaceParam = addParam(payload.workspaceId);
    workspaceClause = `AND workspace_id = ${workspaceParam}`;
  }
  const deletedClause = schema.hasDeletedAt ? "AND deleted_at IS NULL" : "";
  const returningFields = schema.hasWorkspaceId
    ? "id, title, content, updated_at, owner_id, workspace_id"
    : "id, title, content, updated_at, owner_id";

  const { rows } = await db.query(
    `
      UPDATE documents
      SET title = COALESCE(${titleParam}, title),
          content = COALESCE(${contentExpression}, content),
          updated_at = NOW()
      WHERE id = ${idParam}
      ${workspaceClause}
      ${deletedClause}
      RETURNING ${returningFields}
    `,
    params
  );

  if (rows.length === 0) {
    return null;
  }

  const document = mapDocumentRow(rows[0]);
  if (!schema.hasWorkspaceId) {
    document.workspaceId = payload.workspaceId;
  }
  return document;
};

export const toggleStarDocument = async (
  documentId: string,
  userId: string
): Promise<{ isStarred: boolean }> => {
  const schema = await getDocumentSchemaInfo();
  if (!schema.hasStarredDocuments) {
    throw new Error("Starred documents table is not available.");
  }

  const { params, addParam } = createParamBuilder();
  const documentParam = addParam(documentId);
  const userParam = addParam(userId);

  const { rows } = await db.query(
    `
      SELECT 1
      FROM starred_documents
      WHERE document_id = ${documentParam}
        AND user_id = ${userParam}
      LIMIT 1
    `,
    params
  );

  if (rows.length > 0) {
    await db.query(
      `
        DELETE FROM starred_documents
        WHERE document_id = ${documentParam}
          AND user_id = ${userParam}
      `,
      params
    );
    return { isStarred: false };
  }

  await db.query(
    `
      INSERT INTO starred_documents (document_id, user_id)
      VALUES (${documentParam}, ${userParam})
      ON CONFLICT (document_id, user_id) DO NOTHING
    `,
    params
  );

  return { isStarred: true };
};

export const getStarredDocuments = async (
  workspaceId: string,
  userId: string
): Promise<DocumentSummary[]> => {
  const schema = await getDocumentSchemaInfo();
  if (!schema.hasStarredDocuments) {
    return [];
  }

  const { params, addParam } = createParamBuilder();
  const userParam = addParam(userId);
  const workspaceParam = addParam(workspaceId);

  const joinClause = schema.hasDocumentMembers
    ? `LEFT JOIN document_members m ON d.id = m.document_id AND m.user_id = ${userParam}`
    : "";
  const visibilityClause = schema.hasDocumentMembers
    ? `(d.owner_id = ${userParam} OR m.user_id = ${userParam})`
    : `d.owner_id = ${userParam}`;
  const workspaceClause = schema.hasWorkspaceId ? `AND d.workspace_id = ${workspaceParam}` : "";
  const workspaceSelect = schema.hasWorkspaceId ? "d.workspace_id" : `${workspaceParam} AS workspace_id`;
  const deletedClause = schema.hasDeletedAt ? "AND d.deleted_at IS NULL" : "";

  const { rows } = await db.query(
    `
      SELECT d.id, d.title, d.updated_at, d.owner_id, ${workspaceSelect}, TRUE AS is_starred
      FROM documents d
      JOIN starred_documents s ON d.id = s.document_id AND s.user_id = ${userParam}
      ${joinClause}
      WHERE ${visibilityClause}
      ${workspaceClause}
      ${deletedClause}
      ORDER BY d.updated_at DESC
    `,
    params
  );

  return rows.map(mapDocumentSummaryRow);
};

export const listSharedDocuments = async (
  workspaceId: string,
  userId: string
): Promise<DocumentSummary[]> => {
  const schema = await getDocumentSchemaInfo();
  if (!schema.hasDocumentMembers) {
    return [];
  }

  const { params, addParam } = createParamBuilder();
  const userParam = addParam(userId);
  const workspaceParam = addParam(workspaceId);
  const workspaceClause = schema.hasWorkspaceId ? `AND d.workspace_id = ${workspaceParam}` : "";
  const workspaceSelect = schema.hasWorkspaceId ? "d.workspace_id" : `${workspaceParam} AS workspace_id`;
  const starJoin = schema.hasStarredDocuments
    ? `LEFT JOIN starred_documents s ON d.id = s.document_id AND s.user_id = ${userParam}`
    : "";
  const starSelect = schema.hasStarredDocuments
    ? "COALESCE(s.document_id IS NOT NULL, false) AS is_starred"
    : "FALSE AS is_starred";
  const deletedClause = schema.hasDeletedAt ? "AND d.deleted_at IS NULL" : "";

  const { rows } = await db.query(
    `
      SELECT d.id, d.title, d.updated_at, d.owner_id, ${workspaceSelect}, ${starSelect}
      FROM documents d
      JOIN document_members m
        ON d.id = m.document_id
       AND m.user_id = ${userParam}
      ${starJoin}
      WHERE d.owner_id <> ${userParam}
      ${workspaceClause}
      ${deletedClause}
      ORDER BY d.updated_at DESC
    `,
    params
  );

  return rows.map(mapDocumentSummaryRow);
};

export const moveToTrash = async (
  documentId: string,
  workspaceId: string,
  userId: string
): Promise<boolean> => {
  const schema = await getDocumentSchemaInfo();
  if (!schema.hasDeletedAt) {
    throw new Error("Soft delete is not available. Run the latest migrations.");
  }

  const { params, addParam } = createParamBuilder();
  const idParam = addParam(documentId);
  const userParam = addParam(userId);
  let workspaceClause = "";
  if (schema.hasWorkspaceId) {
    const workspaceParam = addParam(workspaceId);
    workspaceClause = `AND d.workspace_id = ${workspaceParam}`;
  }
  const visibilityClause = buildVisibilityClause(schema, userParam);

  const result = await db.query(
    `
      UPDATE documents d
      SET deleted_at = NOW()
      WHERE d.id = ${idParam}
        AND ${visibilityClause}
      ${workspaceClause}
    `,
    params
  );

  return (result.rowCount ?? 0) > 0;
};

export const restoreFromTrash = async (
  documentId: string,
  workspaceId: string,
  userId: string
): Promise<boolean> => {
  const schema = await getDocumentSchemaInfo();
  if (!schema.hasDeletedAt) {
    throw new Error("Soft delete is not available. Run the latest migrations.");
  }

  const { params, addParam } = createParamBuilder();
  const idParam = addParam(documentId);
  const userParam = addParam(userId);
  let workspaceClause = "";
  if (schema.hasWorkspaceId) {
    const workspaceParam = addParam(workspaceId);
    workspaceClause = `AND d.workspace_id = ${workspaceParam}`;
  }
  const visibilityClause = buildVisibilityClause(schema, userParam);

  const result = await db.query(
    `
      UPDATE documents d
      SET deleted_at = NULL
      WHERE d.id = ${idParam}
        AND ${visibilityClause}
      ${workspaceClause}
    `,
    params
  );

  return (result.rowCount ?? 0) > 0;
};

export const permanentlyDeleteDocument = async (
  documentId: string,
  workspaceId: string,
  userId: string
): Promise<boolean> => {
  const schema = await getDocumentSchemaInfo();
  if (!schema.hasDeletedAt) {
    throw new Error("Soft delete is not available. Run the latest migrations.");
  }

  const { params, addParam } = createParamBuilder();
  const idParam = addParam(documentId);
  const userParam = addParam(userId);
  let workspaceClause = "";
  if (schema.hasWorkspaceId) {
    const workspaceParam = addParam(workspaceId);
    workspaceClause = `AND d.workspace_id = ${workspaceParam}`;
  }

  const result = await db.query(
    `
      DELETE FROM documents d
      WHERE d.id = ${idParam}
        AND d.owner_id = ${userParam}
        AND d.deleted_at IS NOT NULL
      ${workspaceClause}
    `,
    params
  );

  return (result.rowCount ?? 0) > 0;
};

export const getTrashDocuments = async (
  workspaceId: string,
  userId: string
): Promise<DocumentSummary[]> => {
  const schema = await getDocumentSchemaInfo();
  if (!schema.hasDeletedAt) {
    throw new Error("Soft delete is not available. Run the latest migrations.");
  }

  const { params, addParam } = createParamBuilder();
  const userParam = addParam(userId);
  const workspaceParam = addParam(workspaceId);

  const joinClause = schema.hasDocumentMembers
    ? `LEFT JOIN document_members m ON d.id = m.document_id AND m.user_id = ${userParam}`
    : "";
  const visibilityClause = schema.hasDocumentMembers
    ? `(d.owner_id = ${userParam} OR m.user_id = ${userParam})`
    : `d.owner_id = ${userParam}`;
  const starJoin = schema.hasStarredDocuments
    ? `LEFT JOIN starred_documents s ON d.id = s.document_id AND s.user_id = ${userParam}`
    : "";
  const starSelect = schema.hasStarredDocuments
    ? "COALESCE(s.document_id IS NOT NULL, false) AS is_starred"
    : "FALSE AS is_starred";
  const workspaceClause = schema.hasWorkspaceId ? `AND d.workspace_id = ${workspaceParam}` : "";
  const workspaceSelect = schema.hasWorkspaceId ? "d.workspace_id" : `${workspaceParam} AS workspace_id`;

  const { rows } = await db.query(
    `
      SELECT d.id, d.title, d.updated_at, d.owner_id, ${workspaceSelect}, ${starSelect}
      FROM documents d
      ${joinClause}
      ${starJoin}
      WHERE ${visibilityClause}
        AND d.deleted_at IS NOT NULL
      ${workspaceClause}
      ORDER BY d.deleted_at DESC
    `,
    params
  );

  return rows.map(mapDocumentSummaryRow);
};

export const emptyTrash = async (workspaceId: string, userId: string): Promise<number> => {
  const schema = await getDocumentSchemaInfo();
  if (!schema.hasDeletedAt) {
    throw new Error("Soft delete is not available. Run the latest migrations.");
  }

  const { params, addParam } = createParamBuilder();
  const userParam = addParam(userId);
  let workspaceClause = "";
  if (schema.hasWorkspaceId) {
    const workspaceParam = addParam(workspaceId);
    workspaceClause = `AND d.workspace_id = ${workspaceParam}`;
  }

  const result = await db.query(
    `
      DELETE FROM documents d
      WHERE d.owner_id = ${userParam}
        AND d.deleted_at IS NOT NULL
      ${workspaceClause}
    `,
    params
  );

  return result.rowCount ?? 0;
};
