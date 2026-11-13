import { WebSocket } from "ws";
import * as Y from "yjs";
import * as sync from "y-protocols/sync";
import * as awareness from "y-protocols/awareness";
import * as auth from "y-protocols/auth";
import { encoding, decoding } from "lib0";
import { logger } from "../utils/logger.js";
import {
  withDocumentRoom, closeDocumentRoom, mergeDocumentUpdate, flushDocumentRooms,
  disposeDocumentRooms, type DocumentRoom
} from "./documentRooms.js";

type Client = { documentId: string; userId: string; canWrite: boolean; ids: Set<number>; room: DocumentRoom; flight: Promise<void> };
type Options = { documentId: string; userId: string; canWrite: boolean };
const send = (ws: WebSocket, writer: (encoder: encoding.Encoder) => void) => {
  if (ws.readyState !== WebSocket.OPEN) return;
  const encoder = encoding.createEncoder(); writer(encoder); ws.send(encoding.toUint8Array(encoder));
};
const payload = (raw: WebSocket.RawData) => new Uint8Array(Array.isArray(raw) ? Buffer.concat(raw) : raw instanceof ArrayBuffer ? raw : raw);

class YjsDocumentManager {
  clients = new Map<WebSocket, Client>();
  private bound = new WeakSet<Y.Doc>();
  private unregistering = new Map<WebSocket, Promise<void>>();
  private accepting = true;
  getClientCount(id: string) { return [...this.clients.values()].filter((client) => client.documentId === id).length; }
  private durable(ws: WebSocket, room: DocumentRoom) {
    send(ws, (encoder) => { encoding.writeVarUint(encoder, 4); encoding.writeVarString(encoder, JSON.stringify({ document: room.document })); });
  }
  private bind(room: DocumentRoom, id: string) {
    if (this.bound.has(room.doc)) return;
    this.bound.add(room.doc);
    room.doc.on("update", (update: Uint8Array, origin: unknown) => {
      this.clients.forEach((client, ws) => {
        if (client.documentId !== id) return;
        if (ws !== origin) send(ws, (encoder) => { encoding.writeVarUint(encoder, 0); sync.writeUpdate(encoder, update); });
        this.durable(ws, room);
      });
    });
    room.awareness.on("update", ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
      const update = awareness.encodeAwarenessUpdate(room.awareness, [...added, ...updated, ...removed]);
      this.clients.forEach((client, ws) => {
        if (client.documentId === id && ws !== origin) send(ws, (encoder) => {
          encoding.writeVarUint(encoder, 1); encoding.writeVarUint8Array(encoder, update);
        });
      });
    });
  }
  async attach(ws: WebSocket, options: Options) {
    if (!this.accepting) { ws.close(1012, "Server is shutting down"); return; }
    await withDocumentRoom(options.documentId, (room) => {
      if (!this.accepting || ws.readyState !== WebSocket.OPEN) return;
      this.bind(room, options.documentId);
      const client: Client = { ...options, ids: new Set(), room, flight: Promise.resolve() };
      this.clients.set(ws, client);
      // Send both steps: initial frames may precede asynchronous socket authentication.
      send(ws, (encoder) => { encoding.writeVarUint(encoder, 0); sync.writeSyncStep2(encoder, room.doc); });
      send(ws, (encoder) => { encoding.writeVarUint(encoder, 0); sync.writeSyncStep1(encoder, room.doc); });
      this.durable(ws, room);
      if (room.awareness.getStates().size) send(ws, (encoder) => {
        encoding.writeVarUint(encoder, 1);
        encoding.writeVarUint8Array(encoder, awareness.encodeAwarenessUpdate(room.awareness, [...room.awareness.getStates().keys()]));
      });
      ws.on("message", (raw) => {
        client.flight = client.flight.then(async () => {
          const decoder = decoding.createDecoder(payload(raw));
          const type = decoding.readVarUint(decoder);
          if (type === 0) {
            const kind = decoding.readVarUint(decoder);
            if (kind === sync.messageYjsSyncStep1) {
              await withDocumentRoom(options.documentId, (active) => send(ws, (encoder) => {
                encoding.writeVarUint(encoder, 0); sync.readSyncStep1(decoder, encoder, active.doc);
              }));
            } else if (kind === sync.messageYjsUpdate || kind === sync.messageYjsSyncStep2) {
              if (!client.canWrite) {
                send(ws, (encoder) => { encoding.writeVarUint(encoder, 2); auth.writePermissionDenied(encoder, "This collaboration session is read-only."); });
                return;
              }
              await mergeDocumentUpdate(options.documentId, decoding.readVarUint8Array(decoder), ws);
              this.durable(ws, room);
            }
          } else if (type === 1) {
            const update = decoding.readVarUint8Array(decoder);
            const ids = decoding.createDecoder(update);
            for (let count = decoding.readVarUint(ids); count > 0; count--) {
              client.ids.add(decoding.readVarUint(ids)); decoding.readVarUint(ids); decoding.readVarString(ids);
            }
            awareness.applyAwarenessUpdate(room.awareness, update, ws);
          } else if (type === 3) send(ws, (encoder) => {
            encoding.writeVarUint(encoder, 1);
            encoding.writeVarUint8Array(encoder, awareness.encodeAwarenessUpdate(room.awareness, [...room.awareness.getStates().keys()]));
          });
        }).catch((error) => {
          logger.error("Collaboration update failed", { documentId: options.documentId, message: String(error) });
          send(ws, (encoder) => { encoding.writeVarUint(encoder, 4); encoding.writeVarString(encoder, JSON.stringify({ error: "Unable to save collaboration changes. Local work is retained." })); });
          ws.close(1011, "Unable to persist changes");
        });
      });
      ws.once("close", () => {
        void this.unregister(ws).catch((error) => logger.error("Collaboration socket cleanup failed", {
          documentId: options.documentId, message: String(error)
        }));
      });
      ws.on("error", (error) => logger.error("Collaboration socket error", { message: error.message }));
    });
    if (ws.readyState !== WebSocket.OPEN)
      await closeDocumentRoom(options.documentId, () => this.getClientCount(options.documentId) > 0);
  }
  async unregister(ws: WebSocket) {
    const pending = this.unregistering.get(ws);
    if (pending) return pending;
    const client = this.clients.get(ws);
    if (!client) return;
    const cleanup = (async () => {
      await client.flight;
      awareness.removeAwarenessStates(client.room.awareness, [...client.ids], ws);
      this.clients.delete(ws);
      await closeDocumentRoom(client.documentId, () => this.getClientCount(client.documentId) > 0);
    })();
    this.unregistering.set(ws, cleanup);
    try { await cleanup; } finally { this.unregistering.delete(ws); }
  }
  disconnectDocument(id: string) {
    this.clients.forEach((client, ws) => { if (client.documentId === id) ws.close(1000, "Document access revoked"); });
  }
  async flush() {
    await Promise.all([...this.clients.values()].map((client) => client.flight));
    await flushDocumentRooms();
  }
  async dispose() { await this.flush(); await disposeDocumentRooms(); }
  async drain(timeoutMs: number) {
    this.accepting = false;
    const sockets = [...this.clients.keys()];
    for (const client of this.clients.values()) await client.flight;
    await Promise.all(sockets.map((socket) => new Promise<void>((resolve) => {
      if (socket.readyState === WebSocket.CLOSED) { resolve(); return; }
      const timer = setTimeout(() => { socket.terminate(); resolve(); }, timeoutMs);
      socket.once("close", () => { clearTimeout(timer); resolve(); });
      socket.close(1001, "Server is shutting down");
    })));
    await Promise.all(sockets.map((socket) => this.unregister(socket)));
    await this.flush();
    await disposeDocumentRooms();
  }
}
const manager = new YjsDocumentManager();
export const createYjsServer = () => manager;
export const getYjsManager = () => manager;
export const drainYjsServer = (timeoutMs: number) => manager.drain(timeoutMs);
