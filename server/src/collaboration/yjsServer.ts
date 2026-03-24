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

type ClientInfo = {
  docId: string;
  userId: string;
  canWrite: boolean;
  clientIds: Set<number>;
};

type AttachOptions = {
  documentId: string;
  userId: string;
  canWrite: boolean;
};

class YjsDocumentManager {
  private documents = new Map<string, Y.Doc>();
  private awarenessStates = new Map<string, awarenessProtocol.Awareness>();
  clients = new Map<WebSocket, ClientInfo>();

  getDocument(documentId: string): Y.Doc {
    if (!this.documents.has(documentId)) {
      const doc = new Y.Doc();
      doc.getXmlFragment("content");
      doc.on("update", (update: Uint8Array, origin: unknown) => {
        const originSocket = origin instanceof WebSocket ? origin : undefined;
        this.broadcastUpdate(documentId, update, originSocket);
      });

      const awareness = new awarenessProtocol.Awareness(doc);
      awareness.setLocalState(null);
      awareness.on(
        "update",
        (
          { added, updated, removed }: { added: Set<number>; updated: Set<number>; removed: Set<number> },
          origin: unknown
        ) => {
          const changed = [...added, ...updated, ...removed];
          if (changed.length === 0) {
            return;
          }

          const update = awarenessProtocol.encodeAwarenessUpdate(awareness, changed);
          const originSocket = origin instanceof WebSocket ? origin : undefined;
          this.broadcastAwareness(documentId, update, originSocket);
        }
      );

      this.documents.set(documentId, doc);
      this.awarenessStates.set(documentId, awareness);
      logger.info(`[YjsServer] initialized document ${documentId}`);
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

  removeDocument(documentId: string): void {
    const doc = this.documents.get(documentId);
    if (!doc) {
      return;
    }

    doc.destroy();
    this.documents.delete(documentId);
    this.awarenessStates.delete(documentId);
    logger.info(`[YjsServer] removed document ${documentId}`);
  }

  registerClient(ws: WebSocket, documentId: string, userId: string, canWrite: boolean): void {
    this.clients.set(ws, { docId: documentId, userId, canWrite, clientIds: new Set() });
  }

  unregisterClient(ws: WebSocket): void {
    const client = this.clients.get(ws);
    if (!client) {
      return;
    }

    const awareness = this.awarenessStates.get(client.docId);
    if (awareness && client.clientIds.size > 0) {
      awarenessProtocol.removeAwarenessStates(awareness, Array.from(client.clientIds), ws);
    }

    if (this.getClientCount(client.docId) === 1) {
      this.removeDocument(client.docId);
    }

    this.clients.delete(ws);
  }

  trackAwareness(ws: WebSocket, update: Uint8Array): void {
    const client = this.clients.get(ws);
    if (!client) {
      return;
    }

    const decoder = decoding.createDecoder(update);
    const updateCount = decoding.readVarUint(decoder);
    for (let index = 0; index < updateCount; index += 1) {
      const clientId = decoding.readVarUint(decoder);
      client.clientIds.add(clientId);
      decoding.readVarUint(decoder);
      decoding.readVarString(decoder);
    }
  }

  getClientCount(documentId: string): number {
    let count = 0;
    this.clients.forEach((client) => {
      if (client.docId === documentId) {
        count += 1;
      }
    });
    return count;
  }

  broadcastUpdate(documentId: string, update: Uint8Array, excludeSocket?: WebSocket): void {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageSync);
    syncProtocol.writeUpdate(encoder, update);
    const payload = encoding.toUint8Array(encoder);

    this.clients.forEach((client, ws) => {
      if (client.docId === documentId && ws !== excludeSocket && ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    });
  }

  broadcastAwareness(documentId: string, update: Uint8Array, excludeSocket?: WebSocket): void {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageAwareness);
    encoding.writeVarUint8Array(encoder, update);
    const payload = encoding.toUint8Array(encoder);

    this.clients.forEach((client, ws) => {
      if (client.docId === documentId && ws !== excludeSocket && ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    });
  }
}

const yjsManager = new YjsDocumentManager();

const sendPermissionDenied = (ws: WebSocket, reason: string) => {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageAuth);
  authProtocol.writePermissionDenied(encoder, reason);
  ws.send(encoding.toUint8Array(encoder));
};

const toPayload = (data: WebSocket.RawData): Uint8Array | null => {
  if (typeof data === "string") {
    return null;
  }

  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }

