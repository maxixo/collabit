import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { actions, useAppStore } from "../app/store";
import { DashboardLayout } from "../components/DashboardLayout";
import { ConfirmationModal } from "../components/ConfirmationModal";
import { useCreateDocumentAction } from "../hooks/useCreateDocumentAction";
import { useStarToggle } from "../hooks/useStarToggle";
import {
  fetchSharedDocuments,
  moveDocumentToTrash,
  type DocumentSummary
} from "../services/document.service";

const getDocumentTitle = (title: string) => (title.trim() ? title : "Untitled document");

export const Shared = () => {
  const { recentDocuments, activeDocumentId, dispatch } = useAppStore();
  const { toggleStar } = useStarToggle();
  const [searchParams] = useSearchParams();
  const workspaceId = searchParams.get("workspaceId")?.trim() || "default";
  const { createNewDocument, isCreating, createError } = useCreateDocumentAction(workspaceId);
  const [isSyncing, setIsSyncing] = useState(false);
  const [sharedDocuments, setSharedDocuments] = useState<DocumentSummary[]>([]);
  const [pendingTrashDocument, setPendingTrashDocument] = useState<DocumentSummary | null>(null);
  const showSkeleton = isSyncing && sharedDocuments.length === 0;

  const homeDocument = useMemo(() => {
    if (activeDocumentId) {
      return (
        recentDocuments.find((doc) => doc.id === activeDocumentId) ?? {
          id: activeDocumentId,
          workspaceId
        }
      );
    }
    return recentDocuments[0] ?? sharedDocuments[0] ?? null;
  }, [activeDocumentId, recentDocuments, sharedDocuments, workspaceId]);

  const homeHref = homeDocument
    ? `/editor/${encodeURIComponent(homeDocument.id)}?workspaceId=${encodeURIComponent(
        homeDocument.workspaceId || workspaceId
      )}`
    : `/editor/recent?workspaceId=${encodeURIComponent(workspaceId)}`;

  const handleToggleStar = useCallback(
    async (documentId: string) => {
      const doc = sharedDocuments.find((item) => item.id === documentId);
      if (!doc) {
        return;
      }

      try {
        await toggleStar(doc);
      } catch {
        // The hook reverts optimistic changes when the request fails.
      }
    },
    [sharedDocuments, toggleStar]
  );

  const handleConfirmMoveToTrash = useCallback(async () => {
    if (!pendingTrashDocument) {
      return;
    }

    const previousShared = sharedDocuments;
    const previousRecent = recentDocuments;
    setSharedDocuments(previousShared.filter((doc) => doc.id !== pendingTrashDocument.id));
    dispatch(
      actions.setRecentDocuments(
        previousRecent.filter((doc) => doc.id !== pendingTrashDocument.id)
      )
    );
    setPendingTrashDocument(null);

    try {
      await moveDocumentToTrash(pendingTrashDocument.id, workspaceId);
    } catch {
      setSharedDocuments(previousShared);
      dispatch(actions.setRecentDocuments(previousRecent));
    }
  }, [dispatch, pendingTrashDocument, recentDocuments, sharedDocuments, workspaceId]);

  useEffect(() => {
    let isActive = true;

    const loadSharedDocuments = async () => {
      setIsSyncing(true);
      try {
        const docs = await fetchSharedDocuments(workspaceId);
        if (isActive) {
          setSharedDocuments(docs);
        }
      } finally {
        if (isActive) {
          setIsSyncing(false);
        }
      }
    };

    void loadSharedDocuments();

    return () => {
      isActive = false;
    };
  }, [workspaceId]);

  return (
    <>
      <DashboardLayout
        workspaceId={workspaceId}
        activeNav="shared"
        pageTitle="Shared With You"
        pageSubtitle="Documents you can access in this workspace but do not own."
        homeHref={homeHref}
        isSyncing={isSyncing}
        syncingLabel="Refreshing shared documents"
        onCreateDocument={() => void createNewDocument()}
        isCreating={isCreating}
        createError={createError}
      >
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {showSkeleton ? (
            Array.from({ length: 8 }).map((_, index) => (
              <div
                key={`shared-skeleton-${index}`}
                className="group flex flex-col gap-4 rounded-xl border border-[#e7e7f3] bg-white p-4 dark:border-[#2a2b4a] dark:bg-[#16172d]"
              >
                <div className="skeleton-shimmer aspect-[4/3] w-full rounded-lg bg-[#e7e7f3] dark:bg-[#1e1f3a]"></div>
                <div className="flex flex-col gap-2">
                  <div className="skeleton-shimmer h-5 w-3/4 rounded bg-[#e7e7f3] dark:bg-[#1e1f3a]"></div>
                  <div className="skeleton-shimmer h-3 w-1/2 rounded bg-[#e7e7f3] dark:bg-[#1e1f3a]"></div>
                </div>
              </div>
            ))
          ) : sharedDocuments.length > 0 ? (
            sharedDocuments.map((doc) => {
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
                      className={`flex h-8 w-8 items-center justify-center rounded-full border border-[#e7e7f3] bg-white/90 text-[#4c4d9a] shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-[#2a2b4a] dark:bg-[#1e1f3a] dark:text-[#a1a1c9] ${
                        doc.isStarred ? "text-amber-400 dark:text-amber-300" : ""
                      }`}
                      type="button"
                      aria-pressed={doc.isStarred}
                      aria-label={doc.isStarred ? "Unstar document" : "Star document"}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        void handleToggleStar(doc.id);
                      }}
                    >
                      <span
                        className="material-symbols-outlined text-lg"
                        style={{
                          fontVariationSettings: doc.isStarred
                            ? "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24"
                            : "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24"
                        }}
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
                    <span className="material-symbols-outlined text-3xl">group</span>
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
              No shared documents yet in this workspace.
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
