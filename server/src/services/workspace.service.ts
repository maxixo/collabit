import { db } from "../config/db.js";
import { formatWorkspaceDisplayName } from "./workspace.naming.js";

export type WorkspaceMembershipStatus = "owner" | "member" | "guest";

export type WorkspaceSummary = {
  id: string;
  name: string;
  membershipStatus: WorkspaceMembershipStatus;
};

type WorkspaceSchemaInfo = {
  hasWorkspaces: boolean;
  hasWorkspaceMembers: boolean;
  workspaceMembersHasRole: boolean;
};

let cachedWorkspaceSchema: WorkspaceSchemaInfo | null = null;
let workspaceSchemaPromise: Promise<WorkspaceSchemaInfo> | null = null;

const getWorkspaceSchemaInfo = async (): Promise<WorkspaceSchemaInfo> => {
  if (cachedWorkspaceSchema) {
    return cachedWorkspaceSchema;
  }

  if (workspaceSchemaPromise) {
    return workspaceSchemaPromise;
  }

  workspaceSchemaPromise = (async () => {
    const tableResult = await db.query(
      "SELECT to_regclass('public.workspaces') AS workspaces, to_regclass('public.workspace_members') AS workspace_members"
    );

    const tables = tableResult.rows[0] as {
      workspaces?: string | null;
      workspace_members?: string | null;
    };

    const hasWorkspaces = Boolean(tables?.workspaces);
    const hasWorkspaceMembers = Boolean(tables?.workspace_members);
    let workspaceMembersHasRole = false;

    if (hasWorkspaceMembers) {
      const { rows } = await db.query(
        `
          SELECT column_name
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'workspace_members'
        `
      );

      workspaceMembersHasRole = rows.some((row) => row.column_name === "role");
    }

    return {
      hasWorkspaces,
      hasWorkspaceMembers,
      workspaceMembersHasRole
    };
  })();

  const result = await workspaceSchemaPromise;
  cachedWorkspaceSchema = result;
  workspaceSchemaPromise = null;
  return result;
};

type WorkspaceColumn = {
  column_name: string;
  is_nullable: "YES" | "NO";
  column_default: string | null;
};

const loadWorkspaceColumns = async (): Promise<WorkspaceColumn[]> => {
  const { rows } = await db.query(
    `
      SELECT column_name, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'workspaces'
    `
  );

  return rows as WorkspaceColumn[];
};

const createWorkspaceIfPossible = async (workspaceId: string, userId: string): Promise<boolean> => {
  const columns = await loadWorkspaceColumns();
  if (columns.length === 0) {
    return false;
  }

  const columnNames = new Set(columns.map((column) => column.column_name));
  if (!columnNames.has("id")) {
    return false;
  }

  const requiredColumns = columns
    .filter((column) => column.is_nullable === "NO" && !column.column_default)
    .map((column) => column.column_name);

  const values: Array<{ name: string; value?: unknown; raw?: string }> = [
    { name: "id", value: workspaceId }
  ];

  if (columnNames.has("name")) {
    values.push({ name: "name", value: "Shared workspace" });
  } else if (columnNames.has("title")) {
    values.push({ name: "title", value: "Shared workspace" });
  }

  if (columnNames.has("owner_id")) {
    values.push({ name: "owner_id", value: userId });
  } else if (columnNames.has("created_by")) {
    values.push({ name: "created_by", value: userId });
  } else if (columnNames.has("user_id")) {
    values.push({ name: "user_id", value: userId });
  }

  if (columnNames.has("created_at")) {
    values.push({ name: "created_at", raw: "NOW()" });
  }

  if (columnNames.has("updated_at")) {
    values.push({ name: "updated_at", raw: "NOW()" });
  }

  const provided = new Set(values.map((value) => value.name));
  const missingRequired = requiredColumns.filter((column) => !provided.has(column));
  if (missingRequired.length > 0) {
    return false;
  }

  const insertColumns = values.map((value) => value.name).join(", ");
  const insertValues: string[] = [];
  const params: Array<unknown> = [];

  values.forEach((value) => {
    if (value.raw) {
      insertValues.push(value.raw);
      return;
    }
    params.push(value.value);
    insertValues.push(`$${params.length}`);
  });

  await db.query(
    `
      INSERT INTO workspaces (${insertColumns})
      VALUES (${insertValues.join(", ")})
      ON CONFLICT DO NOTHING
    `,
    params
  );

  return true;
};

