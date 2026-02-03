import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export const Profile = () => {
  const { user, status } = useAuth();

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

  return (
    <div className="min-h-screen bg-background-light text-[#0d0e1b] dark:bg-background-dark dark:text-[#f8f8fc] font-['Inter',_sans-serif]">
      <header className="flex items-center justify-between border-b border-[#e7e7f3] bg-white px-8 py-5 dark:border-[#2a2b4a] dark:bg-[#16172d]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-[#4c4d9a] dark:text-[#a1a1c9]">
            Settings
          </p>
          <h1 className="text-2xl font-black">Profile</h1>
        </div>
        <Link
          className="rounded-lg border border-[#e7e7f3] px-4 py-2 text-sm font-semibold text-[#4c4d9a] transition-colors hover:border-primary hover:text-primary dark:border-[#2a2b4a] dark:text-[#a1a1c9] dark:hover:border-primary dark:hover:text-primary"
          to="/editor/recent"
        >
          Back to documents
        </Link>
      </header>

      <main className="mx-auto w-full max-w-3xl p-8">
        <div className="rounded-2xl border border-[#e7e7f3] bg-white p-6 shadow-sm dark:border-[#2a2b4a] dark:bg-[#16172d]">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-[#e7e7f3] text-lg font-bold text-[#4c4d9a] dark:border-[#2a2b4a] dark:bg-[#1e1f3a] dark:text-[#a1a1c9]">
              {user?.image ? (
                <img className="h-full w-full object-cover" src={user.image} alt={`${userLabel} profile`} />
              ) : (
                <span aria-hidden="true">{userInitial}</span>
              )}
            </div>
            <div>
              <p className="text-lg font-bold text-[#0d0e1b] dark:text-white">{userLabel}</p>
              <p className="text-sm text-[#4c4d9a] dark:text-[#a1a1c9]">
                {user?.email || "user@example.com"}
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-[#e7e7f3] bg-[#f8f8fc] p-4 dark:border-[#2a2b4a] dark:bg-[#1e1f3a]">
              <p className="text-xs font-semibold uppercase tracking-widest text-[#4c4d9a] dark:text-[#a1a1c9]">
                Role
              </p>
              <p className="mt-2 text-sm font-semibold text-[#0d0e1b] dark:text-white">Member</p>
            </div>
            <div className="rounded-xl border border-[#e7e7f3] bg-[#f8f8fc] p-4 dark:border-[#2a2b4a] dark:bg-[#1e1f3a]">
              <p className="text-xs font-semibold uppercase tracking-widest text-[#4c4d9a] dark:text-[#a1a1c9]">
                Workspace
              </p>
              <p className="mt-2 text-sm font-semibold text-[#0d0e1b] dark:text-white">Workspace Alpha</p>
            </div>
          </div>

          <p className="mt-6 text-sm text-[#4c4d9a] dark:text-[#a1a1c9]">
            This is a placeholder profile page. Profile editing will be available soon.
          </p>
        </div>
      </main>
    </div>
  );
};
