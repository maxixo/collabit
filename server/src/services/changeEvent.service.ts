import { db } from "../config/db.js";
import type { ChangeEvent, ChangeEventInput, PendingChangesSummary } from "../types/index.js";
import { logger } from "../utils/logger.js";

export const createChangeEvent = async (
  input: ChangeEventInput
): Promise<ChangeEvent> => {
  const { documentId, userId, changeType, content, position, workspaceId } = input;
  
  logger.info(`[ChangeEvent] 💾 Tracking change: type=${changeType}, doc=${documentId}, user=${userId}`);
  
  const result = await db.query(
    `INSERT INTO document_change_events 
       (document_id, user_id, change_type, content, position, workspace_id) 
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING
         id,
         document_id as "documentId",
         user_id as "userId",
         change_type as "changeType",
         content,
         position,
         created_at as "createdAt",
         applied,
         workspace_id as "workspaceId"`,
    [documentId, userId, changeType, JSON.stringify(content), position, workspaceId]
  );
  
  const changeEvent = result.rows[0] as ChangeEvent;
  logger.info(`[ChangeEvent] ✅ Change event created: id=${changeEvent.id}, type=${changeType}`);
  
  return changeEvent;
};

export const getPendingChanges = async (
  documentId: string,
  workspaceId: string
): Promise<PendingChangesSummary[]> => {
  const result = await db.query(
    `SELECT 
       user_id as "userId",
       COUNT(*)::int as "changeCount",
       MIN(created_at) as "firstChange",
       MAX(created_at) as "lastChange",
       array_agg(change_type ORDER BY created_at DESC) as "changeTypes"
     FROM document_change_events
     WHERE document_id = $1 
       AND workspace_id = $2
       AND applied = FALSE
     GROUP BY user_id
     ORDER BY "lastChange" DESC`,
    [documentId, workspaceId]
  );
  
  return result.rows as PendingChangesSummary[];
};

export const getDetailedPendingChanges = async (
  documentId: string,
  userId: string,
  workspaceId: string
): Promise<ChangeEvent[]> => {
  const result = await db.query(
    `SELECT
       id,
       document_id as "documentId",
       user_id as "userId",
       change_type as "changeType",
       content,
       position,
       created_at as "createdAt",
       applied,
       workspace_id as "workspaceId"
     FROM document_change_events
     WHERE document_id = $1 
       AND user_id = $2
       AND workspace_id = $3
       AND applied = FALSE
     ORDER BY created_at DESC`,
    [documentId, userId, workspaceId]
  );
  
  return result.rows as ChangeEvent[];
};

export const markChangesApplied = async (
  documentId: string,
  userId: string,
  workspaceId: string
): Promise<number> => {
  const result = await db.query(
    `UPDATE document_change_events
     SET applied = TRUE
     WHERE document_id = $1 
       AND user_id = $2
       AND workspace_id = $3
       AND applied = FALSE`,
    [documentId, userId, workspaceId]
  );
  
  return result.rowCount || 0;
};

export const markAllChangesApplied = async (
  documentId: string,
  workspaceId: string
): Promise<number> => {
  const result = await db.query(
    `UPDATE document_change_events
     SET applied = TRUE
     WHERE document_id = $1 
       AND workspace_id = $2
       AND applied = FALSE`,
    [documentId, workspaceId]
  );
  
  return result.rowCount || 0;
};

export const cleanupOldChanges = async (
  daysOld: number = 90
): Promise<number> => {
  const safeDays = Number.isFinite(daysOld) ? Math.max(0, Math.trunc(daysOld)) : 90;
  const result = await db.query(
    `DELETE FROM document_change_events
     WHERE created_at < NOW() - ($1 * INTERVAL '1 day')`,
    [safeDays]
  );
  
  return result.rowCount || 0;
};
