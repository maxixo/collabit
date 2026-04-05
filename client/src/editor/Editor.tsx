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
import { ensureTrailingParagraphAfterSelectionBlock, PERSISTENT_BLOCK_NAMES } from "./extensions/blockExit";

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
  contentVersion?: number;
  editable: boolean;
  hideToolbar?: boolean;
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
  contentVersion = 0,
  editable,
  hideToolbar = false,
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
  const [isLinkEditorOpen, setIsLinkEditorOpen] = useState(false);
  const [linkDraft, setLinkDraft] = useState("");
  const didAutoFocusRef = useRef(false);
  const linkEditorRef = useRef<HTMLDivElement | null>(null);
  const linkInputRef = useRef<HTMLInputElement | null>(null);
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
    setIsLinkEditorOpen(false);
    setLinkDraft("");
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
  }, [documentId]);

  const updateStats = useCallback(
    (editorInstance: TipTapEditor) => {
      const bodyStats = getTextStats(editorInstance.getText());
      const titleStats = getTextStats(docTitle);
      onStatsChangeRef.current?.(mergeStats(bodyStats, titleStats));
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
      },
      onBlur: ({ editor: editorInstance }) => {
        ensureTrailingParagraphAfterSelectionBlock(editorInstance, PERSISTENT_BLOCK_NAMES);
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

    const hydrationKey = `${documentId ?? "local"}:${contentVersion}`;
    if (lastHydratedKey.current === hydrationKey) {
      return;
    }

    const safeContent = sanitizeTipTapContent(content ?? EMPTY_TIPTAP_DOC);
    safeEditor.commands.setContent(safeContent, false);
    safeEditor.commands.focus("end");
    lastHydratedKey.current = hydrationKey;
    updateStats(safeEditor);
  }, [safeEditor, content, documentId, contentVersion, updateStats]);

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
    setLinkDraft(previousUrl ?? "");
    setIsLinkEditorOpen(true);
  }, [safeEditor]);

  const handleLinkSubmit = useCallback(() => {
    if (!safeEditor) {
      return;
    }

    const trimmed = linkDraft.trim();
    if (!trimmed) {
      safeEditor.chain().focus().extendMarkRange("link").unsetMark("link").run();
      setIsLinkEditorOpen(false);
      return;
    }

    safeEditor.chain().focus().extendMarkRange("link").setMark("link", { href: trimmed }).run();
    setIsLinkEditorOpen(false);
  }, [linkDraft, safeEditor]);

  const handleLinkRemove = useCallback(() => {
    if (!safeEditor) {
      return;
    }
    safeEditor.chain().focus().extendMarkRange("link").unsetMark("link").run();
    setLinkDraft("");
    setIsLinkEditorOpen(false);
  }, [safeEditor]);

  useEffect(() => {
    if (!isLinkEditorOpen) {
      return;
    }

    linkInputRef.current?.focus();
    linkInputRef.current?.select();
  }, [isLinkEditorOpen]);

  useEffect(() => {
    if (!isLinkEditorOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!linkEditorRef.current?.contains(event.target as Node)) {
        setIsLinkEditorOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [isLinkEditorOpen]);

  useEffect(() => {
    if (hideToolbar) {
      setIsLinkEditorOpen(false);
    }
  }, [hideToolbar]);

  return (
    <>
      <div className="pointer-events-none sticky top-6 z-30 flex justify-center">
        <div className="pointer-events-auto">
          <div className="relative">
            {!hideToolbar ? <Toolbar editor={safeEditor} onRequestLink={handleSetLink} /> : null}
            {!hideToolbar && isLinkEditorOpen ? (
              <div
                ref={linkEditorRef}
                className="absolute left-0 top-full z-40 mt-3 flex w-[320px] flex-col gap-3 rounded-xl border border-[#e7e7f3] bg-white p-3 shadow-2xl"
              >
                <label className="text-xs font-semibold uppercase tracking-[0.18em] text-[#4c4d9a]" htmlFor="editor-link-input">
                  Link URL
                </label>
                <input
                  id="editor-link-input"
                  ref={linkInputRef}
                  className="w-full rounded-lg border border-[#d8d9ef] px-3 py-2 text-sm text-[#0d0e1b] outline-none transition focus:border-[#6163f5] focus:ring-2 focus:ring-[#6163f5]/20"
                  value={linkDraft}
                  placeholder="https://example.com"
                  onChange={(event) => setLinkDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleLinkSubmit();
                    }

                    if (event.key === "Escape") {
                      event.preventDefault();
                      setIsLinkEditorOpen(false);
                    }
                  }}
                />
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    className="rounded-lg px-3 py-2 text-sm font-medium text-[#4c4d9a] transition hover:bg-[#eef0fb]"
                    onClick={() => setIsLinkEditorOpen(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="rounded-lg px-3 py-2 text-sm font-medium text-[#7a2330] transition hover:bg-[#fdecee]"
                    onClick={handleLinkRemove}
                  >
                    Remove
                  </button>
                  <button
                    type="button"
                    className="rounded-lg bg-[#6163f5] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#4d50db]"
                    onClick={handleLinkSubmit}
                  >
                    Apply
                  </button>
                </div>
              </div>
            ) : null}
          </div>
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
                  safeEditor.isActive("underline")
                    ? "bg-[#0d0e1b] text-white"
                    : "text-[#0d0e1b] hover:bg-[#e7e7f3]"
                }`}
                onClick={() => safeEditor.chain().focus().toggleUnderline().run()}
              >
                U
              </button>
              <button
                type="button"
                className={`rounded px-2 py-1 text-sm font-semibold transition-colors ${
                  safeEditor.isActive("highlight")
                    ? "bg-[#0d0e1b] text-white"
                    : "text-[#0d0e1b] hover:bg-[#e7e7f3]"
                }`}
                onClick={() => safeEditor.chain().focus().toggleHighlight().run()}
              >
                Mark
              </button>
              <button
                type="button"
                className={`rounded px-2 py-1 text-sm font-semibold transition-colors ${
                  safeEditor.isActive("code")
                    ? "bg-[#0d0e1b] text-white"
                    : "text-[#0d0e1b] hover:bg-[#e7e7f3]"
                }`}
                onClick={() => safeEditor.chain().focus().toggleCode().run()}
              >
                Code
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
              {safeEditor.isActive("link") ? (
                <button
                  type="button"
                  className="rounded px-2 py-1 text-sm font-semibold text-[#0d0e1b] transition-colors hover:bg-[#e7e7f3]"
                  onClick={handleLinkRemove}
                >
                  Unlink
                </button>
              ) : null}
            </BubbleMenuPortal>
          ) : null}
          {loading ? (
            <p className="text-base text-[#4c4d9a] dark:text-[#8a8bbd]">Loading document...</p>
          ) : error ? (
            <p className="text-base text-red-500">{error}</p>
          ) : safeEditor && documentId ? (
            <div className="relative">
              <EditorContent editor={safeEditor} className="tiptap text-lg leading-relaxed" />
            </div>
          ) : null}
        </article>

      </div>
    </>
  );
};
