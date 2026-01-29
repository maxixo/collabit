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

// TODO: Add shared payload types for API and WebSocket events.
