import type { TipTapContent, DocumentDetail } from "../services/document.service";
import { fetchDocumentById, updateDocument } from "../services/document.service";
import { createOfflineQueue, type OfflineQueueItem } from "./offlineQueue";

const DOCUMENT_QUEUE_TYPE = "document_update";
const DOCUMENT_QUEUE_EVENT = "document-queue-status";

type DocumentQueuePayload = {
  type: typeof DOCUMENT_QUEUE_TYPE;
  operation: "update_title_content";
  title: string;
  content: TipTapContent;
  updatedAtClient: string;
  baseUpdatedAt?: string | null;
  shareToken?: string;
};

export type DocumentQueueItem = OfflineQueueItem & {
  workspaceId: string;
  payload: DocumentQueuePayload;
};

type QueueStatusEvent =
  | {
      documentId: string;
      status: "queued" | "syncing";
    }
  | {
      documentId: string;
      status: "saved";
      document: DocumentDetail;
    }
  | {
      documentId: string;
      status: "conflict";
      local: {
        title: string;
        content: TipTapContent;
        updatedAtClient: string;
      };
      server: DocumentDetail;
    }
  | {
      documentId: string;
      status: "error";
      message: string;
    };

type FlushResult =
  | { status: "applied"; document: DocumentDetail }
  | { status: "conflict"; server: DocumentDetail }
  | { status: "rejected"; message: string }
  | { status: "retry"; message?: string };

const queue = createOfflineQueue();

const emitQueueStatus = (event: QueueStatusEvent) => {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent<QueueStatusEvent>(DOCUMENT_QUEUE_EVENT, { detail: event }));
};

const isDocumentQueueItem = (item: OfflineQueueItem): item is DocumentQueueItem => {
  const payload = item.payload as Partial<DocumentQueuePayload> | null;
  return (
    typeof item.workspaceId === "string" &&
    payload?.type === DOCUMENT_QUEUE_TYPE &&
    payload.operation === "update_title_content" &&
    typeof payload.title === "string" &&
    Boolean(payload.content)
  );
};

const isConnectivityError = (error: unknown) => {
  return error instanceof TypeError || !navigator.onLine;
};

const isConflict = (
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

export const subscribeToDocumentQueue = (
  handler: (event: QueueStatusEvent) => void
) => {
  if (typeof window === "undefined") {
    return () => {};
  }

  const listener = (event: Event) => {
    const customEvent = event as CustomEvent<QueueStatusEvent>;
    handler(customEvent.detail);
  };

  window.addEventListener(DOCUMENT_QUEUE_EVENT, listener as EventListener);
  return () => {
    window.removeEventListener(DOCUMENT_QUEUE_EVENT, listener as EventListener);
  };
};

export const enqueueDocumentUpdate = async (input: {
  documentId: string;
  workspaceId: string;
  title: string;
  content: TipTapContent;
  updatedAtClient: string;
  baseUpdatedAt?: string | null;
  shareToken?: string;
}) => {
  const items = await queue.list();
  const redundantIds = items
    .filter(isDocumentQueueItem)
    .filter(
      (item) =>
        item.documentId === input.documentId &&
        item.workspaceId === input.workspaceId
    )
    .map((item) => item.id);

  for (const id of redundantIds) {
    await queue.remove(id);
  }

  const entry = await queue.enqueue({
    documentId: input.documentId,
    workspaceId: input.workspaceId,
    payload: {
      type: DOCUMENT_QUEUE_TYPE,
      operation: "update_title_content",
      title: input.title,
      content: input.content,
      updatedAtClient: input.updatedAtClient,
      baseUpdatedAt: input.baseUpdatedAt ?? null,
      shareToken: input.shareToken
    }
  });

  emitQueueStatus({ documentId: input.documentId, status: "queued" });
  return entry;
};

export const getQueuedDocumentUpdate = async (documentId: string) => {
  const items = await queue.list();
  const matches = items
    .filter(isDocumentQueueItem)
    .filter((item) => item.documentId === documentId)
    .sort((left, right) => right.createdAt - left.createdAt);

  return matches[0] ?? null;
};

export const flushDocumentQueue = async () => {
  const items = await queue.list();
  const groups = new Map<string, DocumentQueueItem[]>();

  for (const item of items) {
    if (!isDocumentQueueItem(item)) {
      continue;
    }

    const key = `${item.workspaceId}:${item.documentId}`;
    const existing = groups.get(key);
    if (existing) {
      existing.push(item);
    } else {
      groups.set(key, [item]);
    }
  }

  const orderedGroups = Array.from(groups.values()).sort(
    (left, right) => left[0].createdAt - right[0].createdAt
  );

  for (const entries of orderedGroups) {
    const latest = entries.sort((left, right) => right.createdAt - left.createdAt)[0];
    emitQueueStatus({ documentId: latest.documentId, status: "syncing" });

    const result = await replayDocumentUpdate(latest);
    if (result.status === "retry") {
      emitQueueStatus({
        documentId: latest.documentId,
        status: "error",
        message: result.message ?? "Document sync will retry when the connection returns."
      });
      break;
    }

    for (const entry of entries) {
      await queue.remove(entry.id);
    }

    if (result.status === "applied") {
      emitQueueStatus({
        documentId: latest.documentId,
        status: "saved",
        document: result.document
      });
      continue;
    }

    if (result.status === "conflict") {
      emitQueueStatus({
        documentId: latest.documentId,
        status: "conflict",
        local: {
          title: latest.payload.title,
          content: latest.payload.content,
          updatedAtClient: latest.payload.updatedAtClient
        },
        server: result.server
      });
      continue;
    }

    emitQueueStatus({
      documentId: latest.documentId,
      status: "error",
      message: result.message
    });
  }
};

const replayDocumentUpdate = async (entry: DocumentQueueItem): Promise<FlushResult> => {
  try {
    const serverDocument = await fetchDocumentById(entry.documentId, entry.workspaceId, {
      shareToken: entry.payload.shareToken
    });

    if (!serverDocument) {
      return { status: "rejected", message: "Document not found on reconnect." };
    }

    if (isConflict(entry.payload, serverDocument)) {
      return { status: "conflict", server: serverDocument };
    }

    const updated = await updateDocument(
      {
        id: entry.documentId,
        workspaceId: entry.workspaceId,
        title: entry.payload.title,
        content: entry.payload.content
      },
      { shareToken: entry.payload.shareToken }
    );

    return { status: "applied", document: updated };
  } catch (error) {
    if (isConnectivityError(error)) {
      return { status: "retry" };
    }

    return {
      status: "rejected",
      message: error instanceof Error ? error.message : "Failed to replay queued document update."
    };
  }
};
