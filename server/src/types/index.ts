export interface ApiResponse<T> {
  data: T;
  message: string;
}

export interface UserRecord {
  id: string;
  email: string;
  displayName: string;
}

export interface DocumentRecord {
  id: string;
  title: string;
  content: Record<string, unknown>;
  updatedAt: string;
  ownerId: string;
  workspaceId: string;
  isStarred: boolean;
}

export interface ChangeEvent {
  id: string;
  documentId: string;
  userId: string;
  changeType: "insert" | "delete" | "update" | "format" | "title";
  content: Record<string, unknown>;
  position: number | null;
  createdAt: string;
  applied: boolean;
  workspaceId: string;
}

export interface ChangeEventInput {
  documentId: string;
  userId: string;
  changeType: "insert" | "delete" | "update" | "format" | "title";
  content: Record<string, unknown>;
  position?: number | null;
  workspaceId: string;
}

export interface PendingChangesSummary {
  userId: string;
  changeCount: number;
  firstChange: string;
  lastChange: string;
  changeTypes: string[];
}

export interface SuggestionRecord {
  id: string;
  documentId: string;
  workspaceId: string;
  authorUserId: string;
  suggestionType: "insert" | "delete" | "replace" | "format";
  status: "pending" | "accepted" | "rejected";
  from: number;
  to: number;
  originalText: string | null;
  suggestedText: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
}

// TODO: Add shared payload types for API and WebSocket events.
