import { mergeAttributes, Node, textblockTypeInputRule } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { exitSelectionBlockToParagraph } from "./blockExit";

export interface PersistentCodeBlockOptions {
  languageClassPrefix: string;
  defaultLanguage: string | null | undefined;
  HTMLAttributes: Record<string, unknown>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    codeBlock: {
      setCodeBlock: (attributes?: { language: string }) => ReturnType;
      toggleCodeBlock: (attributes?: { language: string }) => ReturnType;
    };
  }
}

const backtickInputRegex = /^```([a-z]+)?[\s\n]$/;
const tildeInputRegex = /^~~~([a-z]+)?[\s\n]$/;

export const PersistentCodeBlock = Node.create<PersistentCodeBlockOptions>({
  name: "codeBlock",

  priority: 1000,

  addOptions() {
    return {
      languageClassPrefix: "language-",
      defaultLanguage: null,
      HTMLAttributes: {}
    };
  },

  content: "text*",

  marks: "",

  group: "block",

  code: true,

  defining: true,

  addAttributes() {
    return {
      language: {
        default: this.options.defaultLanguage,
        parseHTML: (element) => {
          const classNames = [...(element.firstElementChild?.classList ?? [])];
          const language = classNames
            .filter((className) => className.startsWith(this.options.languageClassPrefix))
            .map((className) => className.replace(this.options.languageClassPrefix, ""))[0];

          return language || null;
        },
        rendered: false
      }
    };
  },

  parseHTML() {
    return [
      {
        tag: "pre",
        preserveWhitespace: "full"
      }
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "pre",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes),
      [
        "code",
        {
          class: node.attrs.language
            ? `${this.options.languageClassPrefix}${String(node.attrs.language)}`
            : null
        },
        0
      ]
    ];
  },

  addCommands() {
    return {
      setCodeBlock: (attributes) => ({ commands }) => commands.setNode(this.name, attributes),
      toggleCodeBlock: (attributes) => ({ commands }) =>
        commands.toggleNode(this.name, "paragraph", attributes)
    };
  },

  addKeyboardShortcuts() {
    return {
      "Mod-Alt-c": () => this.editor.commands.toggleCodeBlock(),
      "Mod-Enter": () => this.editor.commands.newlineInCode(),
      Backspace: () => {
        const { empty, $anchor } = this.editor.state.selection;
        const isAtStart = $anchor.pos === 1;

        if (!empty || $anchor.parent.type.name !== this.name) {
          return false;
        }

        if (isAtStart || !$anchor.parent.textContent.length) {
          return this.editor.commands.clearNodes();
        }

        return false;
      },
      Enter: () => this.editor.commands.newlineInCode(),
      Escape: () => exitSelectionBlockToParagraph(this.editor, new Set([this.name]))
    };
  },

  addInputRules() {
    return [
      textblockTypeInputRule({
        find: backtickInputRegex,
        type: this.type,
        getAttributes: (match) => ({
          language: match[1]
        })
      }),
      textblockTypeInputRule({
        find: tildeInputRegex,
        type: this.type,
        getAttributes: (match) => ({
          language: match[1]
        })
      })
    ];
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("persistentCodeBlockVSCodeHandler"),
        props: {
          handlePaste: (view, event) => {
            if (!event.clipboardData || this.editor.isActive(this.type.name)) {
              return false;
            }

            const text = event.clipboardData.getData("text/plain");
            const vscode = event.clipboardData.getData("vscode-editor-data");
            const vscodeData = vscode ? JSON.parse(vscode) : undefined;
            const language = vscodeData?.mode;

            if (!text || !language) {
              return false;
            }

            const { tr, schema } = view.state;
            const textNode = schema.text(text.replace(/\r\n?/g, "\n"));
            tr.replaceSelectionWith(this.type.create({ language }, textNode));

            if (tr.selection.$from.parent.type !== this.type) {
              tr.setSelection(
                TextSelection.near(tr.doc.resolve(Math.max(0, tr.selection.from - 2)))
              );
            }

            tr.setMeta("paste", true);
            view.dispatch(tr);
            return true;
          }
        }
      })
    ];
  }
});
