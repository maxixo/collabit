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

const resolveNameColumn = (schema: UserSchemaInfo) => {
  if (schema.columns.has("name")) {
    return "name";
  }
  if (schema.columns.has("display_name")) {
    return "display_name";
  }
  if (schema.columns.has("displayName")) {
    return "displayName";
  }
  if (schema.columns.has("full_name")) {
    return "full_name";
  }
  return "";
};

const resolveImageColumn = (schema: UserSchemaInfo) => {
  if (schema.columns.has("image")) {
    return "image";
  }
  if (schema.columns.has("avatar_url")) {
    return "avatar_url";
  }
  if (schema.columns.has("avatarUrl")) {
    return "avatarUrl";
  }
  return "";
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

export const updateUserById = async (
  id: string,
  updates: { name?: string; image?: string | null }
): Promise<UserModel | null> => {
  if (!id) {
    return null;
  }

  const schema = await getUserSchemaInfo();
  const idColumn = resolveIdColumn(schema);
  if (!idColumn) {
    throw new Error("User table does not have a supported id column.");
  }

  const assignments: string[] = [];
  const params: Array<unknown> = [];
  const addParam = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };

  if (typeof updates.name !== "undefined") {
    const nameColumn = resolveNameColumn(schema);
    if (nameColumn) {
      assignments.push(`${quoteIdentifier(nameColumn)} = ${addParam(updates.name)}`);
    }
  }

  if (typeof updates.image !== "undefined") {
    const imageColumn = resolveImageColumn(schema);
    if (imageColumn) {
      assignments.push(`${quoteIdentifier(imageColumn)} = ${addParam(updates.image)}`);
    }
  }

  if (assignments.length === 0) {
    return getUserById(id);
  }

  const selectClause = buildSelectClause(schema);
  const idParam = addParam(id);

  const { rows } = await db.query(
    `
      UPDATE ${schema.tableIdentifier}
      SET ${assignments.join(", ")}
      WHERE ${quoteIdentifier(idColumn)} = ${idParam}
      RETURNING ${selectClause}
    `,
    params
  );

  if (rows.length === 0) {
    return null;
  }

  return mapUserRow(rows[0]);
};
