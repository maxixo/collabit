import { db } from "../config/db.js";
import { logger } from "../utils/logger.js";
import type { PoolClient } from "pg";
import { getUserSchemaInfo, type UserSchemaInfo } from "./userSchema.service.js";

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

type DbClient = Pick<PoolClient, "query">;

const quoteIdentifier = (value: string) => `"${value.replace(/"/g, "\"\"")}"`;

const resolveUserIdColumn = (schema: UserSchemaInfo) => {
  if (schema.columns.has("id")) {
    return "id";
  }
  if (schema.columns.has("user_id")) {
    return "user_id";
  }
  return "";
};

const buildUserJoinQueryParts = async () => {
  try {
    const schema = await getUserSchemaInfo();
    const userIdColumn = resolveUserIdColumn(schema);
    if (!userIdColumn) {
      return {
        joinClause: "",
        createdByNameSelect: "dv.created_by as \"createdByName\""
      };
    }

    const nameCandidates = ["display_name", "displayName", "name", "full_name"];
    const displayNameExpressions: string[] = [];

    for (const candidate of nameCandidates) {
      if (schema.columns.has(candidate)) {
        displayNameExpressions.push(`NULLIF(TRIM(u.${quoteIdentifier(candidate)}::text), '')`);
      }
    }

    if (schema.columns.has("email")) {
      displayNameExpressions.push(`NULLIF(split_part(u.${quoteIdentifier("email")}::text, '@', 1), '')`);
    }

    return {
      joinClause: `LEFT JOIN ${schema.tableIdentifier} u ON u.${quoteIdentifier(userIdColumn)}::text = dv.created_by`,
      createdByNameSelect: `COALESCE(${displayNameExpressions.join(", ") || "NULL"}, dv.created_by) as "createdByName"`
    };
  } catch {
    return {
      joinClause: "",
      createdByNameSelect: "dv.created_by as \"createdByName\""
    };
  }
};

const insertDocumentVersion = async (
  client: DbClient,
  documentId: string,
  title: string,
  content: Record<string, unknown>,
  createdBy: string,
  workspaceId: string
): Promise<DocumentVersion> => {
  // Get the next version number
  const versionQuery = `
    SELECT COALESCE(MAX(version_number), 0) as max_version
    FROM document_versions
    WHERE document_id = $1
  `;
  const versionResult = await client.query(versionQuery, [documentId]);
  const nextVersionNumber = (versionResult.rows[0].max_version || 0) + 1;

  logger.debug(`[DocumentVersion] Next version number: ${nextVersionNumber}`);

  // Insert the new version
  const insertQuery = `
    INSERT INTO document_versions (
      document_id,
      version_number,
      title,
      content,
      created_by,
      workspace_id
    )
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING 
      id,
      document_id as "documentId",
      version_number as "versionNumber",
      title,
      content,
      created_by as "createdBy",
      created_at as "createdAt",
      workspace_id as "workspaceId"
  `;

  const result = await client.query(insertQuery, [
    documentId,
    nextVersionNumber,
    title,
    JSON.stringify(content),
    createdBy,
    workspaceId
  ]);

  return result.rows[0];
};

/**
 * Get all versions of a document
 */
export const getDocumentVersions = async (
  documentId: string,
  workspaceId: string
): Promise<DocumentVersion[]> => {
  const { joinClause, createdByNameSelect } = await buildUserJoinQueryParts();

  const query = `
    SELECT 
      dv.id,
      dv.document_id as "documentId",
      dv.version_number as "versionNumber",
      dv.title,
      dv.content,
      dv.created_by as "createdBy",
      ${createdByNameSelect},
      dv.created_at as "createdAt",
      dv.workspace_id as "workspaceId"
    FROM document_versions dv
    ${joinClause}
    WHERE dv.document_id = $1 AND dv.workspace_id = $2
    ORDER BY dv.version_number DESC
  `;

  const result = await db.query(query, [documentId, workspaceId]);
  return result.rows;
};

/**
 * Get a specific version of a document
 */
export const getDocumentVersion = async (
  documentId: string,
  versionNumber: number,
  workspaceId: string,
  client?: DbClient
): Promise<DocumentVersion | null> => {
  const query = `
    SELECT 
      id,
      document_id as "documentId",
      version_number as "versionNumber",
      title,
      content,
      created_by as "createdBy",
      created_at as "createdAt",
      workspace_id as "workspaceId"
    FROM document_versions
    WHERE document_id = $1 AND version_number = $2 AND workspace_id = $3
  `;

  const executor = client ?? db;
  const result = await executor.query(query, [documentId, versionNumber, workspaceId]);
  return result.rows[0] || null;
};

/**
 * Create a new version of a document
 */
export const createDocumentVersion = async (
  documentId: string,
  title: string,
  content: Record<string, unknown>,
  createdBy: string,
  workspaceId: string,
  client?: PoolClient
): Promise<DocumentVersion> => {
  logger.info(`[DocumentVersion] 📜 Creating version for doc=${documentId}, user=${createdBy}`);
  
  if (client) {
    return insertDocumentVersion(client, documentId, title, content, createdBy, workspaceId);
  }

  const poolClient = await db.connect();

  try {
    await poolClient.query("BEGIN");

    const version = await insertDocumentVersion(
      poolClient,
      documentId,
      title,
      content,
      createdBy,
      workspaceId
    );

    await poolClient.query("COMMIT");
    logger.info(`[DocumentVersion] ✅ Version ${version.versionNumber} created for ${documentId}`);
    return version;
  } catch (error) {
    await poolClient.query("ROLLBACK");
    logger.error("Failed to create document version", error);
    throw error;
  } finally {
    poolClient.release();
  }
};

/**
 * Restore a document to a specific version
 */
export const restoreDocumentVersion = async (
  documentId: string,
  versionNumber: number,
  workspaceId: string
): Promise<Record<string, unknown>> => {
  logger.info(`[DocumentVersion] 🔄 Restoring version ${versionNumber} for doc=${documentId}`);
  
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    // Get the version to restore
    const version = await getDocumentVersion(documentId, versionNumber, workspaceId, client);
    if (!version) {
      logger.error(`[DocumentVersion] ❌ Version ${versionNumber} not found for ${documentId}`);
      throw new Error("Version not found");
    }

    // Update the documents table with the restored content
    const updateQuery = `
      UPDATE documents
      SET content = $1, updated_at = NOW()
      WHERE id = $2 AND workspace_id = $3
      RETURNING id
    `;

    await client.query(updateQuery, [JSON.stringify(version.content), documentId, workspaceId]);

    // Create a new version for the restore action
    await createDocumentVersion(
      documentId,
      version.title,
      version.content,
      "system", // System-generated version
      workspaceId,
      client
    );

    await client.query("COMMIT");
    logger.info(`[DocumentVersion] ✅ Version ${versionNumber} restored for ${documentId}`);
    return version.content;
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error("Failed to restore document version", error);
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Delete old versions of a document (keep only the most recent N versions)
 */
export const deleteOldVersions = async (
  documentId: string,
  keepCount: number,
  workspaceId: string
): Promise<number> => {
  const query = `
    DELETE FROM document_versions
    WHERE id IN (
      SELECT id
      FROM document_versions
      WHERE document_id = $1 AND workspace_id = $2
      ORDER BY version_number DESC
      OFFSET $3
    )
  `;

  const result = await db.query(query, [documentId, workspaceId, keepCount]);
  return result.rowCount || 0;
};

