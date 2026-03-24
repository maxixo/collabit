import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { updateProfile, validateProfileUpdate } from "../services/user.service";
import { WorkspaceProvider, useWorkspace } from "../workspace/WorkspaceContext";

const ProfileContent = ({ workspaceId }: { workspaceId: string }) => {
  const { user, status, refresh } = useAuth();
  const { workspace, isLoading: workspaceLoading } = useWorkspace();
  const [name, setName] = useState("");
  const [image, setImage] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (status !== "authenticated") {
      return;
    }

    setName(user?.name ?? "");
    setImage(user?.image ?? "");
  }, [status, user]);

  const userLabel = useMemo(() => {
    if (status !== "authenticated") {
      return "User";
    }
    return name.trim() || user?.email?.trim() || "User";
  }, [status, name, user]);

  const userInitial = useMemo(() => {
    const firstWord = userLabel.split(/\s+/)[0];
    return firstWord ? firstWord.charAt(0).toUpperCase() : "U";
  }, [userLabel]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validation = validateProfileUpdate({ name, image });
    if (!validation.ok) {
      setFormError(validation.message);
      setSuccessMessage(null);
      return;
    }

    setIsSaving(true);
    setFormError(null);
    setSuccessMessage(null);

    try {
      const nextUser = await updateProfile(validation.data);
      setName(nextUser.name ?? validation.data.name);
      setImage(nextUser.image ?? "");
      await refresh();
      setSuccessMessage("Profile updated.");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Failed to update profile.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background-light font-['Inter',_sans-serif] text-[#0d0e1b] dark:bg-background-dark dark:text-[#f8f8fc]">
      <header className="flex items-center justify-between border-b border-[#e7e7f3] bg-white px-8 py-5 dark:border-[#2a2b4a] dark:bg-[#16172d]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-[#4c4d9a] dark:text-[#a1a1c9]">
            Settings
          </p>
          <h1 className="text-2xl font-black">Profile</h1>
        </div>
        <Link
          className="rounded-lg border border-[#e7e7f3] px-4 py-2 text-sm font-semibold text-[#4c4d9a] transition-colors hover:border-primary hover:text-primary dark:border-[#2a2b4a] dark:text-[#a1a1c9] dark:hover:border-primary dark:hover:text-primary"
          to={`/editor/recent?workspaceId=${encodeURIComponent(workspaceId)}`}
        >
          Back to documents
        </Link>
      </header>

      <main className="mx-auto grid w-full max-w-5xl gap-8 p-8 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-2xl border border-[#e7e7f3] bg-white p-6 shadow-sm dark:border-[#2a2b4a] dark:bg-[#16172d]">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-[#e7e7f3] text-lg font-bold text-[#4c4d9a] dark:border-[#2a2b4a] dark:bg-[#1e1f3a] dark:text-[#a1a1c9]">
              {image.trim() ? (
                <img className="h-full w-full object-cover" src={image} alt={`${userLabel} profile`} />
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

          <form className="mt-8 grid gap-5" onSubmit={(event) => void handleSubmit(event)}>
            <label className="grid gap-2">
              <span className="text-sm font-semibold text-[#0d0e1b] dark:text-white">Display name</span>
              <input
                className="rounded-xl border border-[#d8d9ee] bg-[#f8f8fc] px-4 py-3 text-sm outline-none transition focus:border-primary focus:bg-white dark:border-[#2a2b4a] dark:bg-[#1e1f3a] dark:text-white dark:focus:bg-[#16172d]"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={80}
                placeholder="Your name"
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-semibold text-[#0d0e1b] dark:text-white">Avatar URL</span>
              <input
                className="rounded-xl border border-[#d8d9ee] bg-[#f8f8fc] px-4 py-3 text-sm outline-none transition focus:border-primary focus:bg-white dark:border-[#2a2b4a] dark:bg-[#1e1f3a] dark:text-white dark:focus:bg-[#16172d]"
                value={image}
                onChange={(event) => setImage(event.target.value)}
                placeholder="https://example.com/avatar.png"
              />
              <p className="text-xs text-[#4c4d9a] dark:text-[#a1a1c9]">
                Leave this blank to use initials instead of an image.
              </p>
            </label>

            {formError ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-500/10 dark:text-rose-200">
                {formError}
              </div>
            ) : null}

            {successMessage ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-500/10 dark:text-emerald-200">
                {successMessage}
              </div>
            ) : null}

            <div className="flex items-center justify-end gap-3">
              <button
                className="rounded-lg border border-[#d8d9ee] px-4 py-2 text-sm font-semibold text-[#4c4d9a] transition hover:border-primary hover:text-primary dark:border-[#2a2b4a] dark:text-[#a1a1c9] dark:hover:border-primary dark:hover:text-primary"
                type="button"
                onClick={() => {
                  setName(user?.name ?? "");
                  setImage(user?.image ?? "");
                  setFormError(null);
                  setSuccessMessage(null);
                }}
                disabled={isSaving}
              >
                Reset
              </button>
              <button
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                type="submit"
                disabled={isSaving}
              >
                {isSaving ? "Saving..." : "Save profile"}
              </button>
            </div>
          </form>
        </section>

        <aside className="grid gap-4">
          <div className="rounded-2xl border border-[#e7e7f3] bg-white p-6 shadow-sm dark:border-[#2a2b4a] dark:bg-[#16172d]">
            <p className="text-xs font-semibold uppercase tracking-widest text-[#4c4d9a] dark:text-[#a1a1c9]">
              Active workspace
            </p>
            <p className="mt-2 text-lg font-bold text-[#0d0e1b] dark:text-white">{workspace.name}</p>
            <p className="mt-1 text-sm text-[#4c4d9a] dark:text-[#a1a1c9]">
              {workspaceLoading ? "Loading workspace details..." : workspace.membershipStatus}
            </p>
          </div>

          <div className="rounded-2xl border border-[#e7e7f3] bg-white p-6 shadow-sm dark:border-[#2a2b4a] dark:bg-[#16172d]">
            <p className="text-xs font-semibold uppercase tracking-widest text-[#4c4d9a] dark:text-[#a1a1c9]">
              Session
            </p>
            <p className="mt-2 text-sm text-[#4c4d9a] dark:text-[#a1a1c9]">
              Changes here update the profile shown in the editor header and user menu without a full reload.
            </p>
          </div>
        </aside>
      </main>
    </div>
  );
};

export const Profile = () => {
  const [searchParams] = useSearchParams();
  const workspaceId = searchParams.get("workspaceId")?.trim() || "default";

  return (
    <WorkspaceProvider workspaceId={workspaceId}>
      <ProfileContent workspaceId={workspaceId} />
    </WorkspaceProvider>
  );
};
