export type TipTapContent = Record<string, unknown>;

export interface DocumentSummary {
  id: string;
  title: string;
  updatedAt: string;
  ownerId: string;
  workspaceId: string;
  isStarred: boolean;
}

export interface DocumentModel extends DocumentSummary {
  content: TipTapContent;
}

const DEFAULT_DOCUMENT_CONTENT: TipTapContent = {
  type: "doc",
  content: [{ type: "paragraph" }]
};

const parseUpdatedAt = (row: Record<string, unknown>) => {
  if (typeof row.updatedAt === "string") {
    return row.updatedAt;
  }
  if (typeof row.updated_at === "string") {
    return row.updated_at;
  }
  if (row.updated_at instanceof Date) {
    return row.updated_at.toISOString();
  }
  return new Date().toISOString();
};

const parseContent = (value: unknown): TipTapContent => {
  if (typeof value === "object" && value !== null) {
    return value as TipTapContent;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as TipTapContent;
      if (typeof parsed === "object" && parsed !== null) {
        return parsed;
      }
    } catch {
      // fall through to default
    }
  }
  return DEFAULT_DOCUMENT_CONTENT;
};

const parseIsStarred = (row: Record<string, unknown>) => {
  const value =
    typeof row.isStarred !== "undefined"
      ? row.isStarred
      : typeof row.is_starred !== "undefined"
        ? row.is_starred
        : undefined;

  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value === 1;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "t" || normalized === "1" || normalized === "yes";
  }
  return false;
};

export const mapDocumentSummaryRow = (_row: unknown): DocumentSummary => {
  const row = typeof _row === "object" && _row !== null ? (_row as Record<string, unknown>) : {};
  return {
    id: typeof row.id === "string" ? row.id : "",
    title: typeof row.title === "string" ? row.title : "",
    updatedAt: parseUpdatedAt(row),
    ownerId: typeof row.ownerId === "string" ? row.ownerId : typeof row.owner_id === "string" ? row.owner_id : "",
    workspaceId:
      typeof row.workspaceId === "string"
        ? row.workspaceId
        : typeof row.workspace_id === "string"
          ? row.workspace_id
          : "",
    isStarred: parseIsStarred(row)
  };
};

export const mapDocumentRow = (_row: unknown): DocumentModel => {
  const row = typeof _row === "object" && _row !== null ? (_row as Record<string, unknown>) : {};
  return {
    ...mapDocumentSummaryRow(row),
    content: parseContent(row.content)
  };
};
