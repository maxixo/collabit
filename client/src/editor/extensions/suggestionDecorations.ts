import type { DocumentSuggestion } from "@shared/types";
import { Extension } from "@tiptap/core";
import type { EditorState } from "@tiptap/pm/state";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { resolveSuggestionRange } from "../suggestionAnchors";

type SuggestionDecorationPluginState = {
  suggestions: DocumentSuggestion[];
  decorations: DecorationSet;
};

type SuggestionDecorationMeta = {
  suggestions?: DocumentSuggestion[];
};

export const suggestionDecorationsKey = new PluginKey<SuggestionDecorationPluginState>("suggestion-decorations");

const getSuggestionClassName = (suggestion: DocumentSuggestion) => {
  if (suggestion.suggestionType === "delete") {
    return "suggestion-decoration suggestion-decoration-delete";
  }
  if (suggestion.suggestionType === "replace") {
    return "suggestion-decoration suggestion-decoration-replace";
  }
  return "suggestion-decoration suggestion-decoration-insert";
};

const createDeleteWidget = (suggestion: DocumentSuggestion) => () => {
  const element = document.createElement("span");
  element.className = "suggestion-decoration suggestion-decoration-delete-widget";
  element.dataset.suggestionId = suggestion.id;
  element.dataset.suggestionType = suggestion.suggestionType;
  element.dataset.suggestionStatus = suggestion.status;
  element.dataset.suggestionAuthorId = suggestion.authorUserId;
  if (suggestion.author?.displayName || suggestion.author?.email) {
    element.dataset.suggestionAuthorName = suggestion.author?.displayName ?? suggestion.author?.email ?? "";
  }
  element.textContent = suggestion.originalText || "Deleted text";
  return element;
};

const buildSuggestionDecorations = (state: EditorState, suggestions: DocumentSuggestion[]) => {
  const decorations: Decoration[] = [];

  suggestions
    .filter((suggestion) => suggestion.status === "pending")
    .forEach((suggestion) => {
      const range = resolveSuggestionRange(state, suggestion);
      if (!range) {
        return;
      }

      const commonAttributes: Record<string, string> = {
        "data-suggestion-id": suggestion.id,
        "data-suggestion-type": suggestion.suggestionType,
        "data-suggestion-status": suggestion.status,
        "data-suggestion-author-id": suggestion.authorUserId,
        class: getSuggestionClassName(suggestion)
      };

      const authorName = suggestion.author?.displayName ?? suggestion.author?.email;
      if (authorName) {
        commonAttributes["data-suggestion-author-name"] = authorName;
      }

      if (suggestion.suggestionType === "delete" && range.from === range.to) {
        decorations.push(
          Decoration.widget(range.from, createDeleteWidget(suggestion), {
            key: `suggestion-widget:${suggestion.id}`,
            side: 1
          })
        );
        return;
      }

      if (range.to <= range.from) {
        return;
      }

      decorations.push(
        Decoration.inline(range.from, range.to, commonAttributes, {
          inclusiveStart: true,
          inclusiveEnd: true
        })
      );
    });

  return DecorationSet.create(state.doc, decorations);
};

export const createSuggestionDecorationsPlugin = () =>
  new Plugin<SuggestionDecorationPluginState>({
    key: suggestionDecorationsKey,
    state: {
      init: (_, state) => ({
        suggestions: [],
        decorations: buildSuggestionDecorations(state, [])
      }),
      apply: (transaction, pluginState, _oldState, newState) => {
        const meta = transaction.getMeta(suggestionDecorationsKey) as SuggestionDecorationMeta | undefined;
        const suggestions = meta?.suggestions ?? pluginState.suggestions;

        if (meta !== undefined || transaction.docChanged) {
          return {
            suggestions,
            decorations: buildSuggestionDecorations(newState, suggestions)
          };
        }

        return pluginState;
      }
    },
    props: {
      decorations: (state) => suggestionDecorationsKey.getState(state)?.decorations ?? null
    }
  });

export const SuggestionDecorationsExtension = Extension.create({
  name: "suggestionDecorations",

  addProseMirrorPlugins() {
    return [createSuggestionDecorationsPlugin()];
  }
});
