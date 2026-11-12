import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { db } from "../src/config/db.js";
import { mutateDocument } from "../src/services/documentMutation.service.js";
import { setStarDocument } from "../src/services/document.service.js";

if (!process.env.DATABASE_URL || !/^\/mvp_stack_[a-f0-9]{32}$/.test(new URL(process.env.DATABASE_URL).pathname))
  throw new Error("Integration tests require the disposable database owned by test:stack.");
after(() => db.end());
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
