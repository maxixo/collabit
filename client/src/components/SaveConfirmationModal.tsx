import { useState, useEffect } from "react";

interface PendingChangeSummary {
  userId: string;
  changeCount: number;
  firstChange: string;
  lastChange: string;
  changeTypes: string[];
  user?: {
    id: string;
    displayName?: string;
    email?: string;
  };
}

interface SaveConfirmationModalProps {
  isOpen: boolean;
  documentId: string;
  documentTitle: string;
  workspaceId: string;
  pendingChanges: PendingChangeSummary[];
  onApplySave: () => Promise<void>;
  onSaveOnly: () => Promise<void>;
  onCancel: () => void;
  isSaving?: boolean;
}

export const SaveConfirmationModal = ({
  isOpen,
  documentId,
  documentTitle,
  pendingChanges,
  onApplySave,
  onSaveOnly,
  onCancel,
  isSaving = false
}: SaveConfirmationModalProps) => {
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);

  useEffect(() => {
    if (isOpen) {
      // Auto-select all users when modal opens
      const allUserIds = new Set(pendingChanges.map((c) => c.userId));
      setSelectedUsers(allUserIds);
      setSelectAll(true);
    }
  }, [isOpen, pendingChanges]);

  const handleToggleUser = (userId: string) => {
    const newSelected = new Set(selectedUsers);
    if (newSelected.has(userId)) {
      newSelected.delete(userId);
    } else {
      newSelected.add(userId);
    }
    setSelectedUsers(newSelected);
    setSelectAll(newSelected.size === pendingChanges.length);
  };

  const handleToggleAll = () => {
    if (selectAll) {
      setSelectedUsers(new Set());
      setSelectAll(false);
    } else {
      const allUserIds = new Set(pendingChanges.map((c) => c.userId));
      setSelectedUsers(allUserIds);
      setSelectAll(true);
    }
  };

  const totalChanges = pendingChanges.reduce((sum, c) => sum + c.changeCount, 0);
  const selectedCount = selectedUsers.size;
  const selectedChanges = pendingChanges
    .filter((c) => selectedUsers.has(c.userId))
    .reduce((sum, c) => sum + c.changeCount, 0);

  const formatTimeAgo = (timestamp: string) => {
    const now = new Date();
    const then = new Date(timestamp);
    const diffMs = now.getTime() - then.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return `${Math.floor(diffMins / 1440)}d ago`;
  };

  const getChangeTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      insert: "added",
      delete: "removed",
      update: "edited",
      format: "formatted",
      title: "renamed"
    };
    return labels[type] || type;
  };

  const getChangeSummary = (changes: string[], count: number) => {
    const uniqueTypes = [...new Set(changes)].slice(0, 2);
    if (uniqueTypes.length === 1) {
      return `${count} ${getChangeTypeLabel(uniqueTypes[0])}`;
    }
    return `${count} changes`;
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="mx-4 w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-[#16172d]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#e7e7f3] bg-[#f8f8fc] px-6 py-4 dark:border-[#2a2b4a] dark:bg-[#1e1f3a]">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <span className="material-symbols-outlined">save</span>
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#0d0e1b] dark:text-white">
                Save Document
              </h2>
              <p className="text-sm text-[#4c4d9a] dark:text-[#a1a1c9]">
                {pendingChanges.length > 0
                  ? `${totalChanges} pending ${totalChanges === 1 ? "change" : "changes"}`
                  : "Ready to save"}
              </p>
            </div>
          </div>
          <button
            className="rounded-lg p-2 text-[#4c4d9a] transition-colors hover:bg-[#e7e7f3] dark:text-[#a1a1c9] dark:hover:bg-[#2a2b4a]"
            onClick={onCancel}
            type="button"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="px-6 py-4">
          <div className="mb-4">
            <p className="text-sm font-medium text-[#0d0e1b] dark:text-white">
              {documentTitle}
            </p>
            <p className="mt-1 text-xs text-[#4c4d9a] dark:text-[#a1a1c9]">
              {documentId}
            </p>
          </div>

          {pendingChanges.length > 0 ? (
            <>
              <div className="mb-3 flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm font-medium text-[#0d0e1b] dark:text-white">
                  <input
                    type="checkbox"
                    checked={selectAll}
                    onChange={handleToggleAll}
                    className="h-4 w-4 rounded border-[#e7e7f3] text-primary focus:ring-primary dark:border-[#2a2b4a]"
                  />
                  Select All Collaborators ({selectedCount}/{pendingChanges.length})
                </label>
                <span className="text-xs text-[#4c4d9a] dark:text-[#a1a1c9]">
                  {selectedChanges} of {totalChanges} changes
                </span>
              </div>

              <div className="max-h-64 space-y-2 overflow-y-auto">
                {pendingChanges.map((change) => (
                  <div
                    key={change.userId}
                    className="flex items-start gap-3 rounded-lg border border-[#e7e7f3] bg-[#f8f8fc] p-3 transition-colors hover:border-primary/50 dark:border-[#2a2b4a] dark:bg-[#1e1f3a]"
                  >
                    <input
                      type="checkbox"
                      checked={selectedUsers.has(change.userId)}
                      onChange={() => handleToggleUser(change.userId)}
                      className="mt-0.5 h-4 w-4 rounded border-[#e7e7f3] text-primary focus:ring-primary dark:border-[#2a2b4a]"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-primary">
                          {change.user?.displayName
                            ? change.user.displayName.charAt(0).toUpperCase()
                            : "?"
                          }
                        </div>
                        <p className="truncate text-sm font-medium text-[#0d0e1b] dark:text-white">
                          {change.user?.displayName || change.user?.email || "Unknown User"}
                        </p>
                      </div>
                      <p className="mt-1 text-xs text-[#4c4d9a] dark:text-[#a1a1c9]">
                        {getChangeSummary(change.changeTypes, change.changeCount)} • Last updated{" "}
                        {formatTimeAgo(change.lastChange)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700 dark:border-amber-900/60 dark:bg-amber-500/10 dark:text-amber-200">
                <p className="font-medium">About Pending Changes</p>
                <p className="mt-1">
                  These changes haven't been permanently saved yet. Applying them will incorporate
                  all selected collaborators' changes into the final saved version.
                </p>
              </div>
            </>
          ) : (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-500/10 dark:text-emerald-200">
              No pending changes. Your document is up to date.
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-[#e7e7f3] bg-[#f8f8fc] px-6 py-4 dark:border-[#2a2b4a] dark:bg-[#1e1f3a]">
          <button
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-[#4c4d9a] transition-colors hover:bg-[#e7e7f3] dark:text-[#a1a1c9] dark:hover:bg-[#2a2b4a] disabled:cursor-not-allowed disabled:opacity-60"
            onClick={onCancel}
            type="button"
            disabled={isSaving}
          >
            Cancel
          </button>

          {pendingChanges.length > 0 && (
            <button
              className="flex items-center gap-2 rounded-lg border-2 border-primary px-4 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={onSaveOnly}
              type="button"
              disabled={isSaving}
            >
              Save Only My Changes
            </button>
          )}

          <button
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => onApplySave()}
            type="button"
            disabled={isSaving || (pendingChanges.length > 0 && selectedCount === 0)}
          >
            <span className="material-symbols-outlined text-base">save</span>
            {isSaving ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Saving...
              </span>
            ) : pendingChanges.length > 0 ? (
              `Apply & Save ${selectedCount > 0 ? `(${selectedCount})` : ""}`
            ) : (
              "Save Document"
            )}
          </button>
        </div>
      </div>
    </div>
  );
};