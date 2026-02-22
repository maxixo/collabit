import { db } from "../config/db.js";
import { mapUserRow, type UserModel } from "../models/user.model.js";
import { getUserSchemaInfo, type UserSchemaInfo } from "./userSchema.service.js";

const quoteIdentifier = (value: string) => `"${value.replace(/"/g, "\"\"")}"`;

const resolveIdColumn = (schema: UserSchemaInfo) => {
  if (schema.columns.has("id")) {
    return "id";
  }
  if (schema.columns.has("user_id")) {
    return "user_id";
  }
  return "";
};

const buildSelectClause = (schema: UserSchemaInfo) => {
  const candidates = [
    "id",
    "user_id",
    "email",
    "name",
    "display_name",
    "displayName",
    "image"
  ];
  const selections: string[] = [];
  const idColumn = resolveIdColumn(schema);

  for (const column of candidates) {
    if (!schema.columns.has(column)) {
      continue;
    }

    if (column === "user_id") {
      if (idColumn === "user_id") {
        selections.push(`${quoteIdentifier(column)} AS id`);
      }
      continue;
    }

    selections.push(quoteIdentifier(column));
  }

  return selections.length > 0 ? selections.join(", ") : "*";
};

const buildOrderByClause = (schema: UserSchemaInfo) => {
  const orderColumn = schema.columns.has("created_at")
    ? "created_at"
    : schema.columns.has("createdAt")
      ? "createdAt"
      : resolveIdColumn(schema);

  return orderColumn ? `ORDER BY ${quoteIdentifier(orderColumn)}` : "";
};

const normalizeLimit = (limit: number, fallback: number) => {
  if (!Number.isFinite(limit)) {
    return fallback;
  }
  const normalized = Math.trunc(limit);
  if (normalized <= 0) {
    return fallback;
  }
  return Math.min(normalized, 200);
};

export const listUsers = async (limit = 50): Promise<UserModel[]> => {
  const schema = await getUserSchemaInfo();
  const selectClause = buildSelectClause(schema);
  const orderByClause = buildOrderByClause(schema);
  const resolvedLimit = normalizeLimit(limit, 50);

  const { rows } = await db.query(
    `
      SELECT ${selectClause}
      FROM ${schema.tableIdentifier}
      ${orderByClause}
      LIMIT $1
    `,
    [resolvedLimit]
  );

  return rows.map(mapUserRow);
};

export const getUserById = async (id: string): Promise<UserModel | null> => {
  if (!id) {
    return null;
  }

  const schema = await getUserSchemaInfo();
  const idColumn = resolveIdColumn(schema);
  if (!idColumn) {
    throw new Error("User table does not have a supported id column.");
  }

  const selectClause = buildSelectClause(schema);

  const { rows } = await db.query(
    `
      SELECT ${selectClause}
      FROM ${schema.tableIdentifier}
      WHERE ${quoteIdentifier(idColumn)} = $1
      LIMIT 1
    `,
    [id]
  );

  if (rows.length === 0) {
    return null;
  }

  return mapUserRow(rows[0]);
};
