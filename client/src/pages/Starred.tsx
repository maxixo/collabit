import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { actions, useAppStore } from "../app/store";
import { DashboardLayout } from "../components/DashboardLayout";
import { ConfirmationModal } from "../components/ConfirmationModal";
import { useCreateDocumentAction } from "../hooks/useCreateDocumentAction";
import { useStarToggle } from "../hooks/useStarToggle";
import {
  fetchStarredDocuments,
  moveDocumentToTrash,
  type DocumentSummary
} from "../services/document.service";
import { subscribeToStarUpdates } from "../utils/starEvents";

const getDocumentTitle = (title: string) => (title.trim() ? title : "Untitled document");

export const Starred = () => {
  const { recentDocuments, activeDocumentId, dispatch } = useAppStore();
  const { toggleStar } = useStarToggle();
  const [searchParams] = useSearchParams();
  const workspaceId = searchParams.get("workspaceId")?.trim() || "default";
  const { createNewDocument, isCreating, createError } = useCreateDocumentAction(workspaceId);
  const [isSyncing, setIsSyncing] = useState(false);
  const [starredDocuments, setStarredDocuments] = useState<DocumentSummary[]>([]);
  const [pendingTrashDocument, setPendingTrashDocument] = useState<DocumentSummary | null>(null);
  const showSkeleton = isSyncing && starredDocuments.length === 0;
  const recentDocumentsRef = useRef(recentDocuments);

  useEffect(() => {
    recentDocumentsRef.current = recentDocuments;
  }, [recentDocuments]);

  const homeDocument =
    recentDocuments.find((document) => document.id === activeDocumentId) ??
    recentDocuments[0] ??
    starredDocuments[0] ??
    null;
  const homeHref = homeDocument
    ? `/editor/${encodeURIComponent(homeDocument.id)}?workspaceId=${encodeURIComponent(
        homeDocument.workspaceId || workspaceId
      )}`
    : `/editor/recent?workspaceId=${encodeURIComponent(workspaceId)}`;

  const updateStarredList = useCallback(
    (documentId: string, nextIsStarred: boolean, fallback?: DocumentSummary) => {
      setStarredDocuments((previous) => {
        if (nextIsStarred) {
          const existing = previous.some((doc) => doc.id === documentId);
          if (existing) {
            return previous.map((doc) =>
              doc.id === documentId ? { ...doc, isStarred: true } : doc
            );
          }
          return fallback ? [{ ...fallback, isStarred: true }, ...previous] : previous;
        }
        return previous.filter((doc) => doc.id !== documentId);
      });
    },
    []
  );

  const handleToggleStar = useCallback(
    async (doc: DocumentSummary) => {
      const nextIsStarred = !doc.isStarred;
      updateStarredList(doc.id, nextIsStarred, { ...doc, isStarred: nextIsStarred });

      try {
        await toggleStar(doc, {
          onFinalUpdate: (finalIsStarred) => {
            if (finalIsStarred !== nextIsStarred) {
              updateStarredList(doc.id, finalIsStarred, { ...doc, isStarred: finalIsStarred });
            }
          }
        });
      } catch {
        updateStarredList(doc.id, doc.isStarred, doc);
      }
    },
    [toggleStar, updateStarredList]
  );

  const handleConfirmMoveToTrash = useCallback(async () => {
    if (!pendingTrashDocument) {
      return;
    }

    const previousStarred = starredDocuments;
    const previousRecent = recentDocuments;
    setStarredDocuments(previousStarred.filter((doc) => doc.id !== pendingTrashDocument.id));
    dispatch(
      actions.setRecentDocuments(
        previousRecent.filter((doc) => doc.id !== pendingTrashDocument.id)
      )
    );
    setPendingTrashDocument(null);

    try {
      await moveDocumentToTrash(pendingTrashDocument.id, workspaceId);
    } catch {
      setStarredDocuments(previousStarred);
      dispatch(actions.setRecentDocuments(previousRecent));
    }
  }, [dispatch, pendingTrashDocument, recentDocuments, starredDocuments, workspaceId]);

  useEffect(() => {
    let isActive = true;

    const loadStarredDocuments = async () => {
      setIsSyncing(true);
      try {
        const docs = await fetchStarredDocuments(workspaceId);
        if (isActive) {
          setStarredDocuments(docs);
        }
      } finally {
        if (isActive) {
          setIsSyncing(false);
        }
      }
    };

    void loadStarredDocuments();

    return () => {
      isActive = false;
    };
  }, [workspaceId]);

  useEffect(() => {
    return subscribeToStarUpdates((update) => {
      if (update.workspaceId !== workspaceId) {
        return;
      }

      const fallback = recentDocumentsRef.current.find((doc) => doc.id === update.documentId);
      updateStarredList(
        update.documentId,
        update.isStarred,
        fallback ? { ...fallback, isStarred: update.isStarred } : undefined
      );
    });
  }, [workspaceId, updateStarredList]);

  return (
    <>
      <DashboardLayout
        workspaceId={workspaceId}
        activeNav="starred"
        pageTitle="Starred Documents"
        pageSubtitle="Keep important documents pinned close to hand."
        homeHref={homeHref}
        isSyncing={isSyncing}
        syncingLabel="Refreshing your starred documents"
        onCreateDocument={() => void createNewDocument()}
        isCreating={isCreating}
        createError={createError}
      >
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {showSkeleton ? (
            Array.from({ length: 8 }).map((_, index) => (
              <div
                key={`starred-skeleton-${index}`}
                className="group flex flex-col gap-4 rounded-xl border border-[#e7e7f3] bg-white p-4 dark:border-[#2a2b4a] dark:bg-[#16172d]"
              >
                <div className="skeleton-shimmer aspect-[4/3] w-full rounded-lg bg-[#e7e7f3] dark:bg-[#1e1f3a]"></div>
                <div className="flex flex-col gap-2">
                  <div className="skeleton-shimmer h-5 w-3/4 rounded bg-[#e7e7f3] dark:bg-[#1e1f3a]"></div>
                  <div className="skeleton-shimmer h-3 w-1/2 rounded bg-[#e7e7f3] dark:bg-[#1e1f3a]"></div>
                </div>
              </div>
            ))
          ) : starredDocuments.length > 0 ? (
            starredDocuments.map((doc) => {
              const title = getDocumentTitle(doc.title);
              const updatedAtLabel = doc.updatedAt
                ? new Date(doc.updatedAt).toLocaleDateString()
                : "Recently";
              const workspace = doc.workspaceId || workspaceId;

              return (
                <Link
                  key={doc.id}
                  className="group relative flex flex-col gap-4 rounded-xl border border-[#e7e7f3] bg-white p-4 transition-shadow hover:shadow-lg dark:border-[#2a2b4a] dark:bg-[#16172d]"
                  to={`/editor/${encodeURIComponent(doc.id)}?workspaceId=${encodeURIComponent(workspace)}`}
                  aria-label={`Open ${title}`}
                >
                  <div className="absolute right-3 top-3 flex items-center gap-2">
                    <button
                      className="flex h-8 w-8 items-center justify-center rounded-full border border-[#e7e7f3] bg-white/90 text-amber-400 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-[#2a2b4a] dark:bg-[#1e1f3a] dark:text-amber-300"
                      type="button"
                      aria-pressed={doc.isStarred}
                      aria-label="Unstar document"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        void handleToggleStar(doc);
                      }}
                    >
                      <span
                        className="material-symbols-outlined text-lg"
                        style={{ fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}
                      >
                        star
                      </span>
                    </button>
                    <button
                      className="flex h-8 w-8 items-center justify-center rounded-full border border-[#e7e7f3] bg-white/90 text-rose-500 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-[#2a2b4a] dark:bg-[#1e1f3a] dark:text-rose-300"
                      type="button"
                      aria-label="Move to trash"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setPendingTrashDocument(doc);
                      }}
                    >
                      <span className="material-symbols-outlined text-lg">delete</span>
                    </button>
                  </div>
                  <div className="flex aspect-[4/3] w-full items-center justify-center rounded-lg bg-[#e7e7f3] text-[#4c4d9a] dark:bg-[#1e1f3a] dark:text-[#a1a1c9]">
                    <span className="material-symbols-outlined text-3xl">description</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <p className="truncate text-sm font-bold text-[#0d0e1b] dark:text-white">{title}</p>
                    <p className="text-xs text-[#4c4d9a] dark:text-[#a1a1c9]">
                      Updated {updatedAtLabel}
                    </p>
                  </div>
                </Link>
              );
            })
          ) : (
            <div className="col-span-full rounded-xl border border-dashed border-[#e7e7f3] p-6 text-center text-sm text-[#4c4d9a] dark:border-[#2a2b4a] dark:text-[#a1a1c9]">
              No starred documents yet.
            </div>
          )}
        </div>
      </DashboardLayout>

      <ConfirmationModal
        isOpen={Boolean(pendingTrashDocument)}
        title="Move to trash?"
        description={
          pendingTrashDocument
            ? `You can restore "${getDocumentTitle(pendingTrashDocument.title)}" from the trash later.`
            : ""
        }
        confirmLabel="Move to trash"
        cancelLabel="Cancel"
        tone="danger"
        icon="delete"
        onClose={() => setPendingTrashDocument(null)}
        onConfirm={() => void handleConfirmMoveToTrash()}
      />
    </>
  );
};
