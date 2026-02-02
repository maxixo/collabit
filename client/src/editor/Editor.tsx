import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import type { Editor as TipTapEditor, JSONContent } from "@tiptap/core";
import { createEditorExtensions } from "./editorConfig";
import { Toolbar } from "./Toolbar";
import { destroyYjsProvider, getYjsProvider, type YjsProvider } from "../collaboration/yjsProvider";
import { createSyncManager } from "../collaboration/syncManager";
import { useAuth } from "../auth/AuthContext";
import { joinDocument, leaveDocument } from "../services/presence.service";
import { debounce } from "../utils/debounce";
import { EMPTY_TIPTAP_DOC, sanitizeTipTapContent } from "../utils/tiptapContent";
import { BubbleMenuPortal } from "./BubbleMenuPortal";

const CURSOR_COLORS = ["#22c55e", "#3b82f6", "#f97316", "#ec4899", "#a855f7", "#14b8a6"];

const getCursorColor = (seed: string) => {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return CURSOR_COLORS[hash % CURSOR_COLORS.length];
};

const DEFAULT_USER = {
  userId: "local-user",
  name: "You",
  color: CURSOR_COLORS[0]
};

type EditorStats = {
  wordCount: number;
  charCount: number;
};

type ProviderState = {
  documentId: string;
  provider: YjsProvider;
};

const getTextStats = (value: string): EditorStats => {
  const trimmed = value.trim();
  const wordCount = trimmed ? trimmed.split(/\s+/).length : 0;
  return { wordCount, charCount: value.length };
};

const mergeStats = (first: EditorStats, second: EditorStats): EditorStats => ({
  wordCount: first.wordCount + second.wordCount,
  charCount: first.charCount + second.charCount
});

type EditorSurfaceProps = {
  documentId?: string | null;
  content: JSONContent;
  editable: boolean;
  onChange: (content: JSONContent) => void;
  docTitle: string;
  onTitleChange: (title: string) => void;
  onStatsChange?: (stats: EditorStats) => void;
  onYjsUpdate?: (content: JSONContent) => void;
  onCursorUpdate?: (position: number, range?: { from: number; to: number }) => void;
  onSelectionUpdate?: (selection: { from: number; to: number }) => void;
  collaborationEnabled?: boolean;
  autoFocusTitle?: boolean;
  loading?: boolean;
  error?: string | null;
  shareToken?: string | null;
};

