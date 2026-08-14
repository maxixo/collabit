import type { AnyExtension } from "@tiptap/core";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCursor from "@tiptap/extension-collaboration-cursor";
import Highlight from "@tiptap/extension-highlight";
import Placeholder from "@tiptap/extension-placeholder";
import Table from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import StarterKit from "@tiptap/starter-kit";
import type { Awareness } from "y-protocols/awareness";
import type * as Y from "yjs";
import { Link } from "./extensions/link";
import { PersistentBlockquote } from "./extensions/persistentBlockquote";
import { PersistentCodeBlock } from "./extensions/persistentCodeBlock";
import { SuggestionDecorationsExtension } from "./extensions/suggestionDecorations";
import { SuggestionMark } from "./extensions/suggestionMark";

export const editorConfig = {
  placeholder: "Start typing...",
  autosaveIntervalMs: 5000
};

export type CollaborationConfig = {
  doc: Y.Doc;
  awareness?: Awareness;
  user?: {
    name: string;
    color: string;
  };
  showSelection?: boolean;
};

export const createEditorExtensions = (options?: {
  collaboration?: CollaborationConfig;
}): AnyExtension[] => {
  const extensions: AnyExtension[] = [
    StarterKit.configure({
      blockquote: false,
      codeBlock: false,
      history: options?.collaboration?.doc ? false : undefined,
      heading: {
        levels: [1, 2, 3]
      }
    }),
    PersistentBlockquote,
    PersistentCodeBlock,
    Underline,
    Highlight.configure({
      multicolor: false
    }),
    Placeholder.configure({
      placeholder: editorConfig.placeholder,
      includeChildren: true,
      emptyEditorClass: "is-editor-empty"
    }),
    TextAlign.configure({
      types: ["heading", "paragraph"],
      alignments: ["left", "center", "right", "justify"],
      defaultAlignment: "left"
    }),
    TaskList,
    TaskItem.configure({
      nested: true
    }),
    SuggestionMark,
    SuggestionDecorationsExtension,
    Table.configure({
      resizable: true
    }),
    TableRow,
    TableHeader,
    TableCell,
    Link as AnyExtension
  ];

  if (options?.collaboration?.doc) {
    extensions.push(
      Collaboration.configure({
        document: options.collaboration.doc
      })
    );

    if (options.collaboration.awareness) {
      extensions.push(
        CollaborationCursor.configure({
          provider: { awareness: options.collaboration.awareness },
          user: options.collaboration.user ?? { name: "You", color: "#22c55e" },
          selectionRender:
            options.collaboration.showSelection === false
              ? () => ({
                  nodeName: "span",
                  style: "background-color: transparent;"
                })
              : undefined
        })
      );
    }
  }

  return extensions;
};
