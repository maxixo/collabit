import type { Editor as TipTapEditor } from "@tiptap/core";
import type { ResolvedPos } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";

export const PERSISTENT_BLOCK_NAMES = new Set(["blockquote", "codeBlock"]);

type SelectionBlockBoundary = {
  after: number;
  indexInParent: number;
  nextNodeName: string | null;
  parentChildCount: number;
};

const getSelectionBlockBoundary = (
  $from: ResolvedPos,
  blockNames: ReadonlySet<string>
): SelectionBlockBoundary | null => {
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);

    if (!blockNames.has(node.type.name)) {
      continue;
    }

    const parentDepth = depth - 1;
    const parentNode = $from.node(parentDepth);
    const indexInParent = $from.index(parentDepth);
    const nextNode =
      indexInParent + 1 < parentNode.childCount ? parentNode.child(indexInParent + 1) : null;

    return {
      after: $from.after(depth),
      indexInParent,
      nextNodeName: nextNode?.type.name ?? null,
      parentChildCount: parentNode.childCount
    };
  }

  return null;
};

export const ensureTrailingParagraphAfterSelectionBlock = (
  editor: TipTapEditor,
  blockNames: ReadonlySet<string> = PERSISTENT_BLOCK_NAMES
) => {
  const boundary = getSelectionBlockBoundary(editor.state.selection.$from, blockNames);

  if (!boundary || boundary.indexInParent < boundary.parentChildCount - 1) {
    return false;
  }

  const paragraphNode = editor.state.schema.nodes.paragraph?.create();

  if (!paragraphNode) {
    return false;
  }

  const tr = editor.state.tr.insert(boundary.after, paragraphNode);
  editor.view.dispatch(tr);
  return true;
};

export const exitSelectionBlockToParagraph = (
  editor: TipTapEditor,
  blockNames: ReadonlySet<string> = PERSISTENT_BLOCK_NAMES
) => {
  const boundary = getSelectionBlockBoundary(editor.state.selection.$from, blockNames);

  if (!boundary) {
    return false;
  }

  const paragraphNode = editor.state.schema.nodes.paragraph?.create();

  if (!paragraphNode) {
    return false;
  }

  const tr = editor.state.tr;

  if (boundary.nextNodeName !== "paragraph") {
    tr.insert(boundary.after, paragraphNode);
  }

  tr.setSelection(TextSelection.near(tr.doc.resolve(boundary.after + 1)));
  editor.view.dispatch(tr.scrollIntoView());
  return true;
};
