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
import { getPrimarySuggestionChange } from "../editor/suggestionChanges.ts";

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

const makeSuggestionTransaction = (options: {
  oldRange: { from: number; to: number };
  newRange: { from: number; to: number };
  originalText: string;
  suggestedText: string;
}) => {
  let sliceCallCount = 0;
  let invertCallCount = 0;

  return {
    mapping: {
      maps: [
        {
          forEach: (callback: (from: number, to: number) => void) => {
            callback(options.oldRange.from, options.oldRange.to);
          }
        }
      ],
      slice: () => ({
        map: () => {
          sliceCallCount += 1;
          return sliceCallCount === 1 ? options.newRange.from : options.newRange.to;
        }
      }),
      invert: () => ({
        map: () => {
          invertCallCount += 1;
          return invertCallCount === 1 ? options.oldRange.from : options.oldRange.to;
        }
      })
    },
    steps: [
      {
        from: options.oldRange.from,
        to: options.oldRange.to
      }
    ],
    before: {
      textBetween: (from: number, to: number) =>
        from === options.oldRange.from && to === options.oldRange.to ? options.originalText : ""
    },
    doc: {
      textBetween: (from: number, to: number) =>
        from === options.newRange.from && to === options.newRange.to ? options.suggestedText : ""
    }
  } as never;
};

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
  },
  {
    name: "suggestion helper classifies inserts",
    run: () => {
      const change = getPrimarySuggestionChange(
        makeSuggestionTransaction({
          oldRange: { from: 5, to: 5 },
          newRange: { from: 5, to: 10 },
          originalText: "",
          suggestedText: "hello"
        })
      );

      assert.equal(change?.suggestionType, "insert");
      assert.equal(change?.suggestedText, "hello");
      assert.equal(change?.originalText, null);
    }
  },
  {
    name: "suggestion helper classifies deletes",
    run: () => {
      const change = getPrimarySuggestionChange(
        makeSuggestionTransaction({
          oldRange: { from: 3, to: 8 },
          newRange: { from: 3, to: 3 },
          originalText: "draft",
          suggestedText: ""
        })
      );

      assert.equal(change?.suggestionType, "delete");
      assert.equal(change?.originalText, "draft");
      assert.equal(change?.suggestedText, null);
    }
  },
  {
    name: "suggestion helper classifies replacements",
    run: () => {
      const change = getPrimarySuggestionChange(
        makeSuggestionTransaction({
          oldRange: { from: 2, to: 5 },
          newRange: { from: 2, to: 6 },
          originalText: "old",
          suggestedText: "newer"
        })
      );

      assert.equal(change?.suggestionType, "replace");
      assert.equal(change?.originalText, "old");
      assert.equal(change?.suggestedText, "newer");
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
