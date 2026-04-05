import { mergeAttributes, Node, wrappingInputRule } from "@tiptap/core";
import { exitSelectionBlockToParagraph } from "./blockExit";

export interface PersistentBlockquoteOptions {
  HTMLAttributes: Record<string, unknown>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    blockQuote: {
      setBlockquote: () => ReturnType;
      toggleBlockquote: () => ReturnType;
      unsetBlockquote: () => ReturnType;
    };
  }
}

const inputRegex = /^\s*>\s$/;

export const PersistentBlockquote = Node.create<PersistentBlockquoteOptions>({
  name: "blockquote",

  priority: 1000,

  addOptions() {
    return {
      HTMLAttributes: {}
    };
  },

  content: "block+",

  group: "block",

  defining: true,

  parseHTML() {
    return [{ tag: "blockquote" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["blockquote", mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0];
  },

  addCommands() {
    return {
      setBlockquote: () => ({ commands }) => commands.wrapIn(this.name),
      toggleBlockquote: () => ({ commands }) => commands.toggleWrap(this.name),
      unsetBlockquote: () => ({ commands }) => commands.lift(this.name)
    };
  },

  addKeyboardShortcuts() {
    return {
      "Mod-Shift-b": () => this.editor.commands.toggleBlockquote(),
      Enter: () => {
        if (!this.editor.isActive(this.name)) {
          return false;
        }

        return this.editor.commands.splitBlock();
      },
      Escape: () => exitSelectionBlockToParagraph(this.editor, new Set([this.name]))
    };
  },

  addInputRules() {
    return [
      wrappingInputRule({
        find: inputRegex,
        type: this.type
      })
    ];
  }
});
