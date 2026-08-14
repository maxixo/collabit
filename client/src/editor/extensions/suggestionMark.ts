import { Mark, mergeAttributes } from "@tiptap/core";

export const SuggestionMark = Mark.create({
  name: "suggestion",
  inclusive: false,
  priority: 1100,

  addAttributes() {
    return {
      suggestionId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-suggestion-id"),
        renderHTML: (attributes) =>
          attributes.suggestionId ? { "data-suggestion-id": attributes.suggestionId } : {}
      },
      authorId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-suggestion-author-id"),
        renderHTML: (attributes) =>
          attributes.authorId ? { "data-suggestion-author-id": attributes.authorId } : {}
      },
      suggestionType: {
        default: "replace",
        parseHTML: (element) => element.getAttribute("data-suggestion-type") ?? "replace",
        renderHTML: (attributes) => ({ "data-suggestion-type": attributes.suggestionType ?? "replace" })
      },
      status: {
        default: "pending",
        parseHTML: (element) => element.getAttribute("data-suggestion-status") ?? "pending",
        renderHTML: (attributes) => ({ "data-suggestion-status": attributes.status ?? "pending" })
      },
      authorName: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-suggestion-author-name"),
        renderHTML: (attributes) =>
          attributes.authorName ? { "data-suggestion-author-name": attributes.authorName } : {}
      }
    };
  },

  parseHTML() {
    return [{ tag: "mark[data-suggestion-id]" }];
  },

  renderHTML({ HTMLAttributes }) {
    const status = HTMLAttributes["data-suggestion-status"] ?? "pending";
    return [
      "mark",
      mergeAttributes(HTMLAttributes, {
        class:
          status === "pending"
            ? "suggestion-mark suggestion-mark-pending"
            : status === "accepted"
              ? "suggestion-mark suggestion-mark-accepted"
              : "suggestion-mark suggestion-mark-rejected"
      }),
      0
    ];
  }
});
