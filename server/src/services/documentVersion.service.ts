import { db } from "../config/db.js";
import { logger } from "../utils/logger.js";

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
 * Get all versions of a document
 */
export const getDocumentVersions = async (
  documentId: string,
  workspaceId: string
): Promise<DocumentVersion[]> => {
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
    WHERE document_id = $1 AND workspace_id = $2
    ORDER BY version_number DESC
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
  workspaceId: string
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

  const result = await db.query(query, [documentId, versionNumber, workspaceId]);
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
  workspaceId: string
): Promise<DocumentVersion> => {
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    // Get the next version number
    const versionQuery = `
      SELECT COALESCE(MAX(version_number), 0) as max_version
      FROM document_versions
      WHERE document_id = $1
    `;
    const versionResult = await client.query(versionQuery, [documentId]);
    const nextVersionNumber = (versionResult.rows[0].max_version || 0) + 1;

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

    await client.query("COMMIT");
    return result.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error("Failed to create document version", error);
    throw error;
  } finally {
    client.release();
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
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    // Get the version to restore
    const version = await getDocumentVersion(documentId, versionNumber, workspaceId);
    if (!version) {
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
      workspaceId
    );

    await client.query("COMMIT");
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