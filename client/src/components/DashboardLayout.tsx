import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { UserMenu } from "./UserMenu";
import { useAuth } from "../auth/AuthContext";
import { WorkspaceProvider, useWorkspace } from "../workspace/WorkspaceContext";

type DashboardNav = "recent" | "starred" | "shared" | "trash";

interface DashboardLayoutProps {
  workspaceId: string;
  activeNav: DashboardNav;
  pageTitle: string;
  pageSubtitle: string;
  homeHref: string;
  isSyncing?: boolean;
  syncingLabel?: string;
  createError?: string | null;
  isCreating?: boolean;
  onCreateDocument: () => void;
  headerActions?: ReactNode;
  children: ReactNode;
}

const navLinkClass = (isActive: boolean) =>
  isActive
    ? "flex items-center gap-3 rounded-lg bg-[#e7e7f3] px-3 py-2 text-primary dark:bg-primary/20"
    : "flex items-center gap-3 rounded-lg px-3 py-2 text-[#4c4d9a] transition-colors hover:bg-[#f0f0f7] dark:text-[#a1a1c9] dark:hover:bg-white/5";

const buildWorkspacePath = (path: string, workspaceId: string) =>
  `${path}?workspaceId=${encodeURIComponent(workspaceId)}`;

const DashboardLayoutInner = ({
  workspaceId,
  activeNav,
  pageTitle,
  pageSubtitle,
  homeHref,
  isSyncing = false,
  syncingLabel = "Updating your latest changes",
  createError,
  isCreating = false,
  onCreateDocument,
  headerActions,
  children
}: DashboardLayoutProps) => {
  const { workspace, isLoading } = useWorkspace();
  const { user, status } = useAuth();
  const membershipLabel =
    workspace.membershipStatus === "owner"
      ? "Workspace owner"
      : workspace.membershipStatus === "member"
        ? "Workspace member"
        : "Guest access";
  const userLabel =
    status === "authenticated"
      ? user?.name?.trim() || user?.email?.trim() || "User"
      : "User";

  return (
    <div className="bg-background-light font-['Inter',_sans-serif] text-[#0d0e1b] dark:bg-background-dark dark:text-[#f8f8fc]">
      <div className="flex min-h-screen overflow-hidden">
        <aside className="z-20 flex w-64 flex-col justify-between border-r border-[#e7e7f3] bg-white p-4 dark:border-[#2a2b4a] dark:bg-[#16172d]">
          <div className="flex flex-col gap-6">
            <div className="flex items-center gap-3 p-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-white">
                <span className="material-symbols-outlined">edit_square</span>
              </div>
              <div className="flex flex-col overflow-hidden">
                <h1 className="truncate text-base font-bold">{workspace.name}</h1>
                <p className="text-xs font-medium text-[#4c4d9a] dark:text-[#a1a1c9]">
                  {isLoading ? "Loading workspace..." : membershipLabel}
                </p>
              </div>
            </div>

            <button
              className="hover-lift flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-3 text-sm font-bold tracking-wide text-white disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
              onClick={onCreateDocument}
              disabled={isCreating}
            >
              <span className="material-symbols-outlined text-lg">add</span>
              <span>{isCreating ? "Creating..." : "Create New"}</span>
            </button>

            <nav className="flex flex-col gap-1">
              <Link className={navLinkClass(false)} to={homeHref}>
                <span className="material-symbols-outlined">home</span>
                <p className="text-sm font-semibold">Home</p>
              </Link>
              <Link
                className={navLinkClass(activeNav === "recent")}
                to={buildWorkspacePath("/editor/recent", workspaceId)}
                aria-current={activeNav === "recent" ? "page" : undefined}
              >
                <span className="material-symbols-outlined">schedule</span>
                <p className="text-sm font-medium">Recent</p>
              </Link>
              <Link
                className={navLinkClass(activeNav === "starred")}
                to={buildWorkspacePath("/editor/starred", workspaceId)}
                aria-current={activeNav === "starred" ? "page" : undefined}
              >
                <span className="material-symbols-outlined">star</span>
                <p className="text-sm font-medium">Starred</p>
              </Link>
              <Link
                className={navLinkClass(activeNav === "shared")}
                to={buildWorkspacePath("/editor/shared", workspaceId)}
                aria-current={activeNav === "shared" ? "page" : undefined}
              >
                <span className="material-symbols-outlined">group</span>
                <p className="text-sm font-medium">Shared</p>
              </Link>
              <Link
                className={navLinkClass(activeNav === "trash")}
                to={buildWorkspacePath("/editor/trash", workspaceId)}
                aria-current={activeNav === "trash" ? "page" : undefined}
              >
                <span className="material-symbols-outlined">delete</span>
                <p className="text-sm font-medium">Trash</p>
              </Link>
            </nav>
          </div>

          <div>
            <Link
              className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-[#4c4d9a] transition-colors hover:bg-[#f0f0f7] dark:text-[#a1a1c9] dark:hover:bg-white/5"
              to={buildWorkspacePath("/profile", workspaceId)}
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="material-symbols-outlined">settings</span>
                <p className="text-sm font-medium">Settings</p>
              </div>
              <p className="truncate text-xs font-medium text-[#6d6ea8] dark:text-[#a1a1c9]">
                {userLabel}
              </p>
            </Link>
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
                  <p className="mt-1 text-xs text-[#4c4d9a] dark:text-[#a1a1c9]">{syncingLabel}</p>
                </div>
              </div>
            </div>
          ) : null}

          <header className="sticky top-0 z-10 flex items-center justify-end border-b border-[#e7e7f3] bg-background-light px-8 py-4 dark:border-[#2a2b4a] dark:bg-background-dark">
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
            <div className="mb-8 flex items-end justify-between gap-4">
              <div>
                <h2 className="mb-2 text-3xl font-black tracking-tight">{pageTitle}</h2>
                <p className="text-[#4c4d9a] dark:text-[#a1a1c9]">{pageSubtitle}</p>
              </div>
              <div className="flex gap-2">{headerActions}</div>
            </div>

            {createError ? (
              <div className="mb-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-500/10 dark:text-rose-200">
                {createError}
              </div>
            ) : null}

            {children}
          </div>
        </main>
      </div>
    </div>
  );
};

export const DashboardLayout = (props: DashboardLayoutProps) => (
  <WorkspaceProvider workspaceId={props.workspaceId}>
    <DashboardLayoutInner {...props} />
  </WorkspaceProvider>
);
