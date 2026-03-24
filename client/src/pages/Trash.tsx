import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAppStore } from "../app/store";
import { DashboardLayout } from "../components/DashboardLayout";
import { ConfirmationModal } from "../components/ConfirmationModal";
import { useCreateDocumentAction } from "../hooks/useCreateDocumentAction";
import {
  emptyTrash,
  fetchTrashDocuments,
  permanentlyDeleteDocument,
  restoreDocument,
  type DocumentSummary
} from "../services/document.service";

const getDocumentTitle = (title: string) => (title.trim() ? title : "Untitled document");

export const Trash = () => {
  const { activeDocumentId, recentDocuments } = useAppStore();
  const [searchParams] = useSearchParams();
  const workspaceId = searchParams.get("workspaceId")?.trim() || "default";
  const { createNewDocument, isCreating, createError } = useCreateDocumentAction(workspaceId);
  const [isSyncing, setIsSyncing] = useState(false);
  const [trashedDocuments, setTrashedDocuments] = useState<DocumentSummary[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<DocumentSummary | null>(null);
  const [isEmptyTrashOpen, setIsEmptyTrashOpen] = useState(false);
  const showSkeleton = isSyncing && trashedDocuments.length === 0;

  const homeDocument = useMemo(() => {
    if (activeDocumentId) {
      return (
        recentDocuments.find((doc) => doc.id === activeDocumentId) ?? {
          id: activeDocumentId,
          workspaceId
        }
      );
    }
    return recentDocuments[0] ?? null;
  }, [activeDocumentId, recentDocuments, workspaceId]);

  const homeHref = homeDocument
    ? `/editor/${encodeURIComponent(homeDocument.id)}?workspaceId=${encodeURIComponent(
        homeDocument.workspaceId || workspaceId
      )}`
    : `/editor/recent?workspaceId=${encodeURIComponent(workspaceId)}`;

  const notifyError = useCallback((message: string) => {
    setActionError(message);
    window.setTimeout(() => setActionError(null), 3200);
  }, []);

  const handleRestoreDocument = useCallback(
    async (doc: DocumentSummary) => {
      const previous = trashedDocuments;
      setTrashedDocuments((current) => current.filter((item) => item.id !== doc.id));
      try {
        await restoreDocument(doc.id, workspaceId);
      } catch {
        setTrashedDocuments(previous);
        notifyError("Restore failed. Please try again.");
      }
    },
    [notifyError, trashedDocuments, workspaceId]
  );

  const handlePermanentDelete = useCallback(
    async (doc: DocumentSummary) => {
      const previous = trashedDocuments;
      setTrashedDocuments((current) => current.filter((item) => item.id !== doc.id));
      setPendingDelete(null);
      try {
        await permanentlyDeleteDocument(doc.id, workspaceId);
      } catch {
        setTrashedDocuments(previous);
        notifyError("Delete failed. Please try again.");
      }
    },
    [notifyError, trashedDocuments, workspaceId]
  );

  const handleEmptyTrash = useCallback(async () => {
    const previous = trashedDocuments;
    setTrashedDocuments([]);
    setIsEmptyTrashOpen(false);
    try {
      await emptyTrash(workspaceId);
    } catch {
      setTrashedDocuments(previous);
      notifyError("Empty trash failed. Please try again.");
    }
  }, [notifyError, trashedDocuments, workspaceId]);

  useEffect(() => {
    let isActive = true;

    const loadTrashDocuments = async () => {
      setIsSyncing(true);
      try {
        const docs = await fetchTrashDocuments(workspaceId);
        if (isActive) {
          setTrashedDocuments(docs);
        }
      } finally {
        if (isActive) {
          setIsSyncing(false);
        }
      }
    };

    void loadTrashDocuments();

    return () => {
      isActive = false;
    };
  }, [workspaceId]);

  return (
    <>
      <DashboardLayout
        workspaceId={workspaceId}
        activeNav="trash"
        pageTitle="Trash"
        pageSubtitle="Restore documents or permanently remove them."
        homeHref={homeHref}
        isSyncing={isSyncing}
        syncingLabel="Refreshing trash items"
        onCreateDocument={() => void createNewDocument()}
        isCreating={isCreating}
        createError={createError}
        headerActions={
          trashedDocuments.length > 0 ? (
            <button
              className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-600 transition hover:border-rose-300 hover:bg-rose-100 dark:border-rose-900/60 dark:bg-rose-500/10 dark:text-rose-200"
              onClick={() => setIsEmptyTrashOpen(true)}
              type="button"
            >
              <span className="material-symbols-outlined text-base">delete_sweep</span>
              <span>Empty Trash</span>
            </button>
          ) : null
        }
      >
        {actionError ? (
          <div className="mb-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-500/10 dark:text-rose-200">
            {actionError}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {showSkeleton ? (
            Array.from({ length: 8 }).map((_, index) => (
              <div
                key={`trash-skeleton-${index}`}
                className="group flex flex-col gap-4 rounded-xl border border-[#e7e7f3] bg-white p-4 dark:border-[#2a2b4a] dark:bg-[#16172d]"
              >
                <div className="skeleton-shimmer aspect-[4/3] w-full rounded-lg bg-[#e7e7f3] dark:bg-[#1e1f3a]"></div>
                <div className="flex flex-col gap-2">
                  <div className="skeleton-shimmer h-5 w-3/4 rounded bg-[#e7e7f3] dark:bg-[#1e1f3a]"></div>
                  <div className="skeleton-shimmer h-3 w-1/2 rounded bg-[#e7e7f3] dark:bg-[#1e1f3a]"></div>
                </div>
              </div>
            ))
          ) : trashedDocuments.length > 0 ? (
            trashedDocuments.map((doc) => {
              const title = getDocumentTitle(doc.title);
              const updatedAtLabel = doc.updatedAt
                ? new Date(doc.updatedAt).toLocaleDateString()
                : "Recently";

              return (
                <div
                  key={doc.id}
                  className="group relative flex flex-col gap-4 rounded-xl border border-[#e7e7f3] bg-white p-4 transition-shadow hover:shadow-lg dark:border-[#2a2b4a] dark:bg-[#16172d]"
                >
                  <div className="absolute right-3 top-3 flex items-center gap-2">
                    <button
                      className="flex h-8 w-8 items-center justify-center rounded-full border border-[#e7e7f3] bg-white/90 text-emerald-500 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-[#2a2b4a] dark:bg-[#1e1f3a] dark:text-emerald-300"
                      type="button"
                      aria-label="Restore document"
                      onClick={() => void handleRestoreDocument(doc)}
                    >
                      <span className="material-symbols-outlined text-lg">restore_from_trash</span>
                    </button>
                    <button
                      className="flex h-8 w-8 items-center justify-center rounded-full border border-[#e7e7f3] bg-white/90 text-rose-500 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-[#2a2b4a] dark:bg-[#1e1f3a] dark:text-rose-300"
                      type="button"
                      aria-label="Delete permanently"
                      onClick={() => setPendingDelete(doc)}
                    >
                      <span className="material-symbols-outlined text-lg">delete_forever</span>
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
                </div>
              );
            })
          ) : (
            <div className="col-span-full rounded-xl border border-dashed border-[#e7e7f3] p-6 text-center text-sm text-[#4c4d9a] dark:border-[#2a2b4a] dark:text-[#a1a1c9]">
              Trash is empty.
            </div>
          )}
        </div>
      </DashboardLayout>

      <ConfirmationModal
        isOpen={Boolean(pendingDelete)}
        title="Delete permanently?"
        description={pendingDelete ? `This cannot be undone for "${getDocumentTitle(pendingDelete.title)}".` : ""}
        warning="This action permanently deletes the document and cannot be undone."
        confirmLabel="Delete permanently"
        tone="danger"
        icon="delete_forever"
        onClose={() => setPendingDelete(null)}
        onConfirm={() => (pendingDelete ? void handlePermanentDelete(pendingDelete) : undefined)}
      />

      <ConfirmationModal
        isOpen={isEmptyTrashOpen}
        title="Empty trash?"
        description="This removes every document in the trash for this workspace."
        warning="This action permanently deletes all trashed documents."
        confirmLabel="Empty trash"
        tone="danger"
        icon="delete_sweep"
        onClose={() => setIsEmptyTrashOpen(false)}
        onConfirm={() => void handleEmptyTrash()}
      />
    </>
  );
};
