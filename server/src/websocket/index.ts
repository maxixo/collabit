import type { IncomingMessage, Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { registerDocumentSocket } from "./documentSocket.js";
import { registerPresenceSocket } from "./presenceSocket.js";
import { logger } from "../utils/logger.js";
import { getSessionUser } from "../middlewares/auth.middleware.js";
import { presenceManager } from "../collaboration/presenceManager.js";
import { ServerEvent } from "@shared/events.js";

/**
 * WebSocket connection metadata
 * Stores information about each connected client
 */
interface SocketMetadata {
  userId: string;
  name?: string;
  image?: string;
  documentId?: string;
  workspaceId?: string;
}

/**
 * Store metadata for each WebSocket connection
 */
const socketMetadata = new Map<WebSocket, SocketMetadata>();

/**
 * Initialize the WebSocket server
 * 
 * This sets up a WebSocket server that:
 * 1. Authenticates connections using Better Auth
 * 2. Stores user information with each socket
 * 3. Routes messages to appropriate handlers
 */
export const initWebSocketServer = (server: Server) => {
  const wss = new WebSocketServer({
    server,
    path: "/ws"
  });

  presenceManager.setWebSocketBroadcaster((payload) => {
    const selection = payload.selection
      ? { anchor: payload.selection.from, head: payload.selection.to }
      : payload.cursor
        ? { anchor: payload.cursor.position, head: payload.cursor.position }
        : null;

    const message = JSON.stringify({
      type: ServerEvent.PresenceBroadcast,
      payload: {
        documentId: payload.documentId,
        presence: {
          userId: payload.userId,
          cursor: null,
          selection
        }
      }
    });

    wss.clients.forEach((client) => {
      const metadata = socketMetadata.get(client);
      if (!metadata || metadata.documentId !== payload.documentId) {
        return;
      }

      if (payload.excludeUserId && metadata.userId === payload.excludeUserId) {
        return;
      }

      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  });

  wss.on("connection", async (socket, request) => {
    try {
      // Authenticate the WebSocket connection
      const user = await authenticateSocket(request);
      if (!user) {
        socket.send(JSON.stringify({
          type: "server:error",
          payload: { message: "Unauthorized: Please sign in" }
        }));
        socket.close(1008, "Unauthorized");
        return;
      }

      // Store user metadata with this socket
      socketMetadata.set(socket, {
        userId: user.id,
        name: user.name,
        image: user.image
      });

      logger.info(`WebSocket connected: ${user.id}`);

      // Register message handlers for this socket
      registerDocumentSocket(socket, socketMetadata);
      registerPresenceSocket(socket, socketMetadata, wss);

      // Send ready confirmation to client
      socket.send(JSON.stringify({
        type: "server:ready",
        payload: {
          serverTime: new Date().toISOString()
        }
      }));

      // Handle socket disconnect
      socket.on("close", () => {
        const metadata = socketMetadata.get(socket);
        if (metadata) {
          logger.info(`WebSocket disconnected: ${metadata.userId}`);
          
          // If user was in a document, notify other users
          if (metadata.documentId) {
            broadcastPresenceLeave(metadata.documentId, metadata.userId, wss);
            presenceManager.handleDisconnect(metadata.documentId, metadata.userId);
          }
        }
        socketMetadata.delete(socket);
      });

      // Handle errors
      socket.on("error", (error) => {
        logger.error(`WebSocket error: ${error}`);
      });

    } catch (error) {
      logger.error(`WebSocket connection error: ${error}`);
      socket.close(1011, "Internal Server Error");
    }
  });

  logger.info("WebSocket server initialized on path /ws");

  return wss;
};

/**
 * Authenticate a WebSocket connection
 * Uses the same authentication as HTTP requests
 */
const authenticateSocket = async (request: IncomingMessage) => {
  try {
    const cookieHeader = request.headers.cookie;
    const hostHeader = request.headers.host;
    const forwardedProto = request.headers["x-forwarded-proto"];
    const protocol = Array.isArray(forwardedProto)
      ? forwardedProto[0]
      : forwardedProto ?? (request.socket as { encrypted?: boolean }).encrypted
        ? "https"
        : "http";

    // Create a minimal Express-like request object for auth middleware
    const fakeRequest = {
      protocol,
      get: (name: string) => {
        if (name.toLowerCase() === "host") {
          return Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
        }
        return undefined;
      },
      header: (name: string) => {
        if (name.toLowerCase() === "cookie") {
          return Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader;
        }
        return undefined;
      }
    };

    const user = await getSessionUser(fakeRequest as any);
    return user;
  } catch (error) {
    logger.error(`WebSocket authentication error: ${error}`);
    return null;
  }
};

/**
 * Broadcast a presence leave message to all users in a document
 */
const broadcastPresenceLeave = (
  documentId: string,
  userId: string,
  wss: WebSocketServer
) => {
  const message = JSON.stringify({
    type: "server:presence_broadcast",
    payload: {
      documentId,
      presence: {
        userId,
        cursor: null,
        selection: null
      }
    }
  });

  wss.clients.forEach((client) => {
    const metadata = socketMetadata.get(client);
    if (metadata && metadata.documentId === documentId && metadata.userId !== userId) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  });
};
