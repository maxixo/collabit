import { db } from "../config/db.js";

export type DocumentMember = { userId: string; role: "viewer" | "editor" };

export const listDocumentMembers = async (documentId: string, workspaceId: string) => {
  const result = await db.query(
    `SELECT m.user_id AS "userId", m.role
     FROM document_members m JOIN documents d ON d.id=m.document_id
     WHERE m.document_id=$1 AND d.workspace_id=$2 AND d.deleted_at IS NULL
     ORDER BY m.user_id`, [documentId, workspaceId]);
  return result.rows as DocumentMember[];
};

export const updateDocumentMemberRole = async (documentId: string, workspaceId: string, userId: string, role: "viewer" | "editor") => {
  const result = await db.query(
    `UPDATE document_members m SET role=$4
     FROM documents d WHERE m.document_id=$1 AND m.user_id=$3 AND d.id=m.document_id
       AND d.workspace_id=$2 AND d.deleted_at IS NULL
     RETURNING m.user_id AS "userId", m.role`, [documentId, workspaceId, userId, role]);
  return (result.rows[0] as DocumentMember | undefined) ?? null;
};

export const removeDocumentMember = async (documentId: string, workspaceId: string, userId: string) => {
  const result = await db.query(
    `DELETE FROM document_members m USING documents d
     WHERE m.document_id=$1 AND m.user_id=$3 AND d.id=m.document_id
       AND d.workspace_id=$2 AND d.deleted_at IS NULL`, [documentId, workspaceId, userId]);
  return (result.rowCount ?? 0) > 0;
};
