import { WebSocket, WebSocketServer } from "ws";
import { ClientEvent, ServerEvent } from "@collab/shared/events";
import { logger } from "../utils/logger.js";
import { presenceManager } from "../collaboration/presenceManager.js";

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
 * Store the WebSocket server instance for broadcasting
 */
let wssInstance: WebSocketServer | null = null;

/**
 * Register presence handlers for a WebSocket connection
 * 
 * This handles:
 * - Cursor position updates from users
 * - Text selection updates from users
 * - Broadcasting presence to all users in a document
 */
export const registerPresenceSocket = (
  socket: WebSocket,
  socketMetadata: Map<WebSocket, SocketMetadata>,
  wss?: WebSocketServer
) => {
  // Store WebSocket server instance if provided
  if (wss) {
    wssInstance = wss;
  }

  socket.on("message", async (data: Buffer) => {
    try {
      const message = JSON.parse(data.toString());
      const metadata = socketMetadata.get(socket);

      if (!metadata) {
        logger.error("No metadata found for socket");
        return;
      }

      switch (message.type) {
        case ClientEvent.PresenceUpdate:
          await handlePresenceUpdate(socket, message.payload, metadata, socketMetadata);
          break;

        default:
          logger.warn(`Unknown presence event: ${message.type}`);
      }
    } catch (error) {
      logger.error(`Error handling presence message: ${error}`);
    }
  });
};

/**
 * Set the WebSocket server instance for broadcasting
 */
export const setWssInstance = (wss: WebSocketServer) => {
  wssInstance = wss;
};

/**
 * Handle presence update event
 * Broadcast cursor and selection changes to other users
 */
const handlePresenceUpdate = async (
  socket: WebSocket,
  payload: unknown,
  metadata: SocketMetadata,
  socketMetadata: Map<WebSocket, SocketMetadata>
) => {
  try {
    const { documentId, presence } = payload as {
      documentId: string;
      presence: {
        userId: string;
        cursor: { x: number; y: number } | null;
        selection: { anchor: number; head: number } | null;
      };
    };

    // Ensure user is in the document
    if (metadata.documentId !== documentId) {
      logger.warn(`User ${metadata.userId} sent presence for wrong document`);
      return;
    }

    presenceManager.handleWebSocketPresenceUpdate({
      documentId,
      userInfo: {
        id: metadata.userId,
        name: metadata.name,
        avatar: metadata.image
      },
      cursor: presence.cursor,
      selection: presence.selection
    });

    // Broadcast presence to all other users in same document
    broadcastPresence(documentId, presence, socket, socketMetadata);

    logger.info(`Presence updated for user ${presence.userId} in document ${documentId}`);

  } catch (error) {
    logger.error(`Error handling presence update: ${error}`);
  }
};

/**
 * Broadcast presence to all users in a document
 */
const broadcastPresence = (
  documentId: string,
  presence: {
    userId: string;
    cursor: { x: number; y: number } | null;
    selection: { anchor: number; head: number } | null;
  },
  senderSocket: WebSocket,
  socketMetadata: Map<WebSocket, SocketMetadata>
) => {
  if (!wssInstance) {
    logger.error("WebSocket server instance not available for broadcasting");
    return;
  }

  const message = JSON.stringify({
    type: ServerEvent.PresenceBroadcast,
    payload: {
      documentId,
      presence
    }
  });

  // Send to all clients in same document (except sender)
  wssInstance.clients.forEach((client) => {
    const clientMetadata = socketMetadata.get(client);

    // Only send to users in same document who are not sender
    if (
      clientMetadata &&
      clientMetadata.documentId === documentId &&
      client !== senderSocket &&
      client.readyState === WebSocket.OPEN
    ) {
      client.send(message);
    }
  });
};
