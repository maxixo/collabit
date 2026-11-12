import { createHash } from "node:crypto";
import { withDocumentLock } from "../collaboration/documentCoordinator.js";
import { prepareDocumentProjection, publishDocumentProjection } from "../collaboration/documentRooms.js";
import { db } from "../config/db.js";
import { mapDocumentRow, type DocumentModel } from "../models/document.model.js";
import { createDocumentVersion, getDocumentVersion, type DocumentVersion } from "./documentVersion.service.js";

export class DocumentMutationError extends Error {
  constructor(public status: number, public code: string, message: string, public document?: DocumentModel) { super(message); }
}
export type MutationGuard = { expectedRevision: number; mutationId: string };
export const requireMutationGuard = (body: Record<string, unknown>): MutationGuard => {
  if (body.expectedRevision === undefined)
    throw new DocumentMutationError(428, "REVISION_REQUIRED", "Reload the document before saving. expectedRevision is required.");
  if (!Number.isSafeInteger(body.expectedRevision) || (body.expectedRevision as number) < 0 ||
      typeof body.mutationId !== "string" || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(body.mutationId))
    throw new DocumentMutationError(400, "INVALID_MUTATION", "Provide a nonnegative expectedRevision and a UUID mutationId.");
  return { expectedRevision: body.expectedRevision as number, mutationId: body.mutationId };
};
export type DocumentMutation = MutationGuard & {
  documentId: string; workspaceId: string; actorId: string;
  kind: "update" | "save" | "restore";
  title?: string; content?: Record<string, unknown>; versionNumber?: number;
  applyPendingChanges?: boolean; specificUserChanges?: string[];
};
export type MutationResult = { document: DocumentModel; version?: DocumentVersion; appliedChanges: number };

export const mutateDocument = (input: DocumentMutation): Promise<MutationResult> => withDocumentLock(input.documentId, async () => {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const locked = await client.query(
      `SELECT d.*, EXISTS(SELECT 1 FROM starred_documents s WHERE s.document_id=d.id AND s.user_id=$3) AS is_starred
       FROM documents d WHERE d.id=$1 AND d.workspace_id=$2 AND d.deleted_at IS NULL FOR UPDATE OF d`,
      [input.documentId, input.workspaceId, input.actorId]
    );
    if (!locked.rows[0]) throw new DocumentMutationError(404, "NOT_FOUND", "Document not found");
    const fingerprint = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    const previous = await client.query(
      "SELECT request_hash, response FROM document_mutations WHERE document_id=$1 AND actor_id=$2 AND mutation_id=$3",
      [input.documentId, input.actorId, input.mutationId]
    );
    if (previous.rows[0]) {
      if (previous.rows[0].request_hash !== fingerprint)
        throw new DocumentMutationError(409, "MUTATION_REUSED", "This mutationId was already used for a different request.");
      await client.query("COMMIT");
      return previous.rows[0].response as MutationResult;
    }
    const current = mapDocumentRow(locked.rows[0]);
    if (current.revision !== input.expectedRevision)
      throw new DocumentMutationError(409, "REVISION_CONFLICT", "The document changed. Your local draft is retained.", current);
    let title = input.title ?? current.title;
    let content = input.content ?? current.content;
    if (input.kind === "restore") {
      const version = await getDocumentVersion(input.documentId, input.versionNumber!, input.workspaceId, client);
      if (!version) throw new DocumentMutationError(404, "VERSION_NOT_FOUND", "Version not found");
      title = version.title; content = version.content;
    }
    const updated = await client.query(
      "UPDATE documents SET title=$1, content=$2, revision=revision+1, updated_at=clock_timestamp() WHERE id=$3 RETURNING *",
      [title, JSON.stringify(content), input.documentId]
    );
    const document = { ...mapDocumentRow(updated.rows[0]), isStarred: current.isStarred };
    let appliedChanges = 0;
    if (input.kind === "save" && input.applyPendingChanges) {
      const applied = await client.query(
        `UPDATE document_change_events SET applied=TRUE
         WHERE document_id=$1 AND workspace_id=$2 AND applied=FALSE
         AND ($3::text[] IS NULL OR user_id=ANY($3::text[]))`,
        [input.documentId, input.workspaceId, input.specificUserChanges?.length ? input.specificUserChanges : null]
      );
      appliedChanges = applied.rowCount ?? 0;
    }
    const version = input.kind === "update" ? undefined : await createDocumentVersion(
      input.documentId, title, content, input.actorId, input.workspaceId, client
    );
    const result: MutationResult = { document, version, appliedChanges };
    const projection = await prepareDocumentProjection(client, current, document);
    await client.query(
      "INSERT INTO document_mutations(document_id,actor_id,mutation_id,request_hash,response) VALUES($1,$2,$3,$4,$5)",
      [input.documentId, input.actorId, input.mutationId, fingerprint, JSON.stringify(result)]
    );
    await client.query("COMMIT");
    publishDocumentProjection(document, projection);
    return result;
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
});
