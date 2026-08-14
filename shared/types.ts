export interface SharedUser {
  id: string;
  displayName: string;
}

export type TipTapContent = Record<string, unknown>;

export interface DocumentSummary {
  id: string;
  title: string;
  updatedAt: string;
  ownerId: string;
  workspaceId: string;
  isStarred: boolean;
}

export interface DocumentDetail extends DocumentSummary {
  content: TipTapContent;
}

export type SharedDocument = DocumentSummary;

export type ShareTokenPermission = "viewer" | "editor" | "owner";

export interface ShareToken {
  id: string;
  token: string;
  documentId: string;
  createdBy: string;
  permissionLevel: ShareTokenPermission;
  expirationDate: string | null;
  maxUses: number | null;
  useCount: number;
  createdAt: string;
}

export interface ShareTokenOptions {
  permission?: ShareTokenPermission;
  expiration?: string | null;
  maxUses?: number | null;
}

export interface PresenceState {
  userId: string;
  cursor: { x: number; y: number } | null;
  selection: { anchor: number; head: number } | null;
}

export interface DocumentIdentity {
  documentId: string;
  workspaceId: string;
}

export interface ClientConnectPayload {
  userId: string;
}

export interface ClientSyncRequestPayload extends DocumentIdentity {}

export interface ClientPresenceUpdatePayload extends DocumentIdentity {
  presence: PresenceState;
}

export interface ClientDocumentOpenPayload extends DocumentIdentity {}

export interface ClientDocumentMetadataUpdatePayload extends DocumentIdentity {
  title: string;
}

export interface ServerReadyPayload {
  serverTime: string;
}

export interface ServerSyncResponsePayload {
  document: DocumentDetail;
}

export interface ServerPresenceBroadcastPayload extends DocumentIdentity {
  presence: PresenceState;
}

export interface ServerErrorPayload {
  message: string;
  code?: string;
}

export interface ServerAccessDeniedPayload extends DocumentIdentity {
  reason: string;
}

export type SuggestionType = "insert" | "delete" | "replace" | "format";
export type SuggestionStatus = "pending" | "accepted" | "rejected";

export interface SuggestionRelativePositionJson {
  type?: { client: number; clock: number } | null;
  tname?: string | null;
  item?: { client: number; clock: number } | null;
  assoc?: number | null;
}

export interface SuggestionMetadata extends Record<string, unknown> {
  anchorFrom?: SuggestionRelativePositionJson | null;
  anchorTo?: SuggestionRelativePositionJson | null;
  snapshotText?: string | null;
  createdFrom?: string;
  capturedAt?: string;
}

export interface SuggestionAuthor {
  id: string;
  displayName?: string;
  email?: string;
  image?: string | null;
}

export interface DocumentSuggestion {
  id: string;
  documentId: string;
  workspaceId: string;
  authorUserId: string;
  suggestionType: SuggestionType;
  status: SuggestionStatus;
  from: number;
  to: number;
  originalText: string | null;
  suggestedText: string | null;
  metadata: SuggestionMetadata;
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  author?: SuggestionAuthor;
}

export interface SuggestionBatchSummary {
  userId: string;
  changeCount: number;
  firstChange: string;
  lastChange: string;
  changeTypes: string[];
  user?: SuggestionAuthor;
}
