import type { JSONContent } from "@tiptap/core";

interface ConflictModalProps {
  isOpen: boolean;
  localVersion: JSONContent;
  serverVersion: JSONContent;
  documentTitle: string;
  onKeepLocalCopy: () => void;
  onUseServer: () => void;
  onDownloadLocal: () => void;
  onClose: () => void;
}

type PreviewTextNode = {
  text?: string;
};

type PreviewParagraphNode = {
  type?: string;
  content?: PreviewTextNode[];
};

const formatDate = (date: Date) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);

const getContentPreview = (content: JSONContent) => {
  if (!content || !content.content) {
    return "Empty document";
  }

  const text = content.content
    .filter(
      (node): node is PreviewParagraphNode =>
        typeof node === "object" &&
        node !== null &&
        (node as { type?: unknown }).type === "paragraph"
    )
    .map((node) => node.content?.map((textNode) => textNode.text ?? "").join(" ") ?? "")
    .join("\n")
    .substring(0, 200);

  return text || "Empty document";
};

export const ConflictModal = ({
  isOpen,
  localVersion,
  serverVersion,
  documentTitle,
  onKeepLocalCopy,
  onUseServer,
  onDownloadLocal,
  onClose
}: ConflictModalProps) => {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-[#16172d]">
        <div className="flex items-center justify-between border-b border-[#e7e7f3] bg-[#f8f8fc] px-6 py-4 dark:border-[#2a2b4a] dark:bg-[#1e1f3a]">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-600">
              <span className="!text-xl">!</span>
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#0d0e1b] dark:text-white">Conflict Detected</h2>
              <p className="text-sm text-[#4c4d9a] dark:text-[#a1a1c9]">
                "{documentTitle}" has local edits that no longer match the latest server state.
              </p>
            </div>
          </div>
          <button
            className="rounded-lg p-2 text-[#4c4d9a] transition-colors hover:bg-[#e7e7f3] dark:text-[#a1a1c9] dark:hover:bg-[#2a2b4a]"
            onClick={onClose}
            type="button"
            aria-label="Close conflict dialog"
          >
            x
          </button>
        </div>

        <div className="p-6">
          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-500/10 dark:text-amber-100">
            Choose a safe fallback. You can preserve your local work as a separate copy, download it before discarding it, or reload the latest server version.
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-primary"></div>
                <h3 className="text-base font-semibold text-[#0d0e1b] dark:text-white">
                  Your Local Copy
                </h3>
                <span className="text-xs text-[#4c4d9a] dark:text-[#a1a1c9]">(unsynced)</span>
              </div>
              <div className="rounded-lg border border-[#e7e7f3] bg-[#f8f8fc] p-4 dark:border-[#2a2b4a] dark:bg-[#1e1f3a]">
                <pre className="whitespace-pre-wrap text-sm text-[#4c4d9a] dark:text-[#a1a1c9]">
                  {getContentPreview(localVersion)}
                </pre>
              </div>
              <p className="text-xs text-[#4c4d9a] dark:text-[#a1a1c9]">
                Last edited: {formatDate(new Date())}
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-amber-500"></div>
                <h3 className="text-base font-semibold text-[#0d0e1b] dark:text-white">
                  Server Version
                </h3>
                <span className="text-xs text-[#4c4d9a] dark:text-[#a1a1c9]">(latest remote state)</span>
              </div>
              <div className="rounded-lg border border-[#e7e7f3] bg-[#f8f8fc] p-4 dark:border-[#2a2b4a] dark:bg-[#1e1f3a]">
                <pre className="whitespace-pre-wrap text-sm text-[#4c4d9a] dark:text-[#a1a1c9]">
                  {getContentPreview(serverVersion)}
                </pre>
              </div>
              <p className="text-xs text-[#4c4d9a] dark:text-[#a1a1c9]">
                Last updated: {formatDate(new Date())}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[#e7e7f3] bg-[#f8f8fc] px-6 py-4 dark:border-[#2a2b4a] dark:bg-[#1e1f3a]">
          <button
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-[#4c4d9a] transition-colors hover:bg-[#e7e7f3] dark:text-[#a1a1c9] dark:hover:bg-[#2a2b4a]"
            onClick={onDownloadLocal}
            type="button"
          >
            Download Local Copy
          </button>
          <button
            className="flex items-center gap-2 rounded-lg border border-[#e7e7f3] px-4 py-2 text-sm font-semibold text-[#4c4d9a] transition-colors hover:bg-[#e7e7f3] dark:border-[#2a2b4a] dark:text-[#a1a1c9] dark:hover:bg-[#2a2b4a]"
            onClick={onUseServer}
            type="button"
          >
            Reload Server Version
          </button>
          <button
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-primary/20 transition-all hover:bg-primary/90"
            onClick={onKeepLocalCopy}
            type="button"
          >
            Duplicate Local Copy
          </button>
        </div>
      </div>
    </div>
  );
};
