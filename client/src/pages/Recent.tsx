import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { useAppStore, actions } from "../app/store";
import { ConfirmationModal } from "../components/ConfirmationModal";
import { UserMenu } from "../components/UserMenu";
import { useStarToggle } from "../hooks/useStarToggle";
import {
  fetchDocuments,
  moveDocumentToTrash,
  type DocumentSummary
} from "../services/document.service";

export const Recent = () => {
  const { recentDocuments, activeDocumentId, dispatch } = useAppStore();
  const location = useLocation();
  const { toggleStar } = useStarToggle();
  const [searchParams] = useSearchParams();
  const workspaceId = searchParams.get("workspaceId") ?? "default";
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingTrashDocument, setPendingTrashDocument] = useState<DocumentSummary | null>(null);
  const showSkeleton = isSyncing && recentDocuments.length === 0;
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

  const handleToggleStar = useCallback(
    async (documentId: string) => {
      const doc = recentDocuments.find((item) => item.id === documentId);
      if (!doc) {
        return;
      }
      try {
        await toggleStar(doc);
      } catch {
        // Ignore toggle errors; optimistic update is reverted in the hook.
      }
    },
    [recentDocuments, toggleStar]
  );

  const handleConfirmMoveToTrash = useCallback(async () => {
    if (!pendingTrashDocument) {
      return;
    }
    const previousDocuments = recentDocuments;
    dispatch(
      actions.setRecentDocuments(
        previousDocuments.filter((doc) => doc.id !== pendingTrashDocument.id)
      )
    );
    setPendingTrashDocument(null);
    try {
      await moveDocumentToTrash(pendingTrashDocument.id, workspaceId);
    } catch {
      dispatch(actions.setRecentDocuments(previousDocuments));
    }
  }, [dispatch, pendingTrashDocument, recentDocuments, workspaceId]);

  useEffect(() => {
    let isActive = true;

    const loadRecentDocuments = async () => {
      setIsSyncing(true);
      try {
        const docs = await fetchDocuments(workspaceId);
        if (!isActive) {
          return;
        }
        dispatch(actions.setRecentDocuments(docs));
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

    void loadRecentDocuments();

    return () => {
      isActive = false;
    };
  }, [workspaceId, dispatch]);

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
                    Updating your latest changes
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
              <UserMenu />
            </div>
          </header>

          <div className="p-8">
            <div className="mb-8 flex items-end justify-between">
              <div>
                <h2 className="mb-2 text-3xl font-black tracking-tight">Recent Documents</h2>
                <p className="text-[#4c4d9a] dark:text-[#a1a1c9]">Manage and edit your workspace files</p>
              </div>
              <div className="flex gap-2">
                <div className="skeleton-shimmer h-9 w-24 rounded-lg bg-[#e7e7f3] dark:bg-[#1e1f3a]"></div>
                <div className="skeleton-shimmer h-9 w-24 rounded-lg bg-[#e7e7f3] dark:bg-[#1e1f3a]"></div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {showSkeleton ? (
                Array.from({ length: 8 }).map((_, index) => (
                  <div
                    key={`recent-skeleton-${index}`}
                    className="group flex flex-col gap-4 rounded-xl border border-[#e7e7f3] bg-white p-4 dark:border-[#2a2b4a] dark:bg-[#16172d]"
                  >
                    <div className="skeleton-shimmer aspect-[4/3] w-full rounded-lg bg-[#e7e7f3] dark:bg-[#1e1f3a]"></div>
                    <div className="flex flex-col gap-2">
                      <div className="skeleton-shimmer h-5 w-3/4 rounded bg-[#e7e7f3] dark:bg-[#1e1f3a]"></div>
                      <div className="skeleton-shimmer h-3 w-1/2 rounded bg-[#e7e7f3] dark:bg-[#1e1f3a]"></div>
                    </div>
                  </div>
                ))
              ) : recentDocuments.length > 0 ? (
                recentDocuments.map((doc) => {
                  const title = doc.title?.trim() ? doc.title : "Untitled document";
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
                  No recent documents yet.
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      <ConfirmationModal
        isOpen={Boolean(pendingTrashDocument)}
        title="Move to trash?"
        description={
          pendingTrashDocument
            ? `You can restore "${pendingTrashDocument.title || "Untitled document"}" from the trash later.`
            : ""
        }
        confirmLabel="Move to trash"
        cancelLabel="Cancel"
        tone="danger"
        icon="delete"
        onClose={() => setPendingTrashDocument(null)}
        onConfirm={() => void handleConfirmMoveToTrash()}
      />
    </div>
  );
};
