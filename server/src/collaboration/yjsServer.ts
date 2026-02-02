import { WebSocket } from "ws";
import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import * as authProtocol from "y-protocols/auth";
import { encoding, decoding } from "lib0";
import { logger } from "../utils/logger.js";

const messageSync = 0;
const messageAwareness = 1;
const messageAuth = 2;
const messageQueryAwareness = 3;

/**
 * YJS document manager
 * Maintains Y.Doc instances per document and handles WebSocket connections
 */
class YjsDocumentManager {
  private documents = new Map<string, Y.Doc>();
  private awarenessStates = new Map<string, awarenessProtocol.Awareness>();
  clients = new Map<WebSocket, { docId: string; userId: string; clientIds: Set<number> }>();

  /**
   * Get or create a Y.Doc for a document
   */
  getDocument(documentId: string): Y.Doc {
    if (!this.documents.has(documentId)) {
      const doc = new Y.Doc();
      // Ensure the content fragment exists
      doc.getXmlFragment("content");
      doc.on("update", (update: Uint8Array, origin: unknown) => {
        const originWs = origin instanceof WebSocket ? origin : undefined;
        this.broadcastUpdate(documentId, update, originWs);
      });
      this.documents.set(documentId, doc);
      const awareness = new awarenessProtocol.Awareness(doc);
      awareness.setLocalState(null);
      awareness.on("update", ({ added, updated, removed }: { added: Set<number>; updated: Set<number>; removed: Set<number> }, origin: unknown) => {
        const changed = [...added, ...updated, ...removed];
        if (changed.length === 0) {
          return;
        }
        const update = awarenessProtocol.encodeAwarenessUpdate(awareness, changed);
        const originWs = origin instanceof WebSocket ? origin : undefined;
        this.broadcastAwareness(documentId, update, originWs);
      });
      this.awarenessStates.set(documentId, awareness);
      logger.info(`Created new Y.Doc for document: ${documentId}`);
    }
    return this.documents.get(documentId)!;
  }

  getAwareness(documentId: string): awarenessProtocol.Awareness {
    const awareness = this.awarenessStates.get(documentId);
    if (awareness) {
      return awareness;
    }
    this.getDocument(documentId);
    return this.awarenessStates.get(documentId)!;
  }

  /**
   * Remove a document (when no clients are connected)
   */
  removeDocument(documentId: string): void {
    const doc = this.documents.get(documentId);
    if (doc) {
      doc.destroy();
      this.documents.delete(documentId);
      this.awarenessStates.delete(documentId);
      logger.info(`Removed Y.Doc for document: ${documentId}`);
    }
  }

  /**
   * Register a client connection to a document
   */
  registerClient(ws: WebSocket, documentId: string, userId: string): void {
    this.clients.set(ws, { docId: documentId, userId, clientIds: new Set() });
  }

  /**
   * Unregister a client connection
   */
  unregisterClient(ws: WebSocket): void {
    const client = this.clients.get(ws);
    if (client) {
      const awareness = this.awarenessStates.get(client.docId);
      if (awareness && client.clientIds.size > 0) {
        awarenessProtocol.removeAwarenessStates(
          awareness,
          Array.from(client.clientIds),
          ws
        );
      }
      const doc = this.documents.get(client.docId);
      if (doc && this.getClientCount(client.docId) === 1) {
        // This was the last client, remove the document
        this.removeDocument(client.docId);
      }
      this.clients.delete(ws);
    }
  }

  trackAwareness(ws: WebSocket, update: Uint8Array): void {
    const client = this.clients.get(ws);
    if (!client) {
      return;
    }
    const decoder = decoding.createDecoder(update);
    const updateCount = decoding.readVarUint(decoder);
    for (let i = 0; i < updateCount; i++) {
      const clientId = decoding.readVarUint(decoder);
      client.clientIds.add(clientId);
      decoding.readVarUint(decoder);
      decoding.readVarString(decoder);
    }
  }

  /**
   * Get the number of clients connected to a document
   */
  getClientCount(documentId: string): number {
    let count = 0;
    this.clients.forEach((client) => {
      if (client.docId === documentId) {
        count++;
      }
    });
    return count;
  }

  /**
   * Broadcast a YJS update to all clients of a document
   */
  broadcastUpdate(documentId: string, update: Uint8Array, excludeWs?: WebSocket): void {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageSync);
    syncProtocol.writeUpdate(encoder, update);
    const payload = encoding.toUint8Array(encoder);
    this.clients.forEach((client, ws) => {
      if (client.docId === documentId && ws !== excludeWs && ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    });
  }

