import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { useAppStore } from "../app/store";
import { useAuth } from "../auth/AuthContext";
import { useStarToggle } from "../hooks/useStarToggle";
import { fetchStarredDocuments, type DocumentSummary } from "../services/document.service";
import { subscribeToStarUpdates } from "../utils/starEvents";

export const Starred = () => {
  const { recentDocuments } = useAppStore();
  const { user, status } = useAuth();
  const location = useLocation();
  const { toggleStar } = useStarToggle();
  const [searchParams] = useSearchParams();
  const workspaceId = searchParams.get("workspaceId") ?? "default";
  const [isSyncing, setIsSyncing] = useState(false);
  const [starredDocuments, setStarredDocuments] = useState<DocumentSummary[]>([]);
  const showSkeleton = isSyncing && starredDocuments.length === 0;
  const recentDocumentsRef = useRef(recentDocuments);

  useEffect(() => {
    recentDocumentsRef.current = recentDocuments;
  }, [recentDocuments]);

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

  const navLinkClass = (isActive: boolean) =>
    isActive
      ? "flex items-center gap-3 rounded-lg bg-[#e7e7f3] px-3 py-2 text-primary dark:bg-primary/20"
      : "flex items-center gap-3 rounded-lg px-3 py-2 text-[#4c4d9a] transition-colors hover:bg-[#f0f0f7] dark:text-[#a1a1c9] dark:hover:bg-white/5";

  const updateStarredList = useCallback(
    (documentId: string, nextIsStarred: boolean, fallback?: DocumentSummary) => {
      setStarredDocuments((previous) => {
        if (nextIsStarred) {
          const exists = previous.some((doc) => doc.id === documentId);
          if (exists) {
            return previous.map((doc) =>
              doc.id === documentId ? { ...doc, isStarred: true } : doc
            );
          }
          if (fallback) {
            return [{ ...fallback, isStarred: true }, ...previous];
          }
          return previous;
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

  useEffect(() => {
    let isActive = true;

    const loadStarredDocuments = async () => {
      setIsSyncing(true);
      try {
        const docs = await fetchStarredDocuments(workspaceId);
        if (!isActive) {
          return;
        }
        setStarredDocuments(docs);
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
              <Link className={navLinkClass(false)} to="/">
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
              <div className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-[#4c4d9a] transition-colors hover:bg-[#f0f0f7] dark:text-[#a1a1c9] dark:hover:bg-white/5">
                <span className="material-symbols-outlined">delete</span>
                <p className="text-sm font-medium">Trash</p>
              </div>
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
                    Updating your starred list
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
                <h2 className="mb-2 text-3xl font-black tracking-tight">Starred Documents</h2>
                <p className="text-[#4c4d9a] dark:text-[#a1a1c9]">Keep your essentials close at hand</p>
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
                      <button
                        className={`absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full border border-[#e7e7f3] bg-white/90 text-[#4c4d9a] shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-[#2a2b4a] dark:bg-[#1e1f3a] dark:text-[#a1a1c9] ${
                          doc.isStarred ? "text-amber-400 dark:text-amber-300" : ""
                        }`}
                        type="button"
                        aria-pressed={doc.isStarred}
                        aria-label={doc.isStarred ? "Unstar document" : "Star document"}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          void handleToggleStar(doc);
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
          </div>
        </main>
      </div>
    </div>
  );
};
