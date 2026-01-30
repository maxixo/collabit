import { randomUUID } from "crypto";
import type { ShareToken, ShareTokenOptions } from "@shared/types.js";
import { db } from "../config/db.js";

type ShareTokenRow = {
  id?: unknown;
  token?: unknown;
  document_id?: unknown;
  documentId?: unknown;
  created_by?: unknown;
  createdBy?: unknown;
  permission_level?: unknown;
  permissionLevel?: unknown;
  expiration_date?: unknown;
  expirationDate?: unknown;
  max_uses?: unknown;
  maxUses?: unknown;
  use_count?: unknown;
  useCount?: unknown;
  created_at?: unknown;
  createdAt?: unknown;
};

const PERMISSION_LEVELS = new Set(["viewer", "editor", "owner"]);

const parseTimestamp = (value: unknown): string | null => {
  if (typeof value === "string") {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return null;
};

const parseNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
};

const mapShareTokenRow = (row: ShareTokenRow): ShareToken => {
  const permission =
    typeof row.permissionLevel === "string"
      ? row.permissionLevel
      : typeof row.permission_level === "string"
        ? row.permission_level
        : "viewer";
  const permissionLevel = PERMISSION_LEVELS.has(permission) ? permission : "viewer";

  return {
    id: typeof row.id === "string" ? row.id : "",
    token: typeof row.token === "string" ? row.token : "",
    documentId:
      typeof row.documentId === "string"
        ? row.documentId
        : typeof row.document_id === "string"
          ? row.document_id
          : "",
    createdBy:
      typeof row.createdBy === "string"
        ? row.createdBy
        : typeof row.created_by === "string"
          ? row.created_by
          : "",
    permissionLevel,
    expirationDate: parseTimestamp(row.expirationDate ?? row.expiration_date),
    maxUses: parseNumber(row.maxUses ?? row.max_uses),
    useCount: parseNumber(row.useCount ?? row.use_count) ?? 0,
    createdAt: parseTimestamp(row.createdAt ?? row.created_at) ?? new Date().toISOString()
  };
};

export type ShareTokenValidationResult =
  | { valid: true; token: ShareToken }
  | { valid: false; reason: "not_found" | "expired" | "max_uses" };

export const generateShareToken = async (
  documentId: string,
  createdBy: string,
  options: ShareTokenOptions = {}
): Promise<ShareToken> => {
  const id = randomUUID();
  const token = randomUUID();
  const permissionLevel =
    options.permission && PERMISSION_LEVELS.has(options.permission)
      ? options.permission
      : "viewer";
  const expirationDate =
    typeof options.expiration === "string" && options.expiration.trim() === ""
      ? null
      : options.expiration ?? null;
  const maxUses =
    typeof options.maxUses === "number" && Number.isInteger(options.maxUses) && options.maxUses > 0
      ? options.maxUses
      : null;

  const { rows } = await db.query(
    `
      INSERT INTO share_tokens (
        id,
        token,
        document_id,
        created_by,
        permission_level,
        expiration_date,
        max_uses
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, token, document_id, created_by, permission_level, expiration_date, max_uses, use_count, created_at
    `,
    [id, token, documentId, createdBy, permissionLevel, expirationDate, maxUses]
  );

  return mapShareTokenRow(rows[0] as ShareTokenRow);
};

export const getShareTokenByToken = async (token: string): Promise<ShareToken | null> => {
  const { rows } = await db.query(
    `
      SELECT id, token, document_id, created_by, permission_level, expiration_date, max_uses, use_count, created_at
      FROM share_tokens
      WHERE token = $1
      LIMIT 1
    `,
    [token]
  );

  if (rows.length === 0) {
    return null;
  }

  return mapShareTokenRow(rows[0] as ShareTokenRow);
};

export const validateShareToken = async (token: string): Promise<ShareTokenValidationResult> => {
  const shareToken = await getShareTokenByToken(token);

  if (!shareToken) {
    return { valid: false, reason: "not_found" };
  }

  if (shareToken.expirationDate) {
    const expiresAt = new Date(shareToken.expirationDate);
    if (!Number.isNaN(expiresAt.getTime()) && expiresAt <= new Date()) {
      return { valid: false, reason: "expired" };
    }
  }

  if (shareToken.maxUses !== null && shareToken.useCount >= shareToken.maxUses) {
    return { valid: false, reason: "max_uses" };
  }

  return { valid: true, token: shareToken };
};

export const incrementTokenUsage = async (token: string): Promise<ShareToken | null> => {
  const { rows } = await db.query(
    `
      UPDATE share_tokens
      SET use_count = use_count + 1
      WHERE token = $1
        AND (max_uses IS NULL OR use_count < max_uses)
        AND (expiration_date IS NULL OR expiration_date > NOW())
      RETURNING id, token, document_id, created_by, permission_level, expiration_date, max_uses, use_count, created_at
    `,
    [token]
  );

  if (rows.length === 0) {
    return null;
  }

  return mapShareTokenRow(rows[0] as ShareTokenRow);
};

export const revokeShareToken = async (token: string): Promise<boolean> => {
  const result = await db.query(
    `
      DELETE FROM share_tokens
      WHERE token = $1
    `,
    [token]
  );

  return (result.rowCount ?? 0) > 0;
};

export const listActiveShareTokens = async (documentId: string): Promise<ShareToken[]> => {
  const { rows } = await db.query(
    `
      SELECT id, token, document_id, created_by, permission_level, expiration_date, max_uses, use_count, created_at
      FROM share_tokens
      WHERE document_id = $1
        AND (expiration_date IS NULL OR expiration_date > NOW())
        AND (max_uses IS NULL OR use_count < max_uses)
      ORDER BY created_at DESC
    `,
    [documentId]
  );

  return rows.map((row) => mapShareTokenRow(row as ShareTokenRow));
};