  if (Array.isArray(data)) {
    return new Uint8Array(Buffer.concat(data));
  }

  return new Uint8Array(data);
};

const getSyncMessageType = (payload: Uint8Array) => {
  const decoder = decoding.createDecoder(payload);
  decoding.readVarUint(decoder);
  return decoding.readVarUint(decoder);
};

export const createYjsServer = () => {
  return {
    attach: (ws: WebSocket, { documentId, userId, canWrite }: AttachOptions) => {
      const doc = yjsManager.getDocument(documentId);
      const awareness = yjsManager.getAwareness(documentId);
      yjsManager.registerClient(ws, documentId, userId, canWrite);

      logger.info(
        `[YjsServer] attached user=${userId} document=${documentId} canWrite=${canWrite}`
      );

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

      ws.on("message", (data: WebSocket.RawData) => {
        const payload = toPayload(data);
        if (!payload) {
          logger.warn(`[YjsServer] ignored non-binary message for document=${documentId}`);
          return;
        }

        try {
          const decoder = decoding.createDecoder(payload);
          const messageType = decoding.readVarUint(decoder);

          switch (messageType) {
            case messageSync: {
              const syncMessageType = getSyncMessageType(payload);
              if (
                !canWrite &&
                (
                  syncMessageType === syncProtocol.messageYjsSyncStep2 ||
                  syncMessageType === syncProtocol.messageYjsUpdate
                )
              ) {
                sendPermissionDenied(ws, "This collaboration session is read-only.");
                return;
              }

              const response = encoding.createEncoder();
              encoding.writeVarUint(response, messageSync);
              syncProtocol.readSyncMessage(decoder, response, doc, ws, (error) => {
                logger.error(`[YjsServer] sync error for document=${documentId}:`, error);
              });

              if (encoding.length(response) > 1) {
                ws.send(encoding.toUint8Array(response));
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
              const response = encoding.createEncoder();
              encoding.writeVarUint(response, messageAwareness);
              encoding.writeVarUint8Array(
                response,
                awarenessProtocol.encodeAwarenessUpdate(
                  awareness,
                  Array.from(awareness.getStates().keys())
                )
              );
              ws.send(encoding.toUint8Array(response));
              break;
            }

            case messageAuth: {
              authProtocol.readAuthMessage(decoder, doc, (_doc, reason) => {
                logger.warn(`[YjsServer] auth denied for document=${documentId}: ${reason}`);
                sendPermissionDenied(ws, reason);
              });
              break;
            }

            default:
              logger.warn(`[YjsServer] unknown message type=${messageType} document=${documentId}`);
          }
        } catch (error) {
          logger.error(`[YjsServer] message handling failed for document=${documentId}:`, error);
        }
      });

      ws.on("close", () => {
        yjsManager.unregisterClient(ws);
        logger.info(`[YjsServer] detached user=${userId} document=${documentId}`);
      });

      ws.on("error", (error) => {
        logger.error(`[YjsServer] socket error for document=${documentId}:`, error);
      });
    },

    disconnectDocument: (documentId: string) => {
      yjsManager.clients.forEach((client, ws) => {
        if (client.docId === documentId) {
          ws.close(1000, "Document access revoked");
          yjsManager.unregisterClient(ws);
        }
      });
      logger.info(`[YjsServer] disconnected clients for document=${documentId}`);
    }
  };
};

export const getYjsManager = () => yjsManager;
