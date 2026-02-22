import { useState, useEffect } from "react";
import type { JSONContent } from "@tiptap/core";
import type { DocumentVersion } from "../services/history.service";
import { getDocumentHistory, restoreDocumentVersion } from "../services/history.service";

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentId: string;
  workspaceId: string;
  shareToken?: string | null;
  documentTitle: string;
  onRestore: (content: JSONContent) => void;
}

export const HistoryModal = ({
  isOpen,
  onClose,
  documentId,
  workspaceId,
  shareToken,
  documentTitle,
  onRestore
}: HistoryModalProps) => {
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<DocumentVersion | null>(null);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);

  useEffect(() => {
    if (isOpen && documentId && workspaceId) {
      loadHistory();
    }
  }, [isOpen, documentId, workspaceId, shareToken]);

  const loadHistory = async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await getDocumentHistory(documentId, workspaceId, {
        shareToken: shareToken ?? undefined
      });
      setVersions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load history");
    } finally {
      setLoading(false);
    }
  };

  const handleRestoreClick = (version: DocumentVersion) => {
    setSelectedVersion(version);
    setShowRestoreConfirm(true);
  };

  const handleRestoreConfirm = async () => {
    if (!selectedVersion) return;

    setRestoring(true);
    setError(null);

    try {
      const result = await restoreDocumentVersion(
        documentId,
        selectedVersion.versionNumber,
        workspaceId,
        { shareToken: shareToken ?? undefined }
      );
      onRestore(result.content as JSONContent);
      setShowRestoreConfirm(false);
      setSelectedVersion(null);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to restore document");
    } finally {
      setRestoring(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  };

  const getEditorName = (version: DocumentVersion) => {
    if (version.createdBy === "system") {
      return "System";
    }
    const displayName = version.createdByName?.trim();
    return displayName || version.createdBy;
  };

  const getContentPreview = (content: Record<string, unknown>): string => {
    try {
      if (!content || typeof content !== "object") return "No content";

      const jsonContent = content as JSONContent;
      if (jsonContent.content && Array.isArray(jsonContent.content)) {
        const text = jsonContent.content
          .map((node) => {
            if (node.type === "text" && node.text) return node.text;
            if (node.content) {
              return node.content
                .map((child) => (child.type === "text" && child.text ? child.text : ""))
                .join("");
            }
            return "";
          })
          .join(" ")
          .trim();

        return text.length > 150 ? text.substring(0, 150) + "..." : text || "Empty document";
      }

      return JSON.stringify(content).substring(0, 150) + "...";
    } catch {
      return "Unable to preview content";
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="relative w-full max-w-2xl max-h-[80vh] overflow-hidden rounded-2xl bg-white dark:bg-[#1e1f3a] shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[#e7e7f3] px-6 py-4 dark:border-[#2d2e4a]">
            <div>
              <h2 className="text-xl font-bold text-[#0d0e1b] dark:text-white">
                Document History
              </h2>
              <p className="text-sm text-[#4c4d9a] dark:text-[#8a8bbd]">{documentTitle}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-[#4c4d9a] transition-colors hover:bg-[#e7e7f3] dark:text-[#8a8bbd] dark:hover:bg-[#2d2e4a]"
              aria-label="Close modal"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>

          {/* Content */}
          <div className="overflow-y-auto p-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <div className="mb-2 inline-block h-8 w-8 animate-spin rounded-full border-4 border-[#4c4d9a] border-t-transparent" />
                  <p className="text-sm text-[#4c4d9a] dark:text-[#8a8bbd]">Loading history...</p>
                </div>
              </div>
            ) : error ? (
              <div className="rounded-lg border-2 border-red-200 bg-red-50 px-4 py-3 dark:border-red-900/50 dark:bg-red-950/30">
                <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
              </div>
            ) : versions.length === 0 ? (
              <div className="py-12 text-center">
                <span className="material-symbols-outlined mb-2 text-4xl text-[#4c4d9a] dark:text-[#8a8bbd]">
                  history
                </span>
                <p className="text-sm text-[#4c4d9a] dark:text-[#8a8bbd]">
                  No version history available for this document
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {versions.map((version) => (
                  <div
                    key={version.id}
                    className="rounded-lg border border-[#e7e7f3] bg-white p-4 transition-all hover:border-primary/50 hover:shadow-md dark:border-[#2d2e4a] dark:bg-[#0b0c18]"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary">
                            v{version.versionNumber}
                          </span>
                          <span className="text-xs text-[#4c4d9a] dark:text-[#8a8bbd]">
                            {formatDate(version.createdAt)}
                          </span>
                          {version.createdBy === "system" && (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                              Auto-generated
                            </span>
                          )}
                        </div>
                        <p className="mb-1 text-xs text-[#4c4d9a] dark:text-[#8a8bbd]">
                          Saved by {getEditorName(version)} at {formatDate(version.createdAt)}
                        </p>
                        <p className="mb-2 text-sm font-medium text-[#0d0e1b] dark:text-white">
                          {version.title}
                        </p>
                        <p className="line-clamp-2 text-xs text-[#4c4d9a] dark:text-[#8a8bbd]">
                          {getContentPreview(version.content)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRestoreClick(version)}
                        className="flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-bold text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
                        disabled={restoring}
                      >
                        <span className="material-symbols-outlined !text-[16px]">restore</span>
                        Restore
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-[#e7e7f3] px-6 py-4 dark:border-[#2d2e4a]">
            <p className="text-xs text-[#4c4d9a] dark:text-[#8a8bbd]">
              Restoring a version will create a new version and replace the current content
            </p>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-bold text-[#4c4d9a] transition-colors hover:bg-[#e7e7f3] dark:text-[#8a8bbd] dark:hover:bg-[#2d2e4a]"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      {/* Restore Confirmation Modal */}
      {showRestoreConfirm && selectedVersion && (
        <>
          <div
            className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm"
            aria-hidden="true"
          />
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-[#1e1f3a]">
              <div className="mb-4 flex items-center gap-3">
                <span className="material-symbols-outlined text-3xl text-amber-500">warning</span>
                <div>
                  <h3 className="text-lg font-bold text-[#0d0e1b] dark:text-white">
                    Confirm Restore
                  </h3>
                  <p className="text-sm text-[#4c4d9a] dark:text-[#8a8bbd]">
                    This action cannot be undone
                  </p>
                </div>
              </div>

              <div className="mb-4 rounded-lg bg-[#e7e7f3] p-3 dark:bg-[#2d2e4a]">
                <p className="mb-1 text-xs font-medium text-[#4c4d9a] dark:text-[#8a8bbd]">
                  Restoring to:
                </p>
                <p className="text-sm font-bold text-[#0d0e1b] dark:text-white">
                  Version {selectedVersion.versionNumber}
                </p>
                <p className="text-xs text-[#4c4d9a] dark:text-[#8a8bbd]">
                  {formatDate(selectedVersion.createdAt)}
                </p>
              </div>

              <p className="mb-4 text-sm text-[#0d0e1b] dark:text-white">
                This will replace the current document content with the content from this version. A new
                version will be created to preserve this restore action.
              </p>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowRestoreConfirm(false)}
                  disabled={restoring}
                  className="rounded-lg px-4 py-2 text-sm font-bold text-[#4c4d9a] transition-colors hover:bg-[#e7e7f3] dark:text-[#8a8bbd] dark:hover:bg-[#2d2e4a] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleRestoreConfirm}
                  disabled={restoring}
                  className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {restoring ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      Restoring...
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined !text-[16px]">restore</span>
                      Restore Version
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
};
