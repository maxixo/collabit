import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { JSONContent } from "@tiptap/core";
import { EditorSurface } from "../editor/Editor";
import { Presence } from "../editor/Presence";
import { useDocument } from "../hooks/useDocument";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import { usePresence } from "../hooks/usePresence";
import { useStarToggle } from "../hooks/useStarToggle";
import { useAppStore, actions, type Collaborator } from "../app/store";
import { createDocument, fetchDocuments } from "../services/document.service";
import { validateShareToken } from "../services/share.service";
import { searchDocumentsWithFallback } from "../services/search.service";
import { indexDocument, type SearchResult } from "../offline/searchIndex";
import { debounce } from "../utils/debounce";
import { EMPTY_TIPTAP_DOC } from "../utils/tiptapContent";
import { subscribeToStarUpdates } from "../utils/starEvents";
import { ConflictModal } from "../components/ConflictModal";
import { UserMenu } from "../components/UserMenu";
import { ShareModal } from "../components/ShareModal";
import { SaveConfirmationModal } from "../components/SaveConfirmationModal";
import { HistoryModal } from "../components/HistoryModal";
import { resetProvider } from "../collaboration/yjsProvider";
import { usePendingChanges } from "../hooks/usePendingChanges";
import { registerDebugCommands } from "../utils/debug";
import { exportDocumentAsDoc, exportDocumentAsPdf } from "../utils/exportDocument";

