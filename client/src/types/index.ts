export type TipTapContent = Record<string, unknown>;

export interface DocumentState {
  id: string;
  title: string;
  updatedAt: string;
  ownerId: string;
  workspaceId: string;
  isStarred: boolean;
  content: TipTapContent;
}

export interface UserProfile {
  id: string;
  name: string;
}

export interface PresenceInfo {
  userId: string;
  status: "online" | "offline";
}

// TODO: Extend types to include cursor and selection metadata.
