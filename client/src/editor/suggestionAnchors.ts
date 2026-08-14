import type { DocumentSuggestion, SuggestionRelativePositionJson } from "@shared/types";
import type { Editor as TipTapEditor } from "@tiptap/core";
import type { EditorState } from "@tiptap/pm/state";
import { absolutePositionToRelativePosition, relativePositionToAbsolutePosition, ySyncPluginKey } from "y-prosemirror";
import type { ProsemirrorBinding } from "y-prosemirror";
import * as Y from "yjs";

export interface SuggestionRange {
  from: number;
  to: number;
}

const getBinding = (state: EditorState): ProsemirrorBinding | null => {
  const syncState = ySyncPluginKey.getState(state) as { binding?: ProsemirrorBinding } | undefined;
  return syncState?.binding ?? null;
};

const clampPosition = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const normalizeRange = (docSize: number, from: number, to: number): SuggestionRange => {
  const safeFrom = clampPosition(from, 0, docSize);
  const safeTo = clampPosition(to, 0, docSize);
  return safeFrom <= safeTo ? { from: safeFrom, to: safeTo } : { from: safeTo, to: safeFrom };
};

const deserializeRelativePosition = (value: SuggestionRelativePositionJson | null | undefined) =>
  value ? Y.createRelativePositionFromJSON(value) : null;

export const captureSuggestionAnchors = (
  editor: TipTapEditor,
  range: SuggestionRange
): { anchorFrom: SuggestionRelativePositionJson; anchorTo: SuggestionRelativePositionJson } | null => {
  const binding = getBinding(editor.state);
  if (!binding) {
    return null;
  }

  const anchorFrom = absolutePositionToRelativePosition(range.from, binding.type, binding.mapping);
  const anchorTo = absolutePositionToRelativePosition(range.to, binding.type, binding.mapping);

  return {
    anchorFrom: Y.relativePositionToJSON(anchorFrom) as SuggestionRelativePositionJson,
    anchorTo: Y.relativePositionToJSON(anchorTo) as SuggestionRelativePositionJson
  };
};

export const resolveSuggestionRange = (
  state: EditorState,
  suggestion: DocumentSuggestion
): SuggestionRange | null => {
  const binding = getBinding(state);
  const metadata = suggestion.metadata ?? {};
  const anchorFrom = deserializeRelativePosition(metadata.anchorFrom);
  const anchorTo = deserializeRelativePosition(metadata.anchorTo);

  if (binding && anchorFrom && anchorTo) {
    const from = relativePositionToAbsolutePosition(binding.doc, binding.type, anchorFrom, binding.mapping);
    const to = relativePositionToAbsolutePosition(binding.doc, binding.type, anchorTo, binding.mapping);

    if (typeof from === "number" && typeof to === "number") {
      return normalizeRange(state.doc.content.size, from, to);
    }
  }

  if (typeof suggestion.from === "number" && typeof suggestion.to === "number") {
    return normalizeRange(state.doc.content.size, suggestion.from, suggestion.to);
  }

  return null;
};
