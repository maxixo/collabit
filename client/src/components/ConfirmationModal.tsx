interface ConfirmationModalProps {
  isOpen: boolean;
  title: string;
  description?: string;
  warning?: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "primary" | "danger";
  icon?: string;
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export const ConfirmationModal = ({
  isOpen,
  title,
  description,
  warning,
  confirmLabel,
  cancelLabel = "Cancel",
  tone = "primary",
  icon = "warning",
  confirmDisabled = false,
  onConfirm,
  onClose
}: ConfirmationModalProps) => {
  if (!isOpen) {
    return null;
  }

  const confirmClassName =
    tone === "danger"
      ? "flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-rose-500/20 transition-all hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-60"
      : "flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60";

  const iconClassName =
    tone === "danger"
      ? "flex h-10 w-10 items-center justify-center rounded-full bg-rose-100 text-rose-600 dark:bg-rose-500/10 dark:text-rose-200"
      : "flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="mx-4 w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-[#16172d]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#e7e7f3] bg-[#f8f8fc] px-6 py-4 dark:border-[#2a2b4a] dark:bg-[#1e1f3a]">
          <div className="flex items-center gap-3">
            <div className={iconClassName}>
              <span className="material-symbols-outlined">{icon}</span>
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#0d0e1b] dark:text-white">{title}</h2>
              {description ? (
                <p className="text-sm text-[#4c4d9a] dark:text-[#a1a1c9]">{description}</p>
              ) : null}
            </div>
          </div>
          <button
            className="rounded-lg p-2 text-[#4c4d9a] transition-colors hover:bg-[#e7e7f3] dark:text-[#a1a1c9] dark:hover:bg-[#2a2b4a]"
            onClick={onClose}
            type="button"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {warning ? (
          <div className="px-6 pt-4">
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-500/10 dark:text-rose-200">
              {warning}
            </div>
          </div>
        ) : null}

        <div className="flex items-center justify-end gap-3 border-t border-[#e7e7f3] bg-[#f8f8fc] px-6 py-4 dark:border-[#2a2b4a] dark:bg-[#1e1f3a]">
          <button
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-[#4c4d9a] transition-colors hover:bg-[#e7e7f3] dark:text-[#a1a1c9] dark:hover:bg-[#2a2b4a]"
            onClick={onClose}
            type="button"
          >
            {cancelLabel}
          </button>
          <button
            className={confirmClassName}
            disabled={confirmDisabled}
            onClick={onConfirm}
            type="button"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
