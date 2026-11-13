import * as Y from "yjs";
import type { PoolClient } from "pg";
import { flushDocumentOperations } from "./documentCoordinator.js";

export const createPersistenceAdapter = () => ({
  load: async (client: PoolClient, documentId: string) => {
    const result = await client.query("SELECT state,revision FROM document_snapshots WHERE document_id=$1", [documentId]);
    return result.rows[0] as { state: Buffer; revision: number | null } | undefined;
  },
  save: async (client: PoolClient, documentId: string, doc: Y.Doc, revision: number) => {
    await client.query(
      `INSERT INTO document_snapshots(document_id,state,revision,updated_at) VALUES($1,$2,$3,clock_timestamp())
       ON CONFLICT(document_id) DO UPDATE SET state=EXCLUDED.state,revision=EXCLUDED.revision,updated_at=EXCLUDED.updated_at`,
      [documentId, Buffer.from(Y.encodeStateAsUpdate(doc)), revision]
    );
  },
  flush: flushDocumentOperations
});
