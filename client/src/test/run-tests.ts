import assert from "node:assert/strict";
import {
  collapseDocumentQueueEntries,
  hasDocumentConflict,
  type DocumentQueueLike,
  type DocumentQueuePayload
} from "../offline/documentQueue.helpers.ts";
import type { DocumentDetail } from "../services/document.service.ts";
import {
  MAX_PROFILE_NAME_LENGTH,
  validateProfileUpdate
} from "../services/user.service.ts";
import { formatWorkspaceName } from "../services/workspace.service.ts";

const makeQueueItem = (
  overrides: Partial<DocumentQueueLike> & { payload?: Partial<DocumentQueuePayload> } = {}
): DocumentQueueLike => ({
  id: overrides.id ?? "entry-1",
  documentId: overrides.documentId ?? "doc-1",
  workspaceId: overrides.workspaceId ?? "workspace-1",
  createdAt: overrides.createdAt ?? 100,
  payload: {
    type: "document_update",
    operation: "update_title_content",
    title: "Draft",
    content: { type: "doc", content: [] },
    updatedAtClient: "2026-03-24T10:00:00.000Z",
    baseUpdatedAt: "2026-03-24T09:00:00.000Z",
    ...(overrides.payload ?? {})
  },
  ...overrides
});

const makeServerDocument = (overrides: Partial<DocumentDetail>): DocumentDetail => ({
  id: overrides.id ?? "doc-1",
  title: overrides.title ?? "Draft",
  content: overrides.content ?? { type: "doc", content: [] },
  updatedAt: overrides.updatedAt ?? "2026-03-24T09:00:00.000Z",
  ownerId: overrides.ownerId ?? "owner-1",
  workspaceId: overrides.workspaceId ?? "workspace-1",
  isStarred: overrides.isStarred ?? false
});

const tests: Array<{ name: string; run: () => void }> = [
  {
    name: "profile validation trims valid input",
    run: () => {
      const result = validateProfileUpdate({
        name: "  Morgan  ",
        image: "https://example.com/avatar.png"
      });
      assert.equal(result.ok, true);
      if (result.ok) {
        assert.deepEqual(result.data, {
          name: "Morgan",
          image: "https://example.com/avatar.png"
        });
      }
    }
  },
  {
    name: "profile validation rejects invalid input",
    run: () => {
      assert.equal(
        validateProfileUpdate({ name: " ", image: "" }).ok,
        false
      );
      assert.equal(
        validateProfileUpdate({
          name: "x".repeat(MAX_PROFILE_NAME_LENGTH + 1),
          image: ""
        }).ok,
        false
      );
      assert.equal(
        validateProfileUpdate({ name: "Riley", image: "notaurl" }).ok,
        false
      );
    }
  },
  {
    name: "workspace name fallback formats workspace ids",
    run: () => {
      assert.equal(formatWorkspaceName("default"), "Shared workspace");
      assert.equal(formatWorkspaceName("shared-client_docs"), "Shared Client Docs");
    }
  },
  {
    name: "document queue collapse keeps the latest entry per document",
    run: () => {
      const collapsed = collapseDocumentQueueEntries([
        makeQueueItem({ id: "old", createdAt: 10 }),
        makeQueueItem({ id: "new", createdAt: 20 }),
        makeQueueItem({
          id: "other-doc",
          documentId: "doc-2",
          createdAt: 15
        })
      ]);

      assert.equal(collapsed.length, 2);
      assert.equal(collapsed[0].id, "new");
      assert.equal(collapsed[1].id, "other-doc");
    }
  },
  {
    name: "document queue conflict detection is explicit",
    run: () => {
      assert.equal(
        hasDocumentConflict(
          makeQueueItem().payload,
          makeServerDocument({ updatedAt: "2026-03-24T09:00:00.000Z" })
        ),
        false
      );

      assert.equal(
        hasDocumentConflict(
          makeQueueItem().payload,
          makeServerDocument({
            title: "Changed remotely",
            updatedAt: "2026-03-24T11:00:00.000Z"
          })
        ),
        true
      );
    }
  }
];

let failed = false;

for (const testCase of tests) {
  try {
    testCase.run();
    console.log(`PASS ${testCase.name}`);
  } catch (error) {
    failed = true;
    console.error(`FAIL ${testCase.name}`);
    console.error(error);
  }
}

if (failed) {
  process.exitCode = 1;
}
