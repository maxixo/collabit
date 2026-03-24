import type { DocumentDetail, TipTapContent } from "../services/document.service";

export type DocumentQueuePayload = {
  type: "document_update";
  operation: "update_title_content";
  title: string;
  content: TipTapContent;
  updatedAtClient: string;
  baseUpdatedAt?: string | null;
  shareToken?: string;
};

export type DocumentQueueLike = {
  id: string;
  documentId: string;
  workspaceId: string;
  createdAt: number;
  payload: DocumentQueuePayload;
};

export const hasDocumentConflict = (
  queued: DocumentQueuePayload,
  serverDocument: DocumentDetail
) => {
  if (!queued.baseUpdatedAt || queued.baseUpdatedAt === serverDocument.updatedAt) {
    return false;
  }

  return (
    queued.title !== serverDocument.title ||
    JSON.stringify(queued.content) !== JSON.stringify(serverDocument.content)
  );
};

export const collapseDocumentQueueEntries = <T extends DocumentQueueLike>(items: T[]) => {
  const groups = new Map<string, T[]>();

  for (const item of items) {
    const key = `${item.workspaceId}:${item.documentId}`;
    const existing = groups.get(key);
    if (existing) {
      existing.push(item);
    } else {
      groups.set(key, [item]);
    }
  }

  return Array.from(groups.values())
    .sort((left, right) => left[0].createdAt - right[0].createdAt)
    .map((entries) => entries.sort((left, right) => right.createdAt - left.createdAt)[0]);
};
