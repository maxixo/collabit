import { db } from "../config/db.js";

export type UserSchemaInfo = {
  tableName: string;
  tableIdentifier: string;
  columns: Set<string>;
};

let cachedSchema: UserSchemaInfo | null = null;
let schemaPromise: Promise<UserSchemaInfo> | null = null;

export const getUserSchemaInfo = async (): Promise<UserSchemaInfo> => {
  if (cachedSchema) {
    return cachedSchema;
  }

  if (schemaPromise) {
    return schemaPromise;
  }

  schemaPromise = (async () => {
    const tableResult = await db.query(
      "SELECT to_regclass('public.\"user\"') AS user_table, to_regclass('public.users') AS users_table"
    );
    const tableRow = tableResult.rows[0] as
      | { user_table?: string | null; users_table?: string | null }
      | undefined;

    const tableName = tableRow?.user_table ? "user" : tableRow?.users_table ? "users" : "";
    if (!tableName) {
      throw new Error("User table is missing. Run auth migrations first.");
    }

    const columnResult = await db.query(
      `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = $1
      `,
      [tableName]
    );

    const columns = new Set(
      columnResult.rows
        .map((row: { column_name?: string }) => row.column_name)
        .filter((name): name is string => typeof name === "string")
    );

    return {
      tableName,
      tableIdentifier: `"${tableName}"`,
      columns
    };
  })();

  const result = await schemaPromise;
  cachedSchema = result;
  schemaPromise = null;
  return result;
};
