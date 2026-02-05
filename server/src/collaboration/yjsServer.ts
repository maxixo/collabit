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
      logger.info(`[YjsServer] 📄 Creating new Y.Doc for document: ${documentId}`);
      const doc = new Y.Doc();
      // Ensure the content fragment exists
      doc.getXmlFragment("content");
      doc.on("update", (update: Uint8Array, origin: unknown) => {
        const originWs = origin instanceof WebSocket ? origin : undefined;
        const originType = origin instanceof WebSocket ? `WebSocket(${origin.readyState})` : typeof origin;
        logger.debug(`[YjsServer] 🔄 Document update received for ${documentId}, origin: ${originType}`);
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
        logger.debug(`[YjsServer] 👥 Awareness update for ${documentId}: added=${added.size}, updated=${updated.size}, removed=${removed.size}`);
        const update = awarenessProtocol.encodeAwarenessUpdate(awareness, changed);
        const originWs = origin instanceof WebSocket ? origin : undefined;
        this.broadcastAwareness(documentId, update, originWs);
      });
      this.awarenessStates.set(documentId, awareness);
      logger.info(`[YjsServer] ✅ Y.Doc created and initialized for ${documentId}`);
    } else {
      logger.debug(`[YjsServer] 📄 Using existing Y.Doc for ${documentId}`);
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
      const timestamp = new Date().toISOString();
      logger.info(`[YjsServer] 🔗 Client connecting: document=${documentId}, user=${userId}, time=${timestamp}`);
      
      const doc = yjsManager.getDocument(documentId);
      const awareness = yjsManager.getAwareness(documentId);
      yjsManager.registerClient(ws, documentId, userId);

      logger.info(`[YjsServer] 👤 Client registered: userId=${userId}, documentId=${documentId}`);
      logger.info(`[YjsServer] 📊 Total clients for ${documentId}: ${yjsManager.getClientCount(documentId)}`);

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
        const msgTimestamp = new Date().toISOString();
        try {
          let payload: Uint8Array | null = null;
          if (typeof data === "string") {
            logger.warn(`[YjsServer] ⚠️  Received string message, ignoring: ${data}`);
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
          logger.debug(`[YjsServer] 📨 Message received at ${msgTimestamp}: type=${messageType}, userId=${userId}, doc=${documentId}`);

          switch (messageType) {
            case messageSync: {
              logger.debug(`[YjsServer] 🔄 Processing sync message for ${documentId} from ${userId}`);
              const encoder = encoding.createEncoder();
              encoding.writeVarUint(encoder, messageSync);
              syncProtocol.readSyncMessage(decoder, encoder, doc, ws, (error) => {
                logger.error(`[YjsServer] ❌ Error processing YJS sync message: ${error}`);
              });
              if (encoding.length(encoder) > 1) {
                ws.send(encoding.toUint8Array(encoder));
                logger.debug(`[YjsServer] 📤 Sync response sent to ${userId} for ${documentId}`);
              }
              break;
            }

            case messageAwareness: {
              const awarenessUpdate = decoding.readVarUint8Array(decoder);
              yjsManager.trackAwareness(ws, awarenessUpdate);
              const beforeStates = awareness.getStates().size;
              awarenessProtocol.applyAwarenessUpdate(awareness, awarenessUpdate, ws);
              const afterStates = awareness.getStates().size;
              logger.debug(`[YjsServer] 👥 Awareness update applied for ${documentId}: states ${beforeStates} → ${afterStates}`);
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
              logger.warn(`[YjsServer] ⚠️  Unknown YJS message type: ${messageType} from ${userId}`);
          }
        } catch (error) {
          logger.error(`[YjsServer] ❌ Error processing YJS message from ${userId} for ${documentId}:`, error);
        }
      });

      // Handle disconnect
      ws.on("close", () => {
        const remainingClients = yjsManager.getClientCount(documentId);
        logger.info(`[YjsServer] 🔌 Client disconnected: document=${documentId}, user=${userId}, remaining=${remainingClients}`);
        yjsManager.unregisterClient(ws);
      });

      // Handle errors
      ws.on("error", (error) => {
        logger.error(`[YjsServer] ❌ WebSocket error for ${userId} on ${documentId}:`, error);
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
