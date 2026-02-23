import type { Extension } from "@tiptap/core";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCursor from "@tiptap/extension-collaboration-cursor";
import StarterKit from "@tiptap/starter-kit";
import type { Awareness } from "y-protocols/awareness";
import type * as Y from "yjs";
import { Link } from "./extensions/link";

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
};

export const createEditorExtensions = (options?: {
  collaboration?: CollaborationConfig;
}): Extension[] => {
  const extensions: Extension[] = [
    StarterKit.configure({
      history: options?.collaboration?.doc ? false : undefined
    }),
    Link as Extension
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
          user: options.collaboration.user ?? { name: "You", color: "#22c55e" }
        })
      );
    }
  }

  return extensions;
};
