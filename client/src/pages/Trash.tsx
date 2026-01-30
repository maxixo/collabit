import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { useAppStore } from "../app/store";
import { useAuth } from "../auth/AuthContext";
import { ConfirmationModal } from "../components/ConfirmationModal";
import {
  emptyTrash,
  fetchTrashDocuments,
  permanentlyDeleteDocument,
  restoreDocument,
  type DocumentSummary
} from "../services/document.service";

export const Trash = () => {
  const { activeDocumentId, recentDocuments } = useAppStore();
  const { user, status } = useAuth();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const workspaceId = searchParams.get("workspaceId") ?? "default";
  const [isSyncing, setIsSyncing] = useState(false);
  const [trashedDocuments, setTrashedDocuments] = useState<DocumentSummary[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<DocumentSummary | null>(null);
  const [isEmptyTrashOpen, setIsEmptyTrashOpen] = useState(false);
  const showSkeleton = isSyncing && trashedDocuments.length === 0;
  const userLabel = useMemo(() => {
    if (status !== "authenticated") {
      return "User";
    }
    return user?.name?.trim() || user?.email?.trim() || "User";
  }, [status, user]);
  const userInitial = useMemo(() => {
    const firstWord = userLabel.split(/\s+/)[0];
    return firstWord ? firstWord.charAt(0).toUpperCase() : "U";
  }, [userLabel]);
  const isRecentRoute = location.pathname === "/editor/recent";
  const isStarredRoute = location.pathname === "/editor/starred";
  const isTrashRoute = location.pathname === "/editor/trash";
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
    : "/editor/recent";

  const navLinkClass = (isActive: boolean) =>
    isActive
      ? "flex items-center gap-3 rounded-lg bg-[#e7e7f3] px-3 py-2 text-primary dark:bg-primary/20"
      : "flex items-center gap-3 rounded-lg px-3 py-2 text-[#4c4d9a] transition-colors hover:bg-[#f0f0f7] dark:text-[#a1a1c9] dark:hover:bg-white/5";

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
        if (!isActive) {
          return;
        }
        setTrashedDocuments(docs);
      } catch {
        if (!isActive) {
          return;
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
    <div className="bg-background-light text-[#0d0e1b] dark:bg-background-dark dark:text-[#f8f8fc] font-['Inter',_sans-serif]">
      <div className="flex h-screen overflow-hidden">
        <aside className="z-20 flex w-64 flex-col justify-between border-r border-[#e7e7f3] bg-white p-4 dark:border-[#2a2b4a] dark:bg-[#16172d]">
          <div className="flex flex-col gap-6">
            <div className="flex items-center gap-3 p-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-white">
                <span className="material-symbols-outlined">edit_square</span>
              </div>
              <div className="flex flex-col overflow-hidden">
                <h1 className="truncate text-base font-bold">Workspace Alpha</h1>
                <p className="text-xs font-medium text-[#4c4d9a] dark:text-[#a1a1c9]">Collaborative Team</p>
              </div>
            </div>

            <button
              className="hover-lift flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-3 text-sm font-bold tracking-wide text-white"
              type="button"
            >
              <span className="material-symbols-outlined text-lg">add</span>
              <span>Create New</span>
            </button>

            <nav className="flex flex-col gap-1">
              <Link className={navLinkClass(false)} to={homeHref}>
                <span className="material-symbols-outlined">home</span>
                <p className="text-sm font-semibold">Home</p>
              </Link>
              <Link
                className={navLinkClass(isRecentRoute)}
                to="/editor/recent"
                aria-current={isRecentRoute ? "page" : undefined}
              >
                <span className="material-symbols-outlined">schedule</span>
                <p className="text-sm font-medium">Recent</p>
              </Link>
              <Link
                className={navLinkClass(isStarredRoute)}
                to="/editor/starred"
                aria-current={isStarredRoute ? "page" : undefined}
              >
                <span className="material-symbols-outlined">star</span>
                <p className="text-sm font-medium">Starred</p>
              </Link>
              <div className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-[#4c4d9a] transition-colors hover:bg-[#f0f0f7] dark:text-[#a1a1c9] dark:hover:bg-white/5">
                <span className="material-symbols-outlined">group</span>
                <p className="text-sm font-medium">Shared</p>
              </div>
              <Link
                className={navLinkClass(isTrashRoute)}
                to="/editor/trash"
                aria-current={isTrashRoute ? "page" : undefined}
              >
                <span className="material-symbols-outlined">delete</span>
                <p className="text-sm font-medium">Trash</p>
              </Link>
            </nav>
          </div>

          <div className="flex flex-col gap-4">
            <div className="rounded-lg bg-[#f8f8fc] p-3 dark:bg-[#1e1f3a]">
              <div className="mb-2 flex justify-between text-xs font-bold">
                <span>Storage</span>
                <span>75%</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-[#e7e7f3] dark:bg-[#2a2b4a]">
                <div className="h-full w-3/4 rounded-full bg-primary"></div>
              </div>
            </div>
            <div className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-[#4c4d9a] transition-colors hover:bg-[#f0f0f7] dark:text-[#a1a1c9] dark:hover:bg-white/5">
              <span className="material-symbols-outlined">settings</span>
              <p className="text-sm font-medium">Settings</p>
            </div>
          </div>
        </aside>

        <main className="relative flex flex-1 flex-col overflow-y-auto">
          {isSyncing ? (
            <div className="fixed right-6 top-6 z-50">
              <div className="flex min-w-[280px] items-center gap-3 rounded-xl border border-[#cfd0e7] bg-white p-4 shadow-xl dark:border-[#2a2b4a] dark:bg-[#1e1f3a]">
                <div className="relative flex items-center justify-center">
                  <span className="material-symbols-outlined spinner-rotate text-primary">sync</span>
                  <div className="dot-pulse absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-white bg-amber-500 dark:border-[#1e1f3a]"></div>
                </div>
                <div className="flex flex-col">
                  <p className="text-sm font-bold leading-none text-[#0d0e1b] dark:text-white">Syncing...</p>
                  <p className="mt-1 text-xs text-[#4c4d9a] dark:text-[#a1a1c9]">
                    Loading trash items
                  </p>
                </div>
                <button className="ml-auto text-[#cfd0e7] transition-colors hover:text-primary" type="button">
                  <span className="material-symbols-outlined text-sm">close</span>
                </button>
              </div>
            </div>
          ) : null}

          <header className="sticky top-0 z-10 flex items-center justify-between border-b border-[#e7e7f3] bg-background-light px-8 py-4 dark:border-[#2a2b4a] dark:bg-background-dark">
            <div className="flex-1 max-w-xl">
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#4c4d9a] dark:text-[#a1a1c9]">
                  search
                </span>
                <div className="skeleton-shimmer h-10 w-full rounded-lg bg-[#e7e7f3] dark:bg-[#1e1f3a]"></div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <button
                className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#e7e7f3] text-[#0d0e1b] dark:bg-[#1e1f3a] dark:text-white"
                type="button"
              >
                <span className="material-symbols-outlined">notifications</span>
              </button>
              <button
                className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#e7e7f3] text-[#0d0e1b] dark:bg-[#1e1f3a] dark:text-white"
                type="button"
              >
                <span className="material-symbols-outlined">help</span>
              </button>
              <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-[#e7e7f3] text-sm font-bold text-[#4c4d9a] dark:border-[#2a2b4a] dark:bg-[#1e1f3a] dark:text-[#a1a1c9]">
                {user?.image ? (
                  <img
                    className="h-full w-full object-cover"
                    src={user.image}
                    alt={`${userLabel} profile`}
                  />
                ) : (
                  <span aria-hidden="true">{userInitial}</span>
                )}
              </div>
            </div>
          </header>

          <div className="p-8">
            <div className="mb-8 flex items-end justify-between">
              <div>
                <h2 className="mb-2 text-3xl font-black tracking-tight">Trash</h2>
                <p className="text-[#4c4d9a] dark:text-[#a1a1c9]">
                  Restore items or permanently remove them.
                </p>
              </div>
              <div className="flex gap-2">
                {trashedDocuments.length > 0 ? (
                  <button
                    className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-600 transition hover:border-rose-300 hover:bg-rose-100 dark:border-rose-900/60 dark:bg-rose-500/10 dark:text-rose-200"
                    onClick={() => setIsEmptyTrashOpen(true)}
                    type="button"
                  >
                    <span className="material-symbols-outlined text-base">delete_sweep</span>
                    <span>Empty Trash</span>
                  </button>
                ) : showSkeleton ? (
                  <div className="skeleton-shimmer h-9 w-28 rounded-lg bg-[#e7e7f3] dark:bg-[#1e1f3a]"></div>
                ) : null}
              </div>
            </div>

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
                  const title = doc.title?.trim() ? doc.title : "Untitled document";
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
          </div>
        </main>
      </div>

      <ConfirmationModal
        isOpen={Boolean(pendingDelete)}
        title="Delete permanently?"
        description={pendingDelete ? `This cannot be undone for "${pendingDelete.title || "Untitled document"}".` : ""}
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
    </div>
  );
};
