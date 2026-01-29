import { db } from "../config/db.js";
import type { DocumentModel, DocumentSummary, TipTapContent } from "../models/document.model.js";
import { mapDocumentRow, mapDocumentSummaryRow } from "../models/document.model.js";
import { getDocumentSchemaInfo } from "./documentSchema.service.js";

const createParamBuilder = () => {
  const params: Array<unknown> = [];
  const addParam = <T>(value: T) => {
    params.push(value);
    return `$${params.length}`;
  };

  return { params, addParam };
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

  const { rows } = await db.query(
    `
      SELECT d.id, d.title, d.updated_at, d.owner_id, ${workspaceSelect}, ${starSelect}
      FROM documents d
      ${joinClause}
      ${starJoin}
      WHERE ${visibilityClause}
      ${workspaceClause}
      ORDER BY d.updated_at DESC
    `,
    params
  );

  return rows.map(mapDocumentSummaryRow);
};

export const getDocumentById = async (
  id: string,
  workspaceId: string,
  userId: string
): Promise<DocumentModel | null> => {
  const schema = await getDocumentSchemaInfo();
  const { params, addParam } = createParamBuilder();
  const idParam = addParam(id);
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
      SELECT d.id, d.title, d.content, d.updated_at, d.owner_id, ${workspaceSelect}, ${starSelect}
      FROM documents d
      ${joinClause}
      ${starJoin}
      WHERE d.id = ${idParam}
        AND ${visibilityClause}
      ${workspaceClause}
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

  const { rows } = await db.query(
    `
      SELECT d.id, d.title, d.updated_at, d.owner_id, ${workspaceSelect}, TRUE AS is_starred
      FROM documents d
      JOIN starred_documents s ON d.id = s.document_id AND s.user_id = ${userParam}
      ${joinClause}
      WHERE ${visibilityClause}
      ${workspaceClause}
      ORDER BY d.updated_at DESC
    `,
    params
  );

  return rows.map(mapDocumentSummaryRow);
};
