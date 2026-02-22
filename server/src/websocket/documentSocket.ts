import type { WebSocket } from "ws";
import { ClientEvent, ServerEvent } from "@shared/events.js";
import type { ServerSyncResponsePayload, ServerAccessDeniedPayload } from "@shared/types.js";
import { logger } from "../utils/logger.js";
import { getDocumentById } from "../services/document.service.js";
import { getDocumentRole } from "../services/permission.service.js";
import { createYjsServer } from "../collaboration/yjsServer.js";

// Initialize YJS server instance
const yjsServer = createYjsServer();

/**
 * Metadata for each WebSocket connection
 */
interface SocketMetadata {
  userId: string;
  name?: string;
  image?: string;
  documentId?: string;
  workspaceId?: string;
}

const parseDocumentIdentity = (payload: unknown) => {
  if (!payload || typeof payload !== "object") {
    return { documentId: "", workspaceId: "" };
  }

  const data = payload as { documentId?: unknown; workspaceId?: unknown };

  return {
    documentId: typeof data.documentId === "string" ? data.documentId.trim() : "",
    workspaceId: typeof data.workspaceId === "string" ? data.workspaceId.trim() : ""
  };
};

const sendAccessDenied = (
  socket: WebSocket,
  documentId: string,
  workspaceId: string,
  reason: string
) => {
  const errorPayload: ServerAccessDeniedPayload = {
    documentId,
    workspaceId,
    reason
  };
  socket.send(JSON.stringify({
    type: ServerEvent.AccessDenied,
    payload: errorPayload
  }));
};

/**
 * Register document sync handlers for a WebSocket connection
 * 
 * This handles:
 * - Opening documents (sync request)
 * - Broadcasting Y.js updates to other users
 * - Triggering server-side persistence
 */
export const registerDocumentSocket = (
  socket: WebSocket,
  socketMetadata: Map<WebSocket, SocketMetadata>
) => {
  socket.on("message", async (data: Buffer) => {
    try {
      const message = JSON.parse(data.toString());
      const metadata = socketMetadata.get(socket);

      if (!metadata) {
        logger.error("No metadata found for socket");
        return;
      }

      switch (message.type) {
        case ClientEvent.DocumentOpen:
          await handleDocumentOpen(socket, message.payload, metadata, socketMetadata);
          break;

        case ClientEvent.SyncRequest:
          await handleSyncRequest(socket, message.payload, metadata);
          break;

        default:
          logger.warn(`Unknown document event: ${message.type}`);
      }
    } catch (error) {
      logger.error(`Error handling document message: ${error}`);
    }
  });
};

/**
 * Handle document open event
 * User opens a document and joins the document room
 */
const handleDocumentOpen = async (
  socket: WebSocket,
  payload: unknown,
  metadata: SocketMetadata,
  socketMetadata: Map<WebSocket, SocketMetadata>
) => {
  try {
    const { documentId, workspaceId } = parseDocumentIdentity(payload);

    if (!documentId || !workspaceId) {
      sendAccessDenied(socket, documentId, workspaceId, "documentId and workspaceId are required");
      return;
    }

    if (!metadata.userId) {
      sendAccessDenied(socket, documentId, workspaceId, "Unauthorized");
      return;
    }

    const role = await getDocumentRole(metadata.userId, documentId, workspaceId);
    if (!role) {
      sendAccessDenied(socket, documentId, workspaceId, "Access denied");
      return;
    }

    const document = await getDocumentById(documentId, workspaceId, metadata.userId, {
      bypassAccessCheck: true
    });
    if (!document) {
      sendAccessDenied(socket, documentId, workspaceId, "Document not found");
      return;
    }

    // Update metadata with document info
    const nextMetadata = {
      ...metadata,
      documentId,
      workspaceId
    };
    socketMetadata.set(socket, nextMetadata);

    logger.info(`User ${metadata.userId} opened document ${documentId}`);

    // Attach YJS server to this WebSocket connection for real-time collaboration
    yjsServer.attach(socket, documentId, metadata.userId);

    // Send sync response with document data
    const response: ServerSyncResponsePayload = {
      document: {
        id: document.id,
        title: document.title,
        updatedAt: document.updatedAt,
        ownerId: document.ownerId,
        workspaceId: document.workspaceId,
        isStarred: document.isStarred,
        content: document.content
      }
    };

    socket.send(JSON.stringify({
      type: ServerEvent.SyncResponse,
      payload: response
    }));

  } catch (error) {
    logger.error(`Error handling document open: ${error}`);
    sendAccessDenied(socket, "", "", "Failed to open document");
  }
};

/**
 * Handle sync request event
 * Fetch and return document content
 */
const handleSyncRequest = async (
  socket: WebSocket,
  payload: unknown,
  metadata: SocketMetadata
) => {
  try {
    const parsed = parseDocumentIdentity(payload);
    const documentId = parsed.documentId || metadata.documentId || "";
    const workspaceId = parsed.workspaceId || metadata.workspaceId || "";

    if (!documentId || !workspaceId) {
      sendAccessDenied(socket, documentId, workspaceId, "documentId and workspaceId are required");
      return;
    }

    if (metadata.documentId && metadata.documentId !== documentId) {
      sendAccessDenied(socket, documentId, workspaceId, "Document mismatch");
      return;
    }

    if (metadata.workspaceId && metadata.workspaceId !== workspaceId) {
      sendAccessDenied(socket, documentId, workspaceId, "Workspace mismatch");
      return;
    }

    const role = await getDocumentRole(metadata.userId, documentId, workspaceId);
    if (!role) {
      sendAccessDenied(socket, documentId, workspaceId, "Access denied");
      return;
    }

    // Fetch document from database
    const document = await getDocumentById(documentId, workspaceId, metadata.userId, {
      bypassAccessCheck: true
    });

    if (!document) {
      sendAccessDenied(socket, documentId, workspaceId, "Document not found");
      return;
    }

    // Send document content to client
    const response: ServerSyncResponsePayload = {
      document: {
        id: document.id,
        title: document.title,
        updatedAt: document.updatedAt,
        ownerId: document.ownerId,
        workspaceId: document.workspaceId,
        isStarred: document.isStarred,
        content: document.content
      }
    };

    socket.send(JSON.stringify({
      type: ServerEvent.SyncResponse,
      payload: response
    }));

    logger.info(`Synced document ${documentId} for user ${metadata.userId}`);

  } catch (error) {
    logger.error(`Error handling sync request: ${error}`);
    sendAccessDenied(socket, "", "", "Failed to sync document");
  }
};