export const joinWorkspaceViaShare = async (
  workspaceId: string,
  userId: string
): Promise<boolean> => {
  if (!workspaceId || !userId) {
    return false;
  }

  const schema = await getWorkspaceSchemaInfo();
  if (!schema.hasWorkspaceMembers) {
    return false;
  }

  if (schema.hasWorkspaces) {
    const { rows } = await db.query(
      `
        SELECT 1
        FROM workspaces
        WHERE id = $1
        LIMIT 1
      `,
      [workspaceId]
    );

    if (rows.length === 0) {
      const created = await createWorkspaceIfPossible(workspaceId, userId);
      if (!created) {
        return false;
      }
    }
  }

  const insertColumns = schema.workspaceMembersHasRole
    ? "(workspace_id, user_id, role)"
    : "(workspace_id, user_id)";
  const insertValues = schema.workspaceMembersHasRole ? "$1, $2, $3" : "$1, $2";
  const params = schema.workspaceMembersHasRole
    ? [workspaceId, userId, "member"]
    : [workspaceId, userId];

  await db.query(
    `
      INSERT INTO workspace_members ${insertColumns}
      VALUES (${insertValues})
      ON CONFLICT DO NOTHING
    `,
    params
  );

  return true;
};

export const getWorkspaceSummary = async (
  workspaceId: string,
  userId: string
): Promise<WorkspaceSummary> => {
  const normalizedWorkspaceId = workspaceId.trim();
  if (!normalizedWorkspaceId) {
    throw new Error("workspaceId is required");
  }

  const schema = await getWorkspaceSchemaInfo();
  let name = formatWorkspaceDisplayName(normalizedWorkspaceId);
  let membershipStatus: WorkspaceMembershipStatus = userId ? "member" : "guest";

  if (schema.hasWorkspaces) {
    const columns = await loadWorkspaceColumns();
    const columnNames = new Set(columns.map((column) => column.column_name));
    const selectParts = ["id"];

    if (columnNames.has("name")) {
      selectParts.push("name");
    }
    if (columnNames.has("title")) {
      selectParts.push("title");
    }
    if (columnNames.has("owner_id")) {
      selectParts.push("owner_id");
    }
    if (columnNames.has("created_by")) {
      selectParts.push("created_by");
    }
    if (columnNames.has("user_id")) {
      selectParts.push("user_id");
    }

    const { rows } = await db.query(
      `
        SELECT ${selectParts.join(", ")}
        FROM workspaces
        WHERE id = $1
        LIMIT 1
      `,
      [normalizedWorkspaceId]
    );

    if (rows.length > 0) {
      const row = rows[0] as Record<string, unknown>;
      const rawName =
        typeof row.name === "string"
          ? row.name
          : typeof row.title === "string"
            ? row.title
            : "";
      if (rawName.trim()) {
        name = rawName.trim();
      }

      const ownerId =
        typeof row.owner_id === "string"
          ? row.owner_id
          : typeof row.created_by === "string"
            ? row.created_by
            : typeof row.user_id === "string"
              ? row.user_id
              : "";

      if (ownerId && ownerId === userId) {
        membershipStatus = "owner";
      }
    }
  }

  if (schema.hasWorkspaceMembers && userId) {
    const membershipSelect = schema.workspaceMembersHasRole ? "role" : "'member' AS role";
    const { rows } = await db.query(
      `
        SELECT ${membershipSelect}
        FROM workspace_members
        WHERE workspace_id = $1
          AND user_id = $2
        LIMIT 1
      `,
      [normalizedWorkspaceId, userId]
    );

    if (rows.length > 0 && membershipStatus !== "owner") {
      const row = rows[0] as { role?: unknown };
      membershipStatus = row.role === "owner" ? "owner" : "member";
    }
  }

  return {
    id: normalizedWorkspaceId,
    name,
    membershipStatus
  };
};
