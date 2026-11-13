import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { db } from "../src/config/db.js";
import { mutateDocument } from "../src/services/documentMutation.service.js";
import { setStarDocument } from "../src/services/document.service.js";
import * as Y from "yjs";
import { documentJson } from "../src/collaboration/documentCodec.js";
import { openDocumentRoom, mergeDocumentUpdate, closeDocumentRoom, disposeDocumentRooms, flushDocumentRooms } from "../src/collaboration/documentRooms.js";

if (!process.env.DATABASE_URL || !/^\/mvp_stack_[a-f0-9]{32}$/.test(new URL(process.env.DATABASE_URL).pathname))
  throw new Error("Integration tests require the disposable database owned by test:stack.");
after(async () => { await disposeDocumentRooms(); await db.end(); });
const fixture = async () => {
  const documentId = randomUUID();
  await db.query("INSERT INTO documents(id,title,content,owner_id,workspace_id) VALUES($1,'Original',$2,'owner','default')",
    [documentId, JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] })]);
  return { documentId, workspaceId: "default", actorId: "owner", expectedRevision: 0, mutationId: randomUUID(), kind: "update" as const };
};
test("two writers based on the same revision cannot overwrite each other", async () => {
  const input = await fixture();
  const results = await Promise.allSettled([
    mutateDocument({ ...input, title: "First" }),
    mutateDocument({ ...input, mutationId: randomUUID(), title: "Second" })
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
  assert.equal(rejected.reason.code, "REVISION_CONFLICT");
  const row = (await db.query("SELECT title,revision FROM documents WHERE id=$1", [input.documentId])).rows[0];
  assert.equal(row.revision, 1);
  assert.equal(row.title, (results.find((r) => r.status === "fulfilled") as PromiseFulfilledResult<Awaited<ReturnType<typeof mutateDocument>>>).value.document.title);
});
test("a lost save response can be retried without another revision or history version", async () => {
  const input = { ...await fixture(), kind: "save" as const, title: "Saved once" };
  const first = await mutateDocument(input);
  const second = await mutateDocument(input);
  assert.deepEqual(JSON.parse(JSON.stringify(first)), second);
  assert.equal((await db.query("SELECT count(*)::int AS count FROM document_versions WHERE document_id=$1", [input.documentId])).rows[0].count, 1);
  await assert.rejects(mutateDocument({ ...input, title: "Reused identity" }), { code: "MUTATION_REUSED" });
});
test("stale save and restore do not alter content, versions, or pending changes", async () => {
  const input = await fixture();
  const saved = await mutateDocument({ ...input, kind: "save", title: "History title" });
  await mutateDocument({ ...input, expectedRevision: saved.document.revision, mutationId: randomUUID(), title: "Newer work" });
  for (const kind of ["save", "restore"] as const)
    await assert.rejects(mutateDocument({ ...input, kind, mutationId: randomUUID(), versionNumber: 1, applyPendingChanges: true }), { code: "REVISION_CONFLICT" });
  const row = (await db.query("SELECT title,revision FROM documents WHERE id=$1", [input.documentId])).rows[0];
  assert.equal(row.title, "Newer work"); assert.equal(row.revision, 2);
  assert.equal((await db.query("SELECT count(*)::int AS count FROM document_versions WHERE document_id=$1", [input.documentId])).rows[0].count, 1);
  const restored = await mutateDocument({ ...input, kind: "restore", expectedRevision: 2, mutationId: randomUUID(), versionNumber: 1 });
  assert.equal(restored.document.title, "History title");
  assert.equal(restored.document.revision, 3);
});
test("repeating a desired star state never toggles it back", async () => {
  const input = await fixture();
  await Promise.all([setStarDocument(input.documentId, "owner", true), setStarDocument(input.documentId, "owner", true)]);
  assert.equal((await db.query("SELECT count(*)::int AS count FROM starred_documents WHERE document_id=$1", [input.documentId])).rows[0].count, 1);
  await setStarDocument(input.documentId, "owner", false); await setStarDocument(input.documentId, "owner", false);
  assert.equal((await db.query("SELECT count(*)::int AS count FROM starred_documents WHERE document_id=$1", [input.documentId])).rows[0].count, 0);
});
test("content acknowledgements preserve the caller's starred state", async () => {
  const input = await fixture();
  await setStarDocument(input.documentId, "owner", true);
  assert.equal((await mutateDocument({ ...input, title: "Still starred" })).document.isStarred, true);
});

const textNode = (doc: Y.Doc) => (doc.getXmlFragment("content").get(0) as Y.XmlElement).get(0) as Y.XmlText;
const copyOf = (doc: Y.Doc) => { const copy = new Y.Doc(); Y.applyUpdate(copy, Y.encodeStateAsUpdate(doc)); return copy; };
test("concurrent first opens seed JSON once, and two edits survive room disposal and reload", async () => {
  const input = await fixture();
  await db.query("UPDATE documents SET content=$1 WHERE id=$2",
    [JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "seed" }] }] }), input.documentId]);
  const [first, second] = await Promise.all([openDocumentRoom(input.documentId), openDocumentRoom(input.documentId)]);
  assert.equal(first, second);
  const a = copyOf(first.doc), b = copyOf(first.doc);
  textNode(a).insert(4, " alpha"); textNode(b).insert(4, " beta");
  await Promise.all([mergeDocumentUpdate(input.documentId, Y.encodeStateAsUpdate(a)), mergeDocumentUpdate(input.documentId, Y.encodeStateAsUpdate(b))]);
  const content = JSON.stringify(documentJson(first.doc));
  assert.match(content, /alpha/); assert.match(content, /beta/);
  const durableState = Array.from(Y.encodeStateVector(first.doc));
  await closeDocumentRoom(input.documentId, () => false);
  const reopened = await openDocumentRoom(input.documentId);
  assert.deepEqual(Array.from(Y.encodeStateVector(reopened.doc)), durableState);
  assert.equal(JSON.stringify(documentJson(reopened.doc)), content);
  a.destroy(); b.destroy();
});
test("REST and history restore update an open room and preserve a stale offline draft as a conflict", async () => {
  const input = await fixture();
  const room = await openDocumentRoom(input.documentId);
  const offline = copyOf(room.doc);
  const saved = await mutateDocument({ ...input, kind: "save", content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "saved body" }] }] } });
  assert.match(JSON.stringify(documentJson(room.doc)), /saved body/);
  await mutateDocument({ ...input, mutationId: randomUUID(), expectedRevision: saved.document.revision, content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "new body" }] }] } });
  const latest = room.document.revision;
  await mutateDocument({ ...input, kind: "restore", mutationId: randomUUID(), expectedRevision: latest, versionNumber: 1 });
  assert.match(JSON.stringify(documentJson(room.doc)), /saved body/);
  await assert.rejects(mergeDocumentUpdate(input.documentId, Y.encodeStateAsUpdate(offline), undefined, true), { code: "COLLABORATION_REPLACED" });
  offline.destroy();
});
test("a database failure cannot change or acknowledge the live room, and retry persists it", async () => {
  const input = await fixture();
  const room = await openDocumentRoom(input.documentId);
  const next = copyOf(room.doc);
  (next.getXmlFragment("content").get(0) as Y.XmlElement).insert(0, [new Y.XmlText("retained after outage")]);
  const name = "mvp_fail_" + randomUUID().replaceAll("-", "");
  await db.query(`CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.id='${input.documentId}' THEN RAISE EXCEPTION 'injected persistence failure'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER ${name} BEFORE UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION ${name}();`);
  try {
    await assert.rejects(mergeDocumentUpdate(input.documentId, Y.encodeStateAsUpdate(next)), /injected persistence failure/);
    assert.doesNotMatch(JSON.stringify(documentJson(room.doc)), /retained after outage/);
    await assert.rejects(flushDocumentRooms(), /injected persistence failure/);
  } finally { await db.query(`DROP TRIGGER ${name} ON documents; DROP FUNCTION ${name}();`); }
  await mergeDocumentUpdate(input.documentId, Y.encodeStateAsUpdate(next));
  assert.match(JSON.stringify(documentJson(room.doc)), /retained after outage/);
  await flushDocumentRooms(); next.destroy();
});
