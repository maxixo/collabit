import { db } from "../config/db.js";
import type { PoolClient } from "pg";
import type { SuggestionMetadata } from "@shared/types.js";
import { getUserById } from "./user.service.js";

export type SuggestionType = "insert" | "delete" | "replace" | "format";
export type SuggestionStatus = "pending" | "accepted" | "rejected";

export interface SuggestionRecord {
  id: string;
  documentId: string;
  workspaceId: string;
  authorUserId: string;
  suggestionType: SuggestionType;
  status: SuggestionStatus;
  from: number;
  to: number;
  originalText: string | null;
  suggestedText: string | null;
  metadata: SuggestionMetadata;
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  author?: {
    id: string;
    displayName?: string;
    email?: string;
    image?: string | null;
  };
}

export interface SuggestionInput {
  documentId: string;
  workspaceId: string;
  authorUserId: string;
  suggestionType: SuggestionType;
  from: number;
  to: number;
  originalText?: string | null;
  suggestedText?: string | null;
  metadata?: SuggestionMetadata;
}

export interface SuggestionBatchSummary {
  userId: string;
  changeCount: number;
  firstChange: string;
  lastChange: string;
  changeTypes: string[];
  user?: {
    id: string;
    displayName?: string;
    email?: string;
    image?: string | null;
  };
}

type DbClient = Pick<PoolClient, "query">;

const mapSuggestionRow = (row: Record<string, unknown>): SuggestionRecord => ({
  id: String(row.id ?? ""),
  documentId: String(row.documentId ?? row.document_id ?? ""),
  workspaceId: String(row.workspaceId ?? row.workspace_id ?? ""),
  authorUserId: String(row.authorUserId ?? row.author_user_id ?? ""),
  suggestionType: String(row.suggestionType ?? row.suggestion_type ?? "insert") as SuggestionType,
  status: String(row.status ?? "pending") as SuggestionStatus,
  from: Number(row.from ?? row.from_pos ?? 0),
  to: Number(row.to ?? row.to_pos ?? 0),
  originalText: typeof row.originalText === "string" ? row.originalText : typeof row.original_text === "string" ? row.original_text : null,
  suggestedText: typeof row.suggestedText === "string" ? row.suggestedText : typeof row.suggested_text === "string" ? row.suggested_text : null,
  metadata: typeof row.metadata === "object" && row.metadata !== null ? (row.metadata as SuggestionMetadata) : {},
  createdAt:
    row.createdAt instanceof Date
      ? row.createdAt.toISOString()
      : row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.createdAt ?? row.created_at ?? new Date().toISOString()),
  resolvedAt:
    row.resolvedAt instanceof Date
      ? row.resolvedAt.toISOString()
      : row.resolved_at instanceof Date
        ? row.resolved_at.toISOString()
        : typeof row.resolvedAt === "string"
          ? row.resolvedAt
          : typeof row.resolved_at === "string"
            ? row.resolved_at
            : null,
  resolvedBy: typeof row.resolvedBy === "string" ? row.resolvedBy : typeof row.resolved_by === "string" ? row.resolved_by : null
});

const enrichSuggestion = async (record: SuggestionRecord): Promise<SuggestionRecord> => {
  const author = await getUserById(record.authorUserId).catch(() => null);
  if (!author) {
    return record;
  }
  return {
    ...record,
    author: {
      id: author.id,
      displayName: author.displayName,
      email: author.email,
      image: author.image
    }
  };
};

export const createSuggestion = async (input: SuggestionInput, client?: DbClient): Promise<SuggestionRecord> => {
  const executor = client ?? db;
  const result = await executor.query(
    `INSERT INTO document_suggestions (
       document_id,
       workspace_id,
       author_user_id,
       suggestion_type,
       from_pos,
       to_pos,
       original_text,
       suggested_text,
       metadata
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING
       id,
       document_id as "documentId",
       workspace_id as "workspaceId",
       author_user_id as "authorUserId",
       suggestion_type as "suggestionType",
       status,
       from_pos as "from",
       to_pos as "to",
       original_text as "originalText",
       suggested_text as "suggestedText",
       metadata,
       created_at as "createdAt",
       resolved_at as "resolvedAt",
       resolved_by as "resolvedBy"`,
    [
      input.documentId,
      input.workspaceId,
      input.authorUserId,
      input.suggestionType,
      input.from,
      input.to,
      input.originalText ?? null,
      input.suggestedText ?? null,
      JSON.stringify(input.metadata ?? {})
    ]
  );

  return enrichSuggestion(mapSuggestionRow(result.rows[0] as Record<string, unknown>));
};

export const listSuggestions = async (
  documentId: string,
  workspaceId: string,
  status: SuggestionStatus | "all" = "pending"
): Promise<SuggestionRecord[]> => {
  const params: Array<string> = [documentId, workspaceId];
  const filters = ["document_id = $1", "workspace_id = $2"];

  if (status !== "all") {
    params.push(status);
    filters.push(`status = $${params.length}`);
  }

  const result = await db.query(
    `SELECT
       id,
       document_id as "documentId",
       workspace_id as "workspaceId",
       author_user_id as "authorUserId",
       suggestion_type as "suggestionType",
       status,
       from_pos as "from",
       to_pos as "to",
       original_text as "originalText",
       suggested_text as "suggestedText",
       metadata,
       created_at as "createdAt",
       resolved_at as "resolvedAt",
       resolved_by as "resolvedBy"
     FROM document_suggestions
     WHERE ${filters.join(" AND ")}
     ORDER BY created_at DESC`,
    params
  );

  return Promise.all(result.rows.map((row) => enrichSuggestion(mapSuggestionRow(row as Record<string, unknown>))));
};