export const EditorSurface = ({
  documentId,
  content,
  editable,
  onChange,
  onTitleChange,
  onStatsChange,
  onYjsUpdate,
  onCursorUpdate,
  onSelectionUpdate,
  collaborationEnabled = false,
  autoFocusTitle = false,
  docTitle,
  loading = false,
  error = null,
  shareToken = null
}: EditorSurfaceProps) => {
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const onStatsChangeRef = useRef(onStatsChange);
  const onYjsUpdateRef = useRef(onYjsUpdate);
  const onCursorUpdateRef = useRef(onCursorUpdate);
  const onSelectionUpdateRef = useRef(onSelectionUpdate);
  const { user: authUser, status: authStatus } = useAuth();
  const [isEmpty, setIsEmpty] = useState(true);
  const didAutoFocusRef = useRef(false);
  const [providerState, setProviderState] = useState<ProviderState | null>(null);
  const provider =
    providerState && providerState.documentId === documentId ? providerState.provider : null;

  const presenceUserId = authStatus === "authenticated" ? authUser?.id ?? null : null;
  const presenceName = authUser?.name ?? authUser?.email ?? "Anonymous";
  const presenceAvatar = authUser?.image ?? undefined;

  const awarenessUser = useMemo(() => {
    if (presenceUserId) {
      return {
        userId: presenceUserId,
        name: presenceName,
        color: getCursorColor(presenceUserId)
      };
    }
    return DEFAULT_USER;
  }, [presenceUserId, presenceName]);

  const collaborationUser = useMemo(
    () => ({
      name: awarenessUser.name,
      color: awarenessUser.color
    }),
    [awarenessUser.name, awarenessUser.color]
  );

  const syncManager = useMemo(
    () =>
      provider ? createSyncManager(provider, {
        user: awarenessUser
      }) : null,
    [provider, awarenessUser]
  );
  const onChangeRef = useRef(onChange);
  const lastHydratedKey = useRef<string | null>(null);

  const debouncedCursorUpdate = useMemo(
    () =>
      debounce((position: number, range?: { from: number; to: number }) => {
        onCursorUpdateRef.current?.(position, range);
      }, 120),
    []
  );

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onStatsChangeRef.current = onStatsChange;
  }, [onStatsChange]);

  useEffect(() => {
    onYjsUpdateRef.current = onYjsUpdate;
  }, [onYjsUpdate]);

  useEffect(() => {
    onCursorUpdateRef.current = onCursorUpdate;
  }, [onCursorUpdate]);

  useEffect(() => {
    onSelectionUpdateRef.current = onSelectionUpdate;
  }, [onSelectionUpdate]);

  useEffect(() => {
    return () => {
      debouncedCursorUpdate.cancel();
    };
  }, [debouncedCursorUpdate, documentId]);

  useEffect(() => {
    didAutoFocusRef.current = false;
  }, [documentId]);

  useEffect(() => {
    if (!documentId || !collaborationEnabled) {
      setProviderState(null);
      return;
    }

    const nextProvider = getYjsProvider(documentId, {
      token: shareToken ?? undefined,
      userId: presenceUserId ?? undefined,
      userName: presenceName,
      userImage: presenceAvatar
    });
    setProviderState({ documentId, provider: nextProvider });

    return () => {
      destroyYjsProvider(documentId);
    };
  }, [documentId, collaborationEnabled, shareToken, presenceUserId, presenceName, presenceAvatar]);

  useEffect(() => {
    if (!documentId || !presenceUserId || !collaborationEnabled) {
      return;
    }

    void joinDocument(documentId, presenceUserId, presenceName, presenceAvatar).catch(() => {});

    return () => {
      void leaveDocument(documentId, presenceUserId).catch(() => {});
    };
  }, [documentId, presenceUserId, collaborationEnabled]);

  useEffect(() => {
    lastHydratedKey.current = null;
    setIsEmpty(true);
  }, [documentId]);

  const updateStats = useCallback(
    (editorInstance: TipTapEditor) => {
      const bodyStats = getTextStats(editorInstance.getText());
      const titleStats = getTextStats(docTitle);
      onStatsChangeRef.current?.(mergeStats(bodyStats, titleStats));
      setIsEmpty(editorInstance.isEmpty);
    },
    [docTitle]
  );

  const editor = useEditor(
    {
      extensions: createEditorExtensions(
        provider
          ? {
              collaboration: {
                doc: provider.doc,
                awareness: provider.awareness,
                user: collaborationUser
              }
            }
          : undefined
      ),
      content: EMPTY_TIPTAP_DOC,
      editable,
      onUpdate: ({ editor: editorInstance }) => {
        const nextContent = editorInstance.getJSON() as JSONContent;
        onChangeRef.current(nextContent);
        updateStats(editorInstance);
      },
      onSelectionUpdate: ({ editor: editorInstance }) => {
        if (!documentId) {
          return;
        }
        const { from, to } = editorInstance.state.selection;
        if (from !== to) {
          debouncedCursorUpdate.cancel();
          onSelectionUpdateRef.current?.({ from, to });
        } else {
          debouncedCursorUpdate(from);
        }
      }
    },
    [documentId, provider]
  );

  const safeEditor = documentId ? editor : null;

  useEffect(() => {
    if (!safeEditor || !provider) {
      return;
    }

    // Check if the TipTap updateUser command is available
    if (typeof safeEditor.commands.updateUser === "function") {
      safeEditor.commands.updateUser({
        name: collaborationUser.name,
        color: collaborationUser.color
      });
    } else {
      // Fallback: Update awareness directly if command not available
      provider.awareness.setLocalState({
        user: {
          name: collaborationUser.name,
          color: collaborationUser.color
        }
      });
    }
  }, [safeEditor, provider, collaborationUser.name, collaborationUser.color]);

  useEffect(() => {
    if (!safeEditor) {
      return;
    }

    const hydrationKey = documentId ?? "local";
    if (lastHydratedKey.current === hydrationKey) {
      return;
    }

    const safeContent = sanitizeTipTapContent(content ?? EMPTY_TIPTAP_DOC);
    safeEditor.commands.setContent(safeContent, false);
    safeEditor.commands.focus("end");
    lastHydratedKey.current = hydrationKey;
    updateStats(safeEditor);
  }, [safeEditor, content, documentId, updateStats]);

  useEffect(() => {
    if (!safeEditor) {
      return;
    }
    updateStats(safeEditor);
  }, [docTitle, safeEditor, updateStats]);

  useEffect(() => {
    if (safeEditor) {
      safeEditor.setEditable(editable);
    }
  }, [safeEditor, editable]);

  useEffect(() => {
    if (!syncManager) {
      return;
    }
    
    // Small delay to ensure editor is fully initialized
    const timeoutId = setTimeout(() => {
      syncManager.start();
    }, 100);
    
    return () => {
      clearTimeout(timeoutId);
      syncManager.stop();
    };
  }, [syncManager]);


  useEffect(() => {
    if (!provider || !safeEditor) {
      return;
    }

    const handleYjsUpdate = () => {
      if (!onYjsUpdateRef.current) {
        return;
      }
      onYjsUpdateRef.current(safeEditor.getJSON() as JSONContent);
    };

    // Small delay to ensure provider is ready
    const timeoutId = setTimeout(() => {
      provider.doc.on("update", handleYjsUpdate);
    }, 150);

    return () => {
      clearTimeout(timeoutId);
      provider.doc.off("update", handleYjsUpdate);
    };
  }, [provider, safeEditor]);

  useEffect(() => {
    if (!autoFocusTitle || !editable || !titleInputRef.current || didAutoFocusRef.current) {
      return;
    }
    titleInputRef.current.focus();
    titleInputRef.current.select();
    didAutoFocusRef.current = true;
  }, [autoFocusTitle, editable]);

  const handleTitleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== "Enter") {
        return;
      }
      event.preventDefault();
      safeEditor?.commands.focus("start");
    },
    [safeEditor]
  );

  const handleSetLink = useCallback(() => {
    if (!safeEditor) {
      return;
    }
    const previousUrl = safeEditor.getAttributes("link").href as string | undefined;
    const nextUrl = window.prompt("Enter URL", previousUrl ?? "");

    if (nextUrl === null) {
      return;
    }

    const trimmed = nextUrl.trim();
    if (!trimmed) {
      safeEditor.chain().focus().extendMarkRange("link").unsetMark("link").run();
      return;
    }

    safeEditor.chain().focus().extendMarkRange("link").setMark("link", { href: trimmed }).run();
  }, [safeEditor]);

  const showEmptyHint = editable && !loading && !error && isEmpty;

  return (
    <>
      <div className="pointer-events-none sticky top-6 z-30 flex justify-center">
        <div className="pointer-events-auto">
          <Toolbar editor={safeEditor} />
        </div>
      </div>

      <div className="relative mx-auto my-12 min-h-[1000px] max-w-[800px] bg-white p-24 text-[#0d0e1b] dark:text-[#0d0e1b]">
        <article className="max-w-none">
          <div className="mb-8">
            <label className="sr-only" htmlFor="document-title">
              Document title
            </label>
            <input
              id="document-title"
              className="w-full border-0 bg-transparent text-4xl font-bold text-[#0d0e1b] placeholder:text-[#0d0e1b]/40 focus:border-0 focus:outline-none focus:ring-0"
              ref={titleInputRef}
              value={docTitle}
              placeholder="Untitled document"
              readOnly={!editable}
              aria-disabled={!editable}
              onChange={(event) => onTitleChange(event.target.value)}
              onKeyDown={handleTitleKeyDown}
            />
          </div>
          {safeEditor && editable ? (
            <BubbleMenuPortal
              editor={safeEditor}
              tippyOptions={{ duration: 150, placement: "top", offset: [0, 8] }}
              shouldShow={({ editor: activeEditor }) =>
                activeEditor.isEditable && !activeEditor.state.selection.empty
              }
              className="flex items-center gap-1 rounded-lg border border-[#e7e7f3] bg-white px-2 py-1 shadow-sm"
            >
              <button
                type="button"
                className={`rounded px-2 py-1 text-sm font-semibold transition-colors ${
                  safeEditor.isActive("bold")
                    ? "bg-[#0d0e1b] text-white"
                    : "text-[#0d0e1b] hover:bg-[#e7e7f3]"
                }`}
                onClick={() => safeEditor.chain().focus().toggleBold().run()}
              >
                B
              </button>
              <button
                type="button"
                className={`rounded px-2 py-1 text-sm font-semibold transition-colors ${
                  safeEditor.isActive("italic")
                    ? "bg-[#0d0e1b] text-white"
                    : "text-[#0d0e1b] hover:bg-[#e7e7f3]"
                }`}
                onClick={() => safeEditor.chain().focus().toggleItalic().run()}
              >
                I
              </button>
              <button
                type="button"
                className={`rounded px-2 py-1 text-sm font-semibold transition-colors ${
                  safeEditor.isActive("link")
                    ? "bg-[#0d0e1b] text-white"
                    : "text-[#0d0e1b] hover:bg-[#e7e7f3]"
                }`}
                onClick={handleSetLink}
              >
                Link
              </button>
            </BubbleMenuPortal>
          ) : null}
          {loading ? (
            <p className="text-base text-[#4c4d9a] dark:text-[#8a8bbd]">Loading document...</p>
          ) : error ? (
            <p className="text-base text-red-500">{error}</p>
          ) : safeEditor && documentId ? (
            <div className="relative">
              <EditorContent editor={safeEditor} className="tiptap text-lg leading-relaxed" />
              <div
                className={`pointer-events-none absolute left-0 top-0 text-lg text-[#8a8bbd] transition-opacity duration-200 ${
                  showEmptyHint ? "opacity-70" : "opacity-0"
                }`}
              >
                Start typing...
              </div>
            </div>
          ) : null}
        </article>

      </div>
    </>
  );
};