const isTruthyParam = (value: string | null) => {
  if (value === null) {
    return false;
  }
  if (value === "") {
    return true;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
};

const normalizeToken = (value: string | null) => {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

export const Editor = () => {
  const emptyContent: JSONContent = EMPTY_TIPTAP_DOC;
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const shareToken = normalizeToken(searchParams.get("token") ?? searchParams.get("shareToken"));
  const shareRequested =
    isTruthyParam(searchParams.get("share")) || isTruthyParam(searchParams.get("shared"));
  const collabRequested =
    isTruthyParam(searchParams.get("collab")) || isTruthyParam(searchParams.get("collaboration"));
  const queryWorkspaceId = searchParams.get("workspaceId")?.trim() ?? "";
  const [resolvedWorkspaceId, setResolvedWorkspaceId] = useState(() => {
    if (shareToken && !queryWorkspaceId) {
      return "";
    }
    return queryWorkspaceId || "default";
  });
  const workspaceId = resolvedWorkspaceId;
  const collaborationRequested =
    (location.state as { collaboration?: boolean } | null)?.collaboration === true ||
    collabRequested ||
    (shareRequested && !collabRequested);
  
  // Store hooks
  const { recentDocuments, saveStatus: globalSaveStatus, dispatch } = useAppStore();
  const isOnline = useOnlineStatus();
  const [collaborationDocs, setCollaborationDocs] = useState<Record<string, boolean>>({});
  const presenceDocumentId = id && (collaborationDocs[id] || collaborationRequested) ? id : null;
  const { onlineCount, collaborators, sendCursorUpdate, sendSelectionUpdate } = usePresence(presenceDocumentId);
  const { toggleStar } = useStarToggle();
  
  // Document hooks
  const {
    document,
    accessRole,
    updateDocument,
    setLocalDocument,
    loading,
    error,
    saveStatus,
    conflictState,
    reloadDocument
  } = useDocument(id, workspaceId, { shareToken: shareToken ?? undefined });
  const activeDocument = id ? (document?.id === id ? document : null) : document;
  const documentRef = useRef(activeDocument);
  const updateDocumentRef = useRef(updateDocument);
  
  // UI State
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [editorStats, setEditorStats] = useState({ wordCount: 0, charCount: 0 });
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchStatus, setSearchStatus] = useState<"idle" | "loading" | "local" | "remote">("idle");
  const [shareValidationError, setShareValidationError] = useState<string | null>(null);
  const [isValidatingShare, setIsValidatingShare] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [isExportingFormat, setIsExportingFormat] = useState<"pdf" | "doc" | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);
  
  // Conflict Modal State
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [localVersion, setLocalVersion] = useState<JSONContent>(EMPTY_TIPTAP_DOC);
  const [serverVersion, setServerVersion] = useState<JSONContent>(EMPTY_TIPTAP_DOC);

  // Share Modal State
  const [showShareModal, setShowShareModal] = useState(false);
  
  // Save Confirmation Modal State
  const [showSaveModal, setShowSaveModal] = useState(false);
  
  // History Modal State
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyRefreshToken, setHistoryRefreshToken] = useState(0);
  const [contentResetVersion, setContentResetVersion] = useState(0);
  
  // Display helpers - declare these early since they're used in conditional checks
  const hasShareTokenError = Boolean(shareValidationError);
  const fallbackTitle = id ? id.replace(/-/g, " ") : "Untitled document";
  const docTitle = activeDocument?.title ?? fallbackTitle;
  const displayTitle = docTitle.trim().length > 0 ? docTitle : "Untitled document";
  const shouldFocusTitle = Boolean((location.state as { focusTitle?: boolean } | null)?.focusTitle);
  const isRecentRoute = location.pathname === "/editor/recent";
  const isStarredRoute = location.pathname === "/editor/starred";
  const isSharedRoute = location.pathname === "/editor/shared";
  const isTrashRoute = location.pathname === "/editor/trash";
  const buildWorkspaceRoute = (path: string) =>
    workspaceId ? `${path}?workspaceId=${encodeURIComponent(workspaceId)}` : path;

  const navLinkClass = (isActive: boolean) =>
    isActive
      ? "flex items-center gap-3 rounded-lg bg-[#e7e7f3] px-3 py-2 text-[#0d0e1b] dark:bg-[#1c1d3a] dark:text-white"
      : "flex items-center gap-3 rounded-lg px-3 py-2 text-[#4c4d9a] hover:bg-[#e7e7f3]/50 dark:text-[#8a8bbd] dark:hover:bg-[#1c1d3a]/50";

  useEffect(() => {
    if (queryWorkspaceId && queryWorkspaceId !== resolvedWorkspaceId) {
      setResolvedWorkspaceId(queryWorkspaceId);
    }
  }, [queryWorkspaceId, resolvedWorkspaceId]);

  useEffect(() => {
    if (!shareToken) {
      setShareValidationError(null);
      setIsValidatingShare(false);
      return;
    }

    let isActive = true;
    setIsValidatingShare(true);
    setShareValidationError(null);

    validateShareToken(shareToken)
      .then(() => {
        if (isActive) {
          setIsValidatingShare(false);
        }
      })
      .catch((err) => {
        if (isActive) {
          setIsValidatingShare(false);
          const errorMessage = err instanceof Error ? err.message : "Share link is invalid";
          // Provide user-friendly error messages
          if (errorMessage === "Share token not found") {
            setShareValidationError("This share link has been revoked or no longer exists. Please generate a new link.");
          } else if (errorMessage === "Share token expired") {
            setShareValidationError("This share link has expired. Please generate a new link.");
          } else {
            setShareValidationError(errorMessage);
          }
        }
      });

    return () => {
      isActive = false;
    };
  }, [shareToken]);
  
  // Sync connection status with online status
  useEffect(() => {
    const status: "online" | "offline" | "reconnecting" = isOnline ? "online" : "offline";
    dispatch(actions.setConnectionStatus(status));
  }, [isOnline, dispatch]);
  
  // Sync save status with global store
  useEffect(() => {
    if (saveStatus === "conflict") {
      dispatch(actions.setSaveStatus("conflict"));
      setShowConflictModal(true);
      setLocalVersion(
        conflictState?.local.content as JSONContent ??
        documentRef.current?.content as JSONContent ??
        EMPTY_TIPTAP_DOC
      );
      setServerVersion(conflictState?.server.content as JSONContent ?? EMPTY_TIPTAP_DOC);
    } else if (saveStatus === "syncing") {
      dispatch(actions.setSaveStatus("syncing"));
    } else if (saveStatus === "offline") {
      dispatch(actions.setSaveStatus("offline"));
    } else if (saveStatus === "queued") {
      dispatch(actions.setSaveStatus("queued"));
    } else if (saveStatus === "error") {
      dispatch(actions.setSaveStatus("error"));
    } else if (saveStatus === "saved") {
      dispatch(actions.setSaveStatus("saved"));
    }
    // Don't sync "idle" state to store - keep previous state
  }, [conflictState, dispatch, saveStatus]);
  
  // Set active document
  useEffect(() => {
    dispatch(actions.setActiveDocument(id || null));
  }, [id, dispatch]);
  
  // Fetch recent documents
  useEffect(() => {
    if (!workspaceId) {
      return;
    }
    const loadRecentDocuments = async () => {
      try {
        const docs = await fetchDocuments(workspaceId);
        dispatch(actions.setRecentDocuments(docs));
      } catch (err) {
        console.error("Failed to fetch recent documents:", err);
      }
    };
    
    loadRecentDocuments();
  }, [workspaceId, dispatch]);
  
  const displaySaveStatus = saveStatus === "idle" ? globalSaveStatus : saveStatus;
  const saveLabel =
    displaySaveStatus === "saving"
      ? "Saving..."
      : displaySaveStatus === "syncing"
        ? "Syncing..."
        : displaySaveStatus === "offline"
          ? "Offline"
          : displaySaveStatus === "queued"
            ? "Queued"
            : displaySaveStatus === "error"
              ? "Error"
              : displaySaveStatus === "conflict"
                ? "Conflict"
                : "Saved";
  const saveIcon =
    displaySaveStatus === "saving" || displaySaveStatus === "syncing"
      ? "cloud_upload"
      : displaySaveStatus === "offline"
        ? "cloud_off"
        : displaySaveStatus === "queued"
          ? "schedule"
          : displaySaveStatus === "error"
            ? "error"
            : displaySaveStatus === "conflict"
              ? "warning"
              : "cloud_done";
  const saveClass =
    displaySaveStatus === "error" || displaySaveStatus === "conflict"
      ? "text-red-500"
      : displaySaveStatus === "offline" || displaySaveStatus === "queued"
        ? "text-amber-600"
        : "text-[#4c4d9a]";

  useEffect(() => {
    documentRef.current = activeDocument;
  }, [activeDocument]);

  useEffect(() => {
    updateDocumentRef.current = updateDocument;
  }, [updateDocument]);

  useEffect(() => {
    if (!shareToken || !document?.workspaceId) {
      return;
    }

    if (document.workspaceId !== resolvedWorkspaceId) {
      setResolvedWorkspaceId(document.workspaceId);
    }

    if (document.workspaceId !== queryWorkspaceId) {
      const params = new URLSearchParams(searchParams);
      params.set("workspaceId", document.workspaceId);
      navigate(`/editor/${encodeURIComponent(document.id)}?${params.toString()}`, {
        replace: true,
        state: { collaboration: collaborationRequested }
      });
    }
  }, [
    shareToken,
    document?.workspaceId,
    document?.id,
    resolvedWorkspaceId,
    queryWorkspaceId,
    searchParams,
    navigate,
    collaborationRequested
  ]);

  const debouncedYjsIndexUpdate = useMemo(
    () =>
      debounce((payload: { id: string; title: string; workspaceId: string; content: JSONContent }) => {
        void indexDocument({
          ...payload,
          updatedAt: new Date().toISOString()
        });
      }, 500),
    [indexDocument]
  );

  const handleContentChange = useCallback((nextContent: JSONContent) => {
    const currentDocument = documentRef.current;
    if (!currentDocument) {
      return;
    }

    const nextDocument = {
      ...currentDocument,
      content: nextContent as Record<string, unknown>,
      updatedAt: new Date().toISOString()
    };

    documentRef.current = nextDocument;
    updateDocumentRef.current(nextDocument);
  }, []);

  const handleYjsUpdate = useCallback(
    (nextContent: JSONContent) => {
      const currentDocument = documentRef.current;
      if (!currentDocument) {
        return;
      }

      const documentId = currentDocument.id ?? id;
      if (!documentId) {
        return;
      }

      debouncedYjsIndexUpdate({
        id: documentId,
        title: currentDocument.title ?? "",
        workspaceId: currentDocument.workspaceId ?? workspaceId,
        content: nextContent
      });
    },
    [debouncedYjsIndexUpdate, id, workspaceId]
  );

  const handleTitleChange = useCallback((nextTitle: string) => {
    const currentDocument = documentRef.current;
    if (!currentDocument) {
      return;
    }

    const nextDocument = {
      ...currentDocument,
      title: nextTitle,
      updatedAt: new Date().toISOString()
    };

    documentRef.current = nextDocument;
    updateDocumentRef.current(nextDocument);
    
    // Update in recent documents list
    if (currentDocument.id) {
      dispatch(actions.updateRecentDocument({
        id: currentDocument.id,
        title: nextTitle,
        updatedAt: new Date().toISOString(),
        ownerId: currentDocument.ownerId,
        workspaceId: currentDocument.workspaceId || workspaceId,
        isStarred: currentDocument.isStarred
      }));
    }
  }, [workspaceId, dispatch]);

  const handleCreateDocument = useCallback(async () => {
    if (isCreating || !workspaceId) {
      return;
    }

    setIsCreating(true);
    setCreateError(null);

    try {
      const created = await createDocument({
        title: "Untitled document",
        content: emptyContent as Record<string, unknown>,
        workspaceId
      });

      navigate(`/editor/${encodeURIComponent(created.id)}?workspaceId=${encodeURIComponent(workspaceId)}`, {
        state: { focusTitle: true }
      });
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create document");
    } finally {
      setIsCreating(false);
    }
  }, [emptyContent, isCreating, navigate, workspaceId]);

  const documentId = id ?? activeDocument?.id ?? null;
  const isStarred = Boolean(activeDocument?.isStarred);
  const canToggleStar = Boolean(activeDocument && documentId);
  const isShareViewer = Boolean(shareToken && accessRole === "viewer");
  const canSaveDocument = Boolean(documentId && workspaceId) && !isShareViewer;
  const canExportDocument = Boolean(activeDocument && documentId && workspaceId);
  
  // Declare collaborationEnabled early since it's used in usePendingChanges hook
  const collaborationEnabled = Boolean(
    documentId && (collaborationDocs[documentId] || collaborationRequested) && !hasShareTokenError
  );
  
  // Pending Changes Hook (must be after documentId and collaborationEnabled are declared)
  const {
    pendingChanges,
    isSaving: isSavingDocument,
    hasPendingChanges,
    totalPendingChanges,
    versionSaveDocument
  } = usePendingChanges({
    documentId: documentId || "",
    workspaceId,
    shareToken: shareToken ?? undefined,
    enabled: Boolean(documentId && workspaceId)
  });

  const applyLocalStarUpdate = useCallback(
    (nextIsStarred: boolean) => {
      setLocalDocument((current) => {
        if (!current) {
          return current;
        }
        return { ...current, isStarred: nextIsStarred };
      });
    },
    [setLocalDocument]
  );

  const handleStarToggle = useCallback(async () => {
    if (!activeDocument || !documentId) {
      return;
    }
    try {
      await toggleStar(activeDocument, {
        onOptimisticUpdate: applyLocalStarUpdate,
        onFinalUpdate: applyLocalStarUpdate
      });
    } catch {
      // Ignore toggle errors; UI reverts in the hook on failure.
    }
  }, [activeDocument, documentId, toggleStar, applyLocalStarUpdate]);

  const starIconStyle = {
    fontVariationSettings: isStarred
      ? "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24"
      : "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24"
  };

  const handleShareClick = useCallback(() => {
    if (!documentId || !workspaceId) {
      return;
    }
    setShowShareModal(true);
    setCollaborationDocs((previous) => {
      if (previous[documentId]) {
        return previous;
      }
      return { ...previous, [documentId]: true };
    });
  }, [documentId, workspaceId]);

  const handleExportAction = useCallback(
    (format: "pdf" | "doc") => {
      if (!activeDocument || !canExportDocument) {
        return;
      }

      setExportError(null);
      setShowExportMenu(false);
      setIsExportingFormat(format);

      try {
        const payload = {
          title: displayTitle,
          content: activeDocument.content as JSONContent,
          updatedAt: activeDocument.updatedAt
        };

        if (format === "pdf") {
          exportDocumentAsPdf(payload);
        } else {
          exportDocumentAsDoc(payload);
        }
      } catch (error) {
        setExportError(error instanceof Error ? error.message : "Failed to export document");
      } finally {
        setIsExportingFormat(null);
      }
    },
    [activeDocument, canExportDocument, displayTitle]
  );

  // Conflict resolution handlers
  const handleKeepLocalCopy = useCallback(async () => {
    const currentDocument = documentRef.current;
    if (!currentDocument || !workspaceId) {
      return;
    }

    try {
      const duplicateTitle = `${currentDocument.title?.trim() || "Untitled document"} (local copy)`;
      const duplicated = await createDocument({
        title: duplicateTitle,
        content: currentDocument.content,
        workspaceId
      });

      setShowConflictModal(false);
      navigate(
        `/editor/${encodeURIComponent(duplicated.id)}?workspaceId=${encodeURIComponent(workspaceId)}`,
        { state: { focusTitle: true } }
      );
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Failed to duplicate local copy.");
    }
  }, [navigate, workspaceId]);

  const handleDownloadLocal = useCallback(() => {
    const currentDocument = documentRef.current;
    if (!currentDocument) {
      return;
    }

    exportDocumentAsDoc({
      title: `${currentDocument.title?.trim() || "Untitled document"} (local copy)`,
      content: currentDocument.content as JSONContent,
      updatedAt: currentDocument.updatedAt
    });
  }, []);

  const handleUseServer = useCallback(() => {
    setShowConflictModal(false);
    reloadDocument();
  }, [reloadDocument]);

  const handleConflictClose = useCallback(() => {
    setShowConflictModal(false);
  }, []);

  // Handle token revocation - clean up collaboration state
  const handleTokenRevoked = useCallback(() => {
    if (!documentId) {
      return;
    }
    
    // Reset YJS provider to clean up collaboration state
    resetProvider(documentId);
    
    // Remove from collaboration docs state
    setCollaborationDocs((previous) => {
      const newState = { ...previous };
      delete newState[documentId];
      return newState;
    });

    // Clear share token validation error
    setShareValidationError(null);
  }, [documentId]);

  // Handle clearing invalid share token from URL
  const handleClearShareToken = useCallback(() => {
    if (!id || !workspaceId) {
      return;
    }
    // Navigate to clean URL without share token
    navigate(`/editor/${encodeURIComponent(id)}?workspaceId=${encodeURIComponent(workspaceId)}`, {
      replace: true
    });
  }, [id, workspaceId, navigate]);

  const getVersionSaveSnapshot = useCallback(() => {
    const currentDocument = documentRef.current;
    return {
      title: currentDocument?.title,
      content: (currentDocument?.content as Record<string, unknown>) ?? undefined
    };
  }, []);

  // Handle save with pending changes
  const handleSave = useCallback(() => {
    if (hasPendingChanges) {
      setShowSaveModal(true);
    } else {
      // Manual version save even when there are no pending collaborator changes.
      void versionSaveDocument({
        applyPendingChanges: true,
        ...getVersionSaveSnapshot()
      })
        .then(() => {
          setHistoryRefreshToken((current) => current + 1);
        })
        .catch((error) => {
          console.error("Failed to save document version:", error);
        });
    }
  }, [getVersionSaveSnapshot, hasPendingChanges, versionSaveDocument]);

  // Handle save confirmation - apply pending changes and save
  const handleApplySave = useCallback(async () => {
    try {
      await versionSaveDocument({
        applyPendingChanges: true,
        ...getVersionSaveSnapshot()
      });
      setHistoryRefreshToken((current) => current + 1);
      setShowSaveModal(false);
    } catch (error) {
      console.error("Failed to save document:", error);
    }
  }, [getVersionSaveSnapshot, versionSaveDocument]);

  // Handle save without applying pending changes
  const handleSaveOnly = useCallback(async () => {
    try {
      await versionSaveDocument({
        applyPendingChanges: false,
        ...getVersionSaveSnapshot()
      });
      setHistoryRefreshToken((current) => current + 1);
      setShowSaveModal(false);
    } catch (error) {
      console.error("Failed to save document:", error);
    }
  }, [getVersionSaveSnapshot, versionSaveDocument]);

  // Handle history restore
  const handleHistoryRestore = useCallback(
    ({ documentId: restoredDocumentId, content }: { documentId: string; content: JSONContent }) => {
      const currentDocument = documentRef.current;
      if (!currentDocument || currentDocument.id !== restoredDocumentId) {
        return;
      }

      const nextDocument = {
        ...currentDocument,
        content: content as Record<string, unknown>,
        updatedAt: new Date().toISOString()
      };

      documentRef.current = nextDocument;
      updateDocumentRef.current(nextDocument);
      setContentResetVersion((current) => current + 1);

      if (currentDocument.id) {
        dispatch(
          actions.updateRecentDocument({
            id: currentDocument.id,
            title: currentDocument.title,
            updatedAt: new Date().toISOString(),
            ownerId: currentDocument.ownerId,
            workspaceId: currentDocument.workspaceId || workspaceId,
            isStarred: currentDocument.isStarred
          })
        );
      }
    },
    [workspaceId, dispatch]
  );

  // Register debug commands on mount
  useEffect(() => {
    registerDebugCommands();
    console.log("🐛 Debug commands registered. Use window.debugCollab to access them.");
  }, []);

  const editorContent = (activeDocument?.content as JSONContent) ?? emptyContent;
  const effectiveError = shareValidationError ?? error;
  const effectiveLoading = loading || isValidatingShare;
  const isEditable = Boolean(activeDocument) && !effectiveLoading && !effectiveError && Boolean(workspaceId) && !isShareViewer;
  const searchActive = searchQuery.trim().length > 0;

  useEffect(() => {
    if (!documentId || !collaborationRequested) {
      return;
    }
    setCollaborationDocs((previous) => {
      if (previous[documentId]) {
        return previous;
      }
      return { ...previous, [documentId]: true };
    });
  }, [documentId, collaborationRequested]);

  useEffect(() => {
    setShowConflictModal(false);
    setLocalVersion(EMPTY_TIPTAP_DOC);
    setServerVersion(EMPTY_TIPTAP_DOC);
    setShowExportMenu(false);
    setExportError(null);
  }, [documentId]);

  useEffect(() => {
    if (!documentId || !workspaceId) {
      return;
    }
    return subscribeToStarUpdates((update) => {
      if (update.documentId !== documentId || update.workspaceId !== workspaceId) {
        return;
      }
      applyLocalStarUpdate(update.isStarred);
    });
  }, [documentId, workspaceId, applyLocalStarUpdate]);

  useEffect(() => {
    if (!showExportMenu) {
      return;
    }

    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (exportMenuRef.current && target && !exportMenuRef.current.contains(target)) {
        setShowExportMenu(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowExportMenu(false);
      }
    };

    window.addEventListener("mousedown", handleOutsideClick);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("mousedown", handleOutsideClick);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [showExportMenu]);

  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed || !workspaceId) {
      setSearchResults([]);
      setSearchStatus("idle");
      return;
    }

    let isActive = true;
    const timeoutId = window.setTimeout(async () => {
      setSearchStatus("loading");
      const { results, source } = await searchDocumentsWithFallback(workspaceId, trimmed);
      if (!isActive) {
        return;
      }
      setSearchResults(results);
      setSearchStatus(source);
    }, 200);

    return () => {
      isActive = false;
      window.clearTimeout(timeoutId);
    };
  }, [searchQuery, workspaceId]);

  return (
    <div className="editor-view bg-background-light text-[#0d0e1b] dark:bg-background-dark dark:text-[#f8f8fc] font-['Inter',_sans-serif]">
      <div className="flex h-screen overflow-hidden">
        <aside className="flex w-64 flex-col shrink-0 border-r border-[#e7e7f3] bg-background-light dark:border-[#2d2e4a] dark:bg-background-dark">
          <div className="flex h-full flex-col gap-6 p-4">
            <div className="flex flex-col">
              <h1 className="text-base font-bold leading-normal text-[#0d0e1b] dark:text-white">Workspace</h1>
              <p className="text-sm font-normal text-[#4c4d9a] dark:text-[#8a8bbd]">Collaborative Team</p>
            </div>

            <button
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-white shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
              type="button"
              onClick={handleCreateDocument}
              disabled={isCreating || !workspaceId}
            >
              <span className="material-symbols-outlined">add</span>
              <span>{isCreating ? "Creating..." : "New Document"}</span>
            </button>
            {createError ? <p className="text-xs text-red-500">{createError}</p> : null}

            <div className="relative">
              <label className="flex h-10 w-full items-center gap-2 rounded-lg border border-transparent bg-[#e7e7f3] px-3 transition-all focus-within:border-primary/50 dark:bg-[#1c1d3a]">
                <span className="material-symbols-outlined text-[#4c4d9a]">search</span>
                <input
                  className="w-full bg-transparent text-sm placeholder:text-[#4c4d9a] focus:border-none focus:ring-0"
                  placeholder="Search docs..."
                  type="text"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
                <span className="rounded border border-[#4c4d9a]/30 px-1 text-[10px] font-bold text-[#4c4d9a]">K</span>
              </label>
            </div>

            <nav className="flex flex-grow flex-col gap-1 overflow-y-auto">
              <p className="mb-2 px-3 text-[11px] font-bold uppercase tracking-wider text-[#4c4d9a]">
                Navigation
              </p>
              <Link
                className={navLinkClass(isRecentRoute)}
                to={buildWorkspaceRoute("/editor/recent")}
                aria-current={isRecentRoute ? "page" : undefined}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}
                >
                  schedule
                </span>
                <span className="text-sm font-medium">Recent</span>
              </Link>
              <Link
                className={navLinkClass(isStarredRoute)}
                to={buildWorkspaceRoute("/editor/starred")}
                aria-current={isStarredRoute ? "page" : undefined}
              >
                <span className="material-symbols-outlined">star</span>
                <span className="text-sm font-medium">Starred</span>
              </Link>
              <Link
                className={navLinkClass(isSharedRoute)}
                to={buildWorkspaceRoute("/editor/shared")}
                aria-current={isSharedRoute ? "page" : undefined}
              >
                <span className="material-symbols-outlined">group</span>
                <span className="text-sm font-medium">Shared</span>
              </Link>
              <Link
                className={navLinkClass(isTrashRoute)}
                to={buildWorkspaceRoute("/editor/trash")}
                aria-current={isTrashRoute ? "page" : undefined}
              >
                <span className="material-symbols-outlined">delete</span>
                <span className="text-sm font-medium">Trash</span>
              </Link>
              <a
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-[#4c4d9a] hover:bg-[#e7e7f3]/50 dark:text-[#8a8bbd] dark:hover:bg-[#1c1d3a]/50"
                href="#"
              >
                <span className="material-symbols-outlined">folder</span>
                <span className="text-sm font-medium">Collections</span>
              </a>
              <p className="mb-2 mt-6 px-3 text-[11px] font-bold uppercase tracking-wider text-[#4c4d9a]">
                {searchActive ? "Search Results" : "Recent Docs"}
              </p>
              {searchActive ? (
                <div className="flex flex-col gap-1">
                  {searchStatus === "loading" ? (
                    <p className="px-3 py-1.5 text-xs text-[#4c4d9a] dark:text-[#8a8bbd]">Searching...</p>
                  ) : searchResults.length > 0 ? (
                    searchResults.map((result) => (
                      <Link
                        key={result.id}
                        className="truncate px-3 py-1.5 text-sm text-[#4c4d9a] hover:text-primary dark:text-[#8a8bbd]"
                        to={`/editor/${encodeURIComponent(result.id)}?workspaceId=${encodeURIComponent(
                          result.workspaceId || workspaceId
                        )}`}
                      >
                        {result.title || "Untitled document"}
                      </Link>
                    ))
                  ) : (
                    <p className="px-3 py-1.5 text-xs text-[#4c4d9a] dark:text-[#8a8bbd]">No matches found</p>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  {recentDocuments.length > 0 ? (
                    recentDocuments.slice(0, 5).map((doc) => (
                      <Link
                        key={doc.id}
                        className={`flex items-center justify-between rounded-lg px-3 py-1.5 text-sm transition-colors ${
                          doc.id === documentId
                            ? "bg-primary/10 font-medium text-[#0d0e1b] dark:text-white"
                            : "text-[#4c4d9a] hover:text-primary hover:bg-[#e7e7f3]/50 dark:text-[#8a8bbd] dark:hover:bg-[#1c1d3a]/50"
                        }`}
                        to={`/editor/${encodeURIComponent(doc.id)}?workspaceId=${encodeURIComponent(doc.workspaceId || workspaceId)}`}
                      >
                        <span className="truncate">{doc.title || "Untitled document"}</span>
                        {doc.id === documentId && <div className="h-1.5 w-1.5 rounded-full bg-primary"></div>}
                      </Link>
                    ))
                  ) : (
                    <p className="px-3 py-1.5 text-xs text-[#4c4d9a] dark:text-[#8a8bbd]">No recent documents</p>
                  )}
                </div>
              )}
            </nav>

            <div className="flex items-center gap-3 border-t border-[#e7e7f3] pt-4 dark:border-[#2d2e4a]">
              <div
                className="h-9 w-9 rounded-full bg-cover bg-center"
                data-alt="User profile avatar"
                style={{
                  backgroundImage:
                    "url('https://lh3.googleusercontent.com/aida-public/AB6AXuBnHAR0qvuS976iJQFGjmdAYzYdSlvwYLTpOonSARtAYONkjK4RjF2WK1Gt3dO3NA9ORMoZmHLsj15sVV7B2QV8aDQBHWcU-m6_PUfujLRiFInzRFwQv2UiuFIsTkF3tmgSCN8BTp0FCleyGtzKHIug7k4eOgxXYbhMGXPPmeRHwMQgA656gELMdfNiLlF7JobK_DSTzuFenfVeHv1IWy8vgvHc1l6AZXzA_OAYDVivz4Fyr0E2bN5c5QrS6mZIp71ZfnUcQl5pxw')"
                }}
              ></div>
              <div className="flex flex-col overflow-hidden">
                <span className="truncate text-sm font-bold">Alex Rivera</span>
                <span className="text-xs text-[#4c4d9a]">Pro Plan</span>
              </div>
              <button className="material-symbols-outlined ml-auto text-[#4c4d9a]" type="button">
                settings
              </button>
            </div>
          </div>
        </aside>

        <main className="relative flex min-w-0 flex-1 flex-col bg-white dark:bg-background-dark">
          <header className="z-20 flex h-16 items-center justify-between border-b border-[#e7e7f3] bg-white/80 px-8 backdrop-blur-md dark:border-[#2d2e4a] dark:bg-background-dark/80">
            <div className="flex flex-col">
              <div className="mb-0.5 flex items-center gap-1.5 text-xs font-medium text-[#4c4d9a]">
                <Link className="transition-colors hover:text-primary" to={buildWorkspaceRoute("/editor/recent")}>
                  Docs
                </Link>
                <span>/</span>
                <span className="text-[#0d0e1b] capitalize dark:text-[#f8f8fc]">{displayTitle}</span>
              </div>
              <h2 className="text-base font-bold text-[#0d0e1b] capitalize dark:text-white">{displayTitle}</h2>
            </div>

            <div className="flex items-center gap-6">
              {/* Presence/Collaborators */}
              <div className="flex items-center">
                <div className="flex -space-x-3 overflow-hidden">
                  {collaborators.slice(0, 5).map((collaborator: Collaborator) => (
                    <div
                      key={collaborator.id}
                      className="inline-block h-8 w-8 rounded-full bg-cover ring-2 ring-white dark:ring-background-dark"
                      data-alt={`Collaborator avatar ${collaborator.name}`}
                      style={{
                        backgroundImage: collaborator.avatar || `linear-gradient(135deg, ${collaborator.color}, ${collaborator.color}dd)`,
                        backgroundColor: !collaborator.avatar ? collaborator.color : undefined
                      }}
                      title={collaborator.name}
                    >
                      {!collaborator.avatar && (
                        <span className="flex h-full w-full items-center justify-center text-xs font-bold text-white">
                          {collaborator.name.charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>
                  ))}
                  {collaborators.length > 5 && (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#e7e7f3] text-[10px] font-bold text-[#4c4d9a] ring-2 ring-white dark:bg-[#1c1d3a] dark:ring-background-dark">
                      +{collaborators.length - 5}
                    </div>
                  )}
                </div>
                <Presence onlineCount={onlineCount} className="ml-3 text-xs text-[#4c4d9a]" />
              </div>
              <div className="h-6 w-px bg-[#e7e7f3] dark:bg-[#2d2e4a]"></div>
              <div className="flex items-center gap-2">
                <button
                  className={`flex h-9 items-center gap-2 rounded-lg px-4 text-sm font-bold shadow-lg transition-all hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70 ${
                    hasPendingChanges
                      ? "bg-emerald-600 text-white shadow-emerald-600/20"
                      : "border border-emerald-200 bg-emerald-50 text-emerald-700 shadow-emerald-200/40 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300"
                  }`}
                  type="button"
                  onClick={handleSave}
                  disabled={isSavingDocument || !canSaveDocument}
                  title={hasPendingChanges ? `${totalPendingChanges} pending changes to include in version` : "Create version snapshot"}
                >
                  <span className="material-symbols-outlined !text-[18px]">bookmarks</span>
                  <span>
                    {isSavingDocument
                      ? "Saving Version..."
                      : hasPendingChanges
                        ? `Version Save (${totalPendingChanges})`
                        : "Version Save"}
                  </span>
                </button>
                <button
                  className="rounded-lg p-2 text-[#4c4d9a] transition-colors hover:bg-background-light dark:hover:bg-[#1c1d3a]"
                  type="button"
                  onClick={() => setShowHistoryModal(true)}
                  disabled={!workspaceId || !documentId}
                  title="View document history"
                >
                  <span className="material-symbols-outlined">history</span>
                </button>
                <div className="relative" ref={exportMenuRef}>
                  <button
                    className="flex h-9 items-center gap-1.5 rounded-lg border border-[#e7e7f3] bg-white px-3 text-sm font-semibold text-[#4c4d9a] transition-colors hover:bg-background-light disabled:cursor-not-allowed disabled:opacity-60 dark:border-[#2d2e4a] dark:bg-[#16172d] dark:text-[#8a8bbd] dark:hover:bg-[#1c1d3a]"
                    type="button"
                    onClick={() => setShowExportMenu((current) => !current)}
                    disabled={!canExportDocument || Boolean(isExportingFormat)}
                    title="Export document"
                    aria-haspopup="menu"
                    aria-expanded={showExportMenu}
                  >
                    <span className="material-symbols-outlined !text-[18px]">download</span>
                    <span>{isExportingFormat ? "Exporting..." : "Export"}</span>
                    <span className="material-symbols-outlined !text-[18px]">expand_more</span>
                  </button>
                  {showExportMenu && (
                    <div
                      className="absolute right-0 top-11 z-30 w-52 rounded-lg border border-[#e7e7f3] bg-white p-1.5 shadow-xl dark:border-[#2d2e4a] dark:bg-[#16172d]"
                      role="menu"
                      aria-label="Export options"
                    >
                      <button
                        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-[#0d0e1b] transition-colors hover:bg-[#f3f4ff] disabled:cursor-not-allowed disabled:opacity-60 dark:text-white dark:hover:bg-[#1c1d3a]"
                        type="button"
                        role="menuitem"
                        onClick={() => handleExportAction("pdf")}
                        disabled={Boolean(isExportingFormat)}
                      >
                        <span className="material-symbols-outlined !text-[18px] text-red-500">picture_as_pdf</span>
                        <span>Export as PDF</span>
                      </button>
                      <button
                        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-[#0d0e1b] transition-colors hover:bg-[#f3f4ff] disabled:cursor-not-allowed disabled:opacity-60 dark:text-white dark:hover:bg-[#1c1d3a]"
                        type="button"
                        role="menuitem"
                        onClick={() => handleExportAction("doc")}
                        disabled={Boolean(isExportingFormat)}
                      >
                        <span className="material-symbols-outlined !text-[18px] text-blue-500">description</span>
                        <span>Export as DOC</span>
                      </button>
                    </div>
                  )}
                </div>
                <button
                  className="rounded-lg p-2 text-[#4c4d9a] transition-colors hover:bg-background-light dark:hover:bg-[#1c1d3a]"
                  type="button"
                >
                  <span className="material-symbols-outlined">notifications</span>
                </button>
                <button
                  className={`rounded-lg p-2 transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                    isStarred
                      ? "text-amber-400 hover:text-amber-500 dark:text-amber-300"
                      : "text-[#4c4d9a] hover:bg-background-light dark:text-[#8a8bbd] dark:hover:bg-[#1c1d3a]"
                  }`}
                  type="button"
                  onClick={handleStarToggle}
                  disabled={!canToggleStar}
                  aria-pressed={isStarred}
                  aria-label={isStarred ? "Unstar document" : "Star document"}
                >
                  <span className="material-symbols-outlined" style={starIconStyle}>
                    star
                  </span>
                </button>
                <button
                  className="flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-white shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
                  type="button"
                  onClick={handleShareClick}
                  disabled={!workspaceId || !documentId}
                >
                  <span className="material-symbols-outlined !text-[18px]">share</span>
                  <span>Share</span>
                </button>
                <UserMenu />
              </div>
            </div>
          </header>

          {hasShareTokenError && (
            <div className="mx-auto mt-4 max-w-2xl rounded-lg border-2 border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/50 dark:bg-amber-950/30">
              <div className="flex items-start gap-3">
                <span className="material-symbols-outlined mt-0.5 text-amber-600 dark:text-amber-400">
                  warning
                </span>
                <div className="flex-1">
                  <h3 className="font-semibold text-amber-900 dark:text-amber-200">Share Link Issue</h3>
                  <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
                    {shareValidationError}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      className="flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-amber-700 dark:bg-amber-700 dark:hover:bg-amber-600"
                      type="button"
                      onClick={handleShareClick}
                    >
                      <span className="material-symbols-outlined !text-[16px]">add_link</span>
                      Generate New Link
                    </button>
                    <button
                      className="flex items-center gap-1.5 rounded-md border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300 dark:hover:bg-amber-900"
                      type="button"
                      onClick={handleClearShareToken}
                    >
                      <span className="material-symbols-outlined !text-[16px]">close</span>
                      Clear and Continue
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
          {!hasShareTokenError && isShareViewer && (
            <div className="mx-auto mt-4 max-w-2xl rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-900/50 dark:bg-blue-950/30">
              <p className="text-sm font-medium text-blue-900 dark:text-blue-200">
                This link has viewer access. You can view live updates, but editing is disabled.
              </p>
            </div>
          )}
          {exportError && (
            <div className="mx-auto mt-4 max-w-2xl rounded-lg border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900/50 dark:bg-red-950/30">
              <p className="text-sm font-medium text-red-800 dark:text-red-300">
                Export failed: {exportError}
              </p>
            </div>
          )}

          <div className="editor-grid relative flex-1 overflow-y-auto dark:bg-[#0b0c18]">
            <EditorSurface
              key={documentId || "no-doc"}
              documentId={documentId}
              content={editorContent}
              contentVersion={contentResetVersion}
              editable={isEditable}
              onChange={handleContentChange}
              onTitleChange={handleTitleChange}
              onStatsChange={setEditorStats}
              onYjsUpdate={handleYjsUpdate}
              onCursorUpdate={sendCursorUpdate}
              onSelectionUpdate={sendSelectionUpdate}
              collaborationEnabled={collaborationEnabled}
              autoFocusTitle={shouldFocusTitle}
              docTitle={docTitle}
              loading={effectiveLoading}
              error={effectiveError}
              shareToken={shareToken}
            />
          </div>

          <footer className="flex h-8 items-center justify-between border-t border-[#e7e7f3] bg-white px-6 text-[10px] font-medium uppercase tracking-widest text-[#4c4d9a] dark:border-[#2d2e4a] dark:bg-background-dark">
            <div className="flex items-center gap-4">
              <span>Characters: {editorStats.charCount.toLocaleString()}</span>
              <span>Words: {editorStats.wordCount.toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-4">
              <span className={`flex items-center gap-1 ${isOnline ? "text-green-500" : "text-gray-500"}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${isOnline ? "bg-green-500" : "bg-gray-500"}`}></span>
                {isOnline ? "Online" : "Offline"}
              </span>
              <button
                className={`flex items-center gap-1 transition-colors hover:opacity-80 ${displaySaveStatus === "conflict" ? "cursor-pointer hover:underline" : ""}`}
                onClick={displaySaveStatus === "conflict" ? () => setShowConflictModal(true) : undefined}
                type={displaySaveStatus === "conflict" ? "button" : undefined}
                title="Autosave status"
              >
                <span className={`material-symbols-outlined !text-xs ${saveClass}`}>{saveIcon}</span>
                Autosave: {saveLabel}
              </button>
            </div>
          </footer>
        </main>
      </div>
      
      {/* Conflict Modal */}
      <ConflictModal
        isOpen={showConflictModal}
        localVersion={localVersion}
        serverVersion={serverVersion}
        documentTitle={displayTitle}
        onKeepLocalCopy={() => void handleKeepLocalCopy()}
        onUseServer={handleUseServer}
        onDownloadLocal={handleDownloadLocal}
        onClose={handleConflictClose}
      />
      {showShareModal && documentId && (
        <ShareModal
          documentId={documentId}
          workspaceId={workspaceId}
          onClose={() => setShowShareModal(false)}
          onTokenRevoked={handleTokenRevoked}
        />
      )}
      
      {/* Save Confirmation Modal */}
      <SaveConfirmationModal
        isOpen={showSaveModal}
        documentId={documentId || ""}
        documentTitle={displayTitle}
        workspaceId={workspaceId}
        pendingChanges={pendingChanges}
        onApplySave={handleApplySave}
        onSaveOnly={handleSaveOnly}
        onCancel={() => setShowSaveModal(false)}
        isSaving={isSavingDocument}
      />
      
      {/* History Modal */}
      {showHistoryModal && documentId && (
        <HistoryModal
          key={`${documentId}:${workspaceId}:${shareToken ?? ""}`}
          isOpen={showHistoryModal}
          onClose={() => setShowHistoryModal(false)}
          documentId={documentId}
          workspaceId={workspaceId}
          shareToken={shareToken}
          refreshToken={historyRefreshToken}
          documentTitle={displayTitle}
          onRestore={handleHistoryRestore}
        />
      )}
    </div>
  );
};