  /**
   * Broadcast awareness update to all clients of a document
   */
  broadcastAwareness(documentId: string, update: Uint8Array, excludeWs?: WebSocket): void {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageAwareness);
    encoding.writeVarUint8Array(encoder, update);
    const payload = encoding.toUint8Array(encoder);
    this.clients.forEach((client, ws) => {
      if (client.docId === documentId && ws !== excludeWs && ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    });
  }
}

const yjsManager = new YjsDocumentManager();

/**
 * Create a YJS WebSocket handler
 */
export const createYjsServer = () => {
  return {
    /**
     * Attach a WebSocket connection to the YJS server
     */
    attach: (ws: WebSocket, documentId: string, userId: string) => {
      const doc = yjsManager.getDocument(documentId);
      const awareness = yjsManager.getAwareness(documentId);
      yjsManager.registerClient(ws, documentId, userId);

      logger.info(`YJS client connected: document=${documentId}, user=${userId}`);

      // Send initial document state (sync step 1)
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageSync);
      syncProtocol.writeSyncStep1(encoder, doc);
      ws.send(encoding.toUint8Array(encoder));

      if (awareness.getStates().size > 0) {
        const awarenessEncoder = encoding.createEncoder();
        encoding.writeVarUint(awarenessEncoder, messageAwareness);
        encoding.writeVarUint8Array(
          awarenessEncoder,
          awarenessProtocol.encodeAwarenessUpdate(
            awareness,
            Array.from(awareness.getStates().keys())
          )
        );
        ws.send(encoding.toUint8Array(awarenessEncoder));
      }

      // Handle incoming messages
      ws.on("message", (data: WebSocket.RawData) => {
        try {
          let payload: Uint8Array | null = null;
          if (typeof data === "string") {
            return;
          }
          if (data instanceof ArrayBuffer) {
            payload = new Uint8Array(data);
          } else if (Array.isArray(data)) {
            payload = new Uint8Array(Buffer.concat(data));
          } else {
            payload = new Uint8Array(data);
          }
          const decoder = decoding.createDecoder(payload);
          const messageType = decoding.readVarUint(decoder);

          switch (messageType) {
            case messageSync: {
              const encoder = encoding.createEncoder();
              encoding.writeVarUint(encoder, messageSync);
              syncProtocol.readSyncMessage(decoder, encoder, doc, ws, (error) => {
                logger.error(`Error processing YJS sync message: ${error}`);
              });
              if (encoding.length(encoder) > 1) {
                ws.send(encoding.toUint8Array(encoder));
              }
              break;
            }

            case messageAwareness: {
              const awarenessUpdate = decoding.readVarUint8Array(decoder);
              yjsManager.trackAwareness(ws, awarenessUpdate);
              awarenessProtocol.applyAwarenessUpdate(awareness, awarenessUpdate, ws);
              break;
            }

            case messageQueryAwareness: {
              const awarenessEncoder = encoding.createEncoder();
              encoding.writeVarUint(awarenessEncoder, messageAwareness);
              encoding.writeVarUint8Array(
                awarenessEncoder,
                awarenessProtocol.encodeAwarenessUpdate(
                  awareness,
                  Array.from(awareness.getStates().keys())
                )
              );
              ws.send(encoding.toUint8Array(awarenessEncoder));
              break;
            }

            case messageAuth: {
              authProtocol.readAuthMessage(decoder, doc, (_ydoc, reason) => {
                logger.warn(`YJS auth denied: ${reason}`);
                const authEncoder = encoding.createEncoder();
                encoding.writeVarUint(authEncoder, messageAuth);
                authProtocol.writePermissionDenied(authEncoder, reason);
                ws.send(encoding.toUint8Array(authEncoder));
              });
              break;
            }

            default:
              logger.warn(`Unknown YJS message type: ${messageType}`);
          }
        } catch (error) {
          logger.error(`Error processing YJS message: ${error}`);
        }
      });

      // Handle disconnect
      ws.on("close", () => {
        logger.info(`YJS client disconnected: document=${documentId}, user=${userId}`);
        yjsManager.unregisterClient(ws);
      });

      // Handle errors
      ws.on("error", (error) => {
        logger.error(`YJS WebSocket error: ${error}`);
      });
    },

    /**
     * Force disconnect all clients for a document
     * Useful when a share token is revoked
     */
    disconnectDocument: (documentId: string) => {
      yjsManager.clients.forEach((client: { docId: string }, ws: WebSocket) => {
        if (client.docId === documentId) {
          ws.close(1000, "Document access revoked");
          yjsManager.unregisterClient(ws);
        }
      });
      logger.info(`Disconnected all YJS clients for document: ${documentId}`);
    }
  };
};

/**
 * Get the YJS document manager instance
 */
export const getYjsManager = () => yjsManager;
