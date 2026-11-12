import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
import type { PoolClient } from "pg";
import { db } from "../config/db.js";
import { mapDocumentRow, type DocumentModel } from "../models/document.model.js";
import { createPersistenceAdapter } from "./persistence.js";
import { documentJson, replaceDocumentJson } from "./documentCodec.js";
import { withDocumentLock } from "./documentCoordinator.js";

export type DocumentRoom = { doc: Y.Doc; awareness: Awareness; document: DocumentModel; failure?: unknown };
const rooms = new Map<string, DocumentRoom>();
const persistence = createPersistenceAdapter();
const clone = (doc: Y.Doc) => { const copy = new Y.Doc(); Y.applyUpdate(copy, Y.encodeStateAsUpdate(doc)); return copy; };
const loadState = async (client: PoolClient, document: DocumentModel) => {
  const doc = new Y.Doc();
  try {
    const snapshot = await persistence.load(client, document.id);
    if (snapshot?.revision !== null && snapshot?.revision !== undefined) {
      if (snapshot.revision !== document.revision) throw new Error("Document and collaboration snapshot revisions disagree");
      Y.applyUpdate(doc, snapshot.state);
    } else replaceDocumentJson(doc, document.content);
    if (doc.getMap("metadata").get("title") !== document.title) doc.getMap("metadata").set("title", document.title);
    if (doc.getMap("metadata").get("revision") !== document.revision) doc.getMap("metadata").set("revision", document.revision);
    if (!doc.getMap("metadata").has("generation")) doc.getMap("metadata").set("generation", 0);
    return doc;
  } catch (error) { doc.destroy(); throw error; }
};
const loadRoom = async (id: string): Promise<DocumentRoom> => {
  if (rooms.has(id)) return rooms.get(id)!;
  const client = await db.connect();
  let doc: Y.Doc | undefined;
  try {
    await client.query("BEGIN");
    const result = await client.query("SELECT * FROM documents WHERE id=$1 AND deleted_at IS NULL FOR UPDATE", [id]);
    if (!result.rows[0]) throw new Error("Document not found");
    const document = mapDocumentRow(result.rows[0]);
    doc = await loadState(client, document);
    await persistence.save(client, id, doc, document.revision);
    await client.query("COMMIT");
    const awareness = new Awareness(doc); awareness.setLocalState(null);
    const room = { doc, awareness, document };
    rooms.set(id, room);
    return room;
  } catch (error) { await client.query("ROLLBACK"); doc?.destroy(); throw error; }
  finally { client.release(); }
};
export const openDocumentRoom = (id: string) => withDocumentLock(id, () => loadRoom(id));
export const withDocumentRoom = <T>(id: string, action: (room: DocumentRoom) => T | Promise<T>) =>
  withDocumentLock(id, async () => action(await loadRoom(id)));
export const closeDocumentRoom = (id: string, stillNeeded: () => boolean) => withDocumentLock(id, async () => {
  if (stillNeeded()) return;
  const room = rooms.get(id);
  if (!room) return;
  room.awareness.destroy(); room.doc.destroy(); rooms.delete(id);
});
export const prepareDocumentProjection = async (client: PoolClient, before: DocumentModel, after: DocumentModel) => {
  const existing = rooms.get(before.id);
  const copy = existing ? clone(existing.doc) : await loadState(client, before);
  try {
    if (JSON.stringify(before.content) !== JSON.stringify(after.content)) {
      replaceDocumentJson(copy, after.content);
      copy.getMap("metadata").set("generation", Number(copy.getMap("metadata").get("generation") ?? 0) + 1);
    }
    copy.getMap("metadata").set("title", after.title);
    copy.getMap("metadata").set("revision", after.revision);
    await persistence.save(client, after.id, copy, after.revision);
    return Y.encodeStateAsUpdate(copy);
  } finally { copy.destroy(); }
};
export const publishDocumentProjection = (document: DocumentModel, update: Uint8Array) => {
  const room = rooms.get(document.id);
  if (room) {
    room.document = document; room.failure = undefined;
    Y.applyUpdate(room.doc, update, "rest");
  }
};
export const mergeDocumentUpdate = (id: string, update: Uint8Array, origin?: unknown, checkGeneration = false) => withDocumentLock(id, async () => {
  const room = await loadRoom(id);
  const copy = clone(room.doc);
  let client: PoolClient | undefined;
  try {
    if (checkGeneration) {
      const incoming = new Y.Doc();
      try {
        Y.applyUpdate(incoming, update);
        if (incoming.getMap("metadata").get("generation") !== room.doc.getMap("metadata").get("generation"))
          throw Object.assign(new Error("The document was replaced while you were offline. Your local draft is retained."),
            { status: 409, code: "COLLABORATION_REPLACED", document: room.document });
      } finally { incoming.destroy(); }
    }
    const before = Y.encodeStateAsUpdate(copy);
    Y.applyUpdate(copy, update);
    if (Buffer.from(before).equals(Buffer.from(Y.encodeStateAsUpdate(copy)))) return room.document;
    client = await db.connect();
    await client.query("BEGIN");
    const row = await client.query("SELECT revision FROM documents WHERE id=$1 AND deleted_at IS NULL FOR UPDATE", [id]);
    if (row.rows[0]?.revision !== room.document.revision) throw new Error("Collaboration room revision is stale");
    const title = copy.getMap("metadata").get("title");
    const result = await client.query(
      "UPDATE documents SET content=$1,title=$2,revision=revision+1,updated_at=clock_timestamp() WHERE id=$3 RETURNING *",
      [JSON.stringify(documentJson(copy)), typeof title === "string" ? title : room.document.title, id]
    );
    const document = mapDocumentRow(result.rows[0]);
    copy.getMap("metadata").set("revision", document.revision);
    await persistence.save(client, id, copy, document.revision);
    await client.query("COMMIT");
    room.document = document; room.failure = undefined;
    Y.applyUpdate(room.doc, Y.encodeStateAsUpdate(copy), origin);
    return document;
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    if (!(error instanceof Error && "status" in error && error.status === 409)) room.failure = error;
    throw error;
  } finally { client?.release(); copy.destroy(); }
});
export const flushDocumentRooms = async () => {
  await persistence.flush();
  const failed = [...rooms.values()].find((room) => room.failure);
  if (failed) throw failed.failure;
};
export const disposeDocumentRooms = async () => {
  await flushDocumentRooms();
  for (const room of rooms.values()) { room.awareness.destroy(); room.doc.destroy(); }
  rooms.clear();
};
export const getOpenDocumentRoom = (id: string) => rooms.get(id);
