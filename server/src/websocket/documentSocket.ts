import type { WebSocket } from "ws";
import { ClientEvent, ServerEvent } from "@shared/events.js";
import type { ServerSyncResponsePayload, ServerAccessDeniedPayload } from "@shared/types.js";
import { logger } from "../utils/logger.js";
import { getDocumentById } from "../services/document.service.js";
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
    const { documentId, workspaceId } = payload as { documentId: string; workspaceId: string };

    // Update metadata with document info
    metadata.documentId = documentId;
    metadata.workspaceId = workspaceId;
    socketMetadata.set(socket, metadata);

    logger.info(`User ${metadata.userId} opened document ${documentId}`);

    // Attach YJS server to this WebSocket connection for real-time collaboration
    yjsServer.attach(socket, documentId, metadata.userId);

    // Send sync response with document data
    const response: ServerSyncResponsePayload = {
      document: {
        id: documentId,
        title: "Document", // TODO: Fetch actual title
        updatedAt: new Date().toISOString(),
        ownerId: "unknown",
        workspaceId,
        isStarred: false,
        content: {} // TODO: Fetch actual content
      }
    };

    socket.send(JSON.stringify({
      type: ServerEvent.SyncResponse,
      payload: response
    }));

  } catch (error) {
    logger.error(`Error handling document open: ${error}`);
    const errorPayload: ServerAccessDeniedPayload = {
      documentId: "",
      workspaceId: "",
      reason: "Failed to open document"
    };
    socket.send(JSON.stringify({
      type: ServerEvent.AccessDenied,
      payload: errorPayload
    }));
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
    const { documentId, workspaceId } = payload as { documentId: string; workspaceId: string };

    // Check if user has permission to access this document
    // TODO: Implement proper permission check using permission.service.ts

    // Fetch document from database
    const document = await getDocumentById(documentId, "", metadata.userId);

    if (!document) {
      const errorPayload: ServerAccessDeniedPayload = {
        documentId,
        workspaceId,
        reason: "Document not found or access denied"
      };
      socket.send(JSON.stringify({
        type: ServerEvent.AccessDenied,
        payload: errorPayload
      }));
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
    const errorPayload: ServerAccessDeniedPayload = {
      documentId: "",
      workspaceId: "",
      reason: "Failed to sync document"
    };
    socket.send(JSON.stringify({
      type: ServerEvent.AccessDenied,
      payload: errorPayload
    }));
  }
};
