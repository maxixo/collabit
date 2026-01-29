import { db } from "../config/db.js";

export type DocumentSchemaInfo = {
  hasWorkspaceId: boolean;
  contentType: "jsonb" | "text";
  hasDocumentMembers: boolean;
  hasStarredDocuments: boolean;
};

let cachedSchema: DocumentSchemaInfo | null = null;
let schemaPromise: Promise<DocumentSchemaInfo> | null = null;

const normalizeContentType = (value: unknown): "jsonb" | "text" => {
  if (typeof value === "string" && value.toLowerCase() === "jsonb") {
    return "jsonb";
  }
  return "text";
};

export const getDocumentSchemaInfo = async (): Promise<DocumentSchemaInfo> => {
  if (cachedSchema) {
    return cachedSchema;
  }

  if (schemaPromise) {
    return schemaPromise;
  }

  schemaPromise = (async () => {
    const tableResult = await db.query(
      "SELECT to_regclass('public.documents') AS documents, to_regclass('public.document_members') AS document_members, to_regclass('public.starred_documents') AS starred_documents"
    );

    const tables = tableResult.rows[0] as {
      documents?: string | null;
      document_members?: string | null;
      starred_documents?: string | null;
    };
    if (!tables?.documents) {
      throw new Error("Documents table is missing. Run the database schema setup.");
    }

    const columnResult = await db.query(
      `
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'documents'
          AND column_name IN ('workspace_id', 'content')
      `
    );

    const columns = columnResult.rows as Array<{ column_name: string; data_type: string }>;
    const hasWorkspaceId = columns.some((column) => column.column_name === "workspace_id");
    const contentType = normalizeContentType(
      columns.find((column) => column.column_name === "content")?.data_type
    );

    return {
      hasWorkspaceId,
      contentType,
      hasDocumentMembers: Boolean(tables?.document_members),
      hasStarredDocuments: Boolean(tables?.starred_documents)
    };
  })();

  const result = await schemaPromise;
  cachedSchema = result;
  schemaPromise = null;
  return result;
};