export const getSuggestionById = async (
  suggestionId: string,
  documentId: string,
  workspaceId: string
): Promise<SuggestionRecord | null> => {
  const result = await db.query(
    `SELECT
       id,
       document_id as "documentId",
       workspace_id as "workspaceId",
       author_user_id as "authorUserId",
       suggestion_type as "suggestionType",
       status,
       from_pos as "from",
       to_pos as "to",
       original_text as "originalText",
       suggested_text as "suggestedText",
       metadata,
       created_at as "createdAt",
       resolved_at as "resolvedAt",
       resolved_by as "resolvedBy"
     FROM document_suggestions
     WHERE id = $1 AND document_id = $2 AND workspace_id = $3
     LIMIT 1`,
    [suggestionId, documentId, workspaceId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return enrichSuggestion(mapSuggestionRow(result.rows[0] as Record<string, unknown>));
};

const resolveSuggestions = async (
  suggestionIds: string[],
  documentId: string,
  workspaceId: string,
  status: Exclude<SuggestionStatus, "pending">,
  resolvedBy: string
): Promise<SuggestionRecord[]> => {
  if (suggestionIds.length === 0) {
    return [];
  }

  const result = await db.query(
    `UPDATE document_suggestions
     SET status = $1,
         resolved_at = NOW(),
         resolved_by = $2
     WHERE id = ANY($3::uuid[])
       AND document_id = $4
       AND workspace_id = $5
       AND status = 'pending'
     RETURNING
       id,
       document_id as "documentId",
       workspace_id as "workspaceId",
       author_user_id as "authorUserId",
       suggestion_type as "suggestionType",
       status,
       from_pos as "from",
       to_pos as "to",
       original_text as "originalText",
       suggested_text as "suggestedText",
       metadata,
       created_at as "createdAt",
       resolved_at as "resolvedAt",
       resolved_by as "resolvedBy"`,
    [status, resolvedBy, suggestionIds, documentId, workspaceId]
  );

  return Promise.all(result.rows.map((row) => enrichSuggestion(mapSuggestionRow(row as Record<string, unknown>))));
};

export const acceptSuggestions = async (
  suggestionIds: string[],
  documentId: string,
  workspaceId: string,
  resolvedBy: string
) => resolveSuggestions(suggestionIds, documentId, workspaceId, "accepted", resolvedBy);

export const rejectSuggestions = async (
  suggestionIds: string[],
  documentId: string,
  workspaceId: string,
  resolvedBy: string
) => resolveSuggestions(suggestionIds, documentId, workspaceId, "rejected", resolvedBy);

export const resolveSuggestionsByAuthor = async (
  authorUserIds: string[],
  documentId: string,
  workspaceId: string,
  status: Exclude<SuggestionStatus, "pending">,
  resolvedBy: string
): Promise<number> => {
  if (authorUserIds.length === 0) {
    return 0;
  }

  const result = await db.query(
    `UPDATE document_suggestions
     SET status = $1,
         resolved_at = NOW(),
         resolved_by = $2
     WHERE author_user_id = ANY($3::text[])
       AND document_id = $4
       AND workspace_id = $5
       AND status = 'pending'`,
    [status, resolvedBy, authorUserIds, documentId, workspaceId]
  );

  return result.rowCount ?? 0;
};

export const getPendingSuggestionSummary = async (
  documentId: string,
  workspaceId: string
): Promise<SuggestionBatchSummary[]> => {
  const result = await db.query(
    `SELECT
       author_user_id as "userId",
       COUNT(*)::int as "changeCount",
       MIN(created_at) as "firstChange",
       MAX(created_at) as "lastChange",
       array_agg(suggestion_type ORDER BY created_at DESC) as "changeTypes"
     FROM document_suggestions
     WHERE document_id = $1
       AND workspace_id = $2
       AND status = 'pending'
     GROUP BY author_user_id
     ORDER BY "lastChange" DESC`,
    [documentId, workspaceId]
  );

  return Promise.all(
    result.rows.map(async (row) => {
      const userId = String(row.userId ?? "");
      const user = await getUserById(userId).catch(() => null);
      return {
        userId,
        changeCount: Number(row.changeCount ?? 0),
        firstChange:
          row.firstChange instanceof Date ? row.firstChange.toISOString() : String(row.firstChange ?? new Date().toISOString()),
        lastChange:
          row.lastChange instanceof Date ? row.lastChange.toISOString() : String(row.lastChange ?? new Date().toISOString()),
        changeTypes: Array.isArray(row.changeTypes) ? row.changeTypes.map((value: unknown) => String(value)) : [],
        user: user
          ? {
              id: user.id,
              displayName: user.displayName,
              email: user.email,
              image: user.image
            }
          : undefined
      } satisfies SuggestionBatchSummary;
    })
  );
};
