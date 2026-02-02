import { useCallback, useEffect, useMemo, useState } from "react";
import type { ShareToken } from "@shared/types";
import {
  generateShareToken,
  getShareTokens,
  revokeShareToken
} from "../services/share.service";

interface ShareModalProps {
  documentId: string;
  workspaceId: string;
  onClose: () => void;
  onTokenRevoked?: () => void;
}

type ExpirationOption = "never" | "7d" | "30d" | "custom";
type MaxUsesOption = "unlimited" | "10" | "50" | "100" | "custom";
type SharePermissionOption = "viewer" | "editor";

const formatPermission = (permission: ShareToken["permissionLevel"]) => {
  if (!permission) {
    return "Viewer";
  }
  return `${permission.charAt(0).toUpperCase()}${permission.slice(1)}`;
};

const formatExpiration = (value: string | null) => {
  if (!value) {
    return "Never";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Invalid date";
  }
  return date.toLocaleDateString();
};

export const ShareModal = ({ documentId, workspaceId, onClose, onTokenRevoked }: ShareModalProps) => {
  const [permission, setPermission] = useState<SharePermissionOption>("viewer");
  const [expirationOption, setExpirationOption] = useState<ExpirationOption>("never");
  const [customExpiration, setCustomExpiration] = useState("");
  const [maxUsesOption, setMaxUsesOption] = useState<MaxUsesOption>("unlimited");
  const [customMaxUses, setCustomMaxUses] = useState("");
  const [generatedToken, setGeneratedToken] = useState<ShareToken | null>(null);
  const [activeTokens, setActiveTokens] = useState<ShareToken[]>([]);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoadingTokens, setIsLoadingTokens] = useState(false);
  const [revokingToken, setRevokingToken] = useState<string | null>(null);

  const normalizedWorkspaceId = workspaceId?.trim() || "default";

  const buildShareLink = useCallback(
    (token: string) => {
      const params = new URLSearchParams();
      params.set("share", "true");
      params.set("collab", "true");
      params.set("token", token);
      params.set("workspaceId", normalizedWorkspaceId);
      return `${window.location.origin}/editor/${encodeURIComponent(documentId)}?${params.toString()}`;
    },
    [documentId, normalizedWorkspaceId]
  );

  const generatedLink = useMemo(
    () => (generatedToken ? buildShareLink(generatedToken.token) : ""),
    [buildShareLink, generatedToken]
  );

  const resolveExpiration = () => {
    if (expirationOption === "never") {
      return null;
    }
    if (expirationOption === "7d") {
      const date = new Date();
      date.setDate(date.getDate() + 7);
      return date.toISOString();
    }
    if (expirationOption === "30d") {
      const date = new Date();
      date.setDate(date.getDate() + 30);
      return date.toISOString();
    }
    if (expirationOption === "custom") {
      if (!customExpiration) {
        return null;
      }
      const date = new Date(customExpiration);
      if (Number.isNaN(date.getTime())) {
        return null;
      }
      return date.toISOString();
    }
    return null;
  };

  const resolveMaxUses = () => {
    if (maxUsesOption === "unlimited") {
      return null;
    }
    if (maxUsesOption === "custom") {
      const parsed = Number(customMaxUses);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        return null;
      }
      return parsed;
    }
    const parsed = Number(maxUsesOption);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  };

  const refreshTokens = useCallback(async () => {
    setIsLoadingTokens(true);
    setErrorMessage(null);
    try {
      const tokens = await getShareTokens(documentId, normalizedWorkspaceId);
      setActiveTokens(tokens);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load share links");
    } finally {
      setIsLoadingTokens(false);
    }
  }, [documentId, normalizedWorkspaceId]);

  useEffect(() => {
    setGeneratedToken(null);
    setCopiedToken(null);
    setErrorMessage(null);
  }, [documentId]);

  useEffect(() => {
    void refreshTokens();
  }, [refreshTokens]);

  const handleCopy = async (token: string) => {
    try {
      await navigator.clipboard.writeText(buildShareLink(token));
      setCopiedToken(token);
      window.setTimeout(() => setCopiedToken(null), 2000);
    } catch {
      setCopiedToken(null);
    }
  };

  const handleGenerate = async () => {
    if (isGenerating) {
      return;
    }
    setErrorMessage(null);

    const expiration = resolveExpiration();
    if (expirationOption === "custom" && !expiration) {
      setErrorMessage("Select a valid expiration date.");
      return;
    }

    const maxUses = resolveMaxUses();
    if (maxUsesOption === "custom" && maxUses === null) {
      setErrorMessage("Enter a valid max uses value.");
      return;
    }

    setIsGenerating(true);
    try {
      const shareToken = await generateShareToken(documentId, {
        workspaceId: normalizedWorkspaceId,
        permission,
        expiration,
        maxUses
      });
      setGeneratedToken(shareToken);
      setCopiedToken(null);
      await refreshTokens();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to generate share link");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRevoke = async (token: string) => {
    if (revokingToken) {
      return;
    }
    setErrorMessage(null);
    setRevokingToken(token);
    try {
      await revokeShareToken(token, normalizedWorkspaceId);
      if (generatedToken?.token === token) {
        setGeneratedToken(null);
      }
      await refreshTokens();
      // Notify parent component to clean up collaboration state
      onTokenRevoked?.();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to revoke share link");
    } finally {
      setRevokingToken(null);
    }
  };

  const minCustomDate = useMemo(() => {
    const today = new Date();
    const local = new Date(today.getTime() - today.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-w-xl w-full mx-4 bg-white dark:bg-[#16172d] rounded-2xl shadow-2xl overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#e7e7f3] bg-[#f8f8fc] px-6 py-4 dark:border-[#2a2b4a] dark:bg-[#1e1f3a]">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <span className="material-symbols-outlined">share</span>
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#0d0e1b] dark:text-white">Share this document</h2>
              <p className="text-sm text-[#4c4d9a] dark:text-[#a1a1c9]">
                Invite collaborators with a share link.
              </p>
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

        <div className="p-6">
          <div className="space-y-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[#4c4d9a] dark:text-[#a1a1c9]">
                Share settings
              </p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-2 text-sm font-medium text-[#0d0e1b] dark:text-[#f8f8fc]">
                  Permission level
                  <select
                    className="h-11 w-full rounded-lg border border-[#e7e7f3] bg-white px-3 text-sm text-[#0d0e1b] shadow-sm focus:border-primary/50 focus:outline-none dark:border-[#2a2b4a] dark:bg-[#0f1024] dark:text-[#f8f8fc]"
                    value={permission}
                    onChange={(event) => setPermission(event.target.value as SharePermissionOption)}
                  >
                    <option value="viewer">Viewer (read-only)</option>
                    <option value="editor">Editor (can edit)</option>
                  </select>
                </label>

                <label className="flex flex-col gap-2 text-sm font-medium text-[#0d0e1b] dark:text-[#f8f8fc]">
                  Expiration
                  <select
                    className="h-11 w-full rounded-lg border border-[#e7e7f3] bg-white px-3 text-sm text-[#0d0e1b] shadow-sm focus:border-primary/50 focus:outline-none dark:border-[#2a2b4a] dark:bg-[#0f1024] dark:text-[#f8f8fc]"
                    value={expirationOption}
                    onChange={(event) => setExpirationOption(event.target.value as ExpirationOption)}
                  >
                    <option value="never">Never</option>
                    <option value="7d">7 days</option>
                    <option value="30d">30 days</option>
                    <option value="custom">Custom</option>
                  </select>
                </label>

                {expirationOption === "custom" && (
                  <label className="flex flex-col gap-2 text-sm font-medium text-[#0d0e1b] dark:text-[#f8f8fc]">
                    Custom expiration
                    <input
                      className="h-11 w-full rounded-lg border border-[#e7e7f3] bg-white px-3 text-sm text-[#0d0e1b] shadow-sm focus:border-primary/50 focus:outline-none dark:border-[#2a2b4a] dark:bg-[#0f1024] dark:text-[#f8f8fc]"
                      type="date"
                      min={minCustomDate}
                      value={customExpiration}
                      onChange={(event) => setCustomExpiration(event.target.value)}
                    />
                  </label>
                )}

                <label className="flex flex-col gap-2 text-sm font-medium text-[#0d0e1b] dark:text-[#f8f8fc]">
                  Max uses
                  <select
                    className="h-11 w-full rounded-lg border border-[#e7e7f3] bg-white px-3 text-sm text-[#0d0e1b] shadow-sm focus:border-primary/50 focus:outline-none dark:border-[#2a2b4a] dark:bg-[#0f1024] dark:text-[#f8f8fc]"
                    value={maxUsesOption}
                    onChange={(event) => setMaxUsesOption(event.target.value as MaxUsesOption)}
                  >
                    <option value="unlimited">Unlimited</option>
                    <option value="10">10 uses</option>
                    <option value="50">50 uses</option>
                    <option value="100">100 uses</option>
                    <option value="custom">Custom</option>
                  </select>
                </label>

                {maxUsesOption === "custom" && (
                  <label className="flex flex-col gap-2 text-sm font-medium text-[#0d0e1b] dark:text-[#f8f8fc]">
                    Custom max uses
                    <input
                      className="h-11 w-full rounded-lg border border-[#e7e7f3] bg-white px-3 text-sm text-[#0d0e1b] shadow-sm focus:border-primary/50 focus:outline-none dark:border-[#2a2b4a] dark:bg-[#0f1024] dark:text-[#f8f8fc]"
                      type="number"
                      min={1}
                      value={customMaxUses}
                      onChange={(event) => setCustomMaxUses(event.target.value)}
                    />
                  </label>
                )}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  className="flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
                  onClick={handleGenerate}
                  type="button"
                  disabled={isGenerating}
                >
                  <span className="material-symbols-outlined !text-[18px]">
                    {isGenerating ? "hourglass_top" : "link"}
                  </span>
                  <span>{isGenerating ? "Generating..." : "Generate link"}</span>
                </button>
                {errorMessage ? (
                  <p className="text-xs text-red-500">{errorMessage}</p>
                ) : null}
              </div>
            </div>

            {generatedToken ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[#4c4d9a] dark:text-[#a1a1c9]">
                  Generated link
                </p>
                <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <input
                    className="h-11 w-full rounded-lg border border-[#e7e7f3] bg-white px-3 text-sm text-[#0d0e1b] shadow-sm focus:border-primary/50 focus:outline-none dark:border-[#2a2b4a] dark:bg-[#0f1024] dark:text-[#f8f8fc]"
                    readOnly
                    type="text"
                    value={generatedLink}
                    onFocus={(event) => event.target.select()}
                  />
                  <button
                    className="flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 sm:w-36"
                    onClick={() => handleCopy(generatedToken.token)}
                    type="button"
                  >
                    <span className="material-symbols-outlined !text-[18px]">
                      {copiedToken === generatedToken.token ? "check" : "content_copy"}
                    </span>
                    <span>{copiedToken === generatedToken.token ? "Copied" : "Copy link"}</span>
                  </button>
                </div>
                <p className="mt-3 text-xs text-[#4c4d9a] dark:text-[#a1a1c9]">
                  Anyone with this link can join in collaboration mode.
                </p>
              </div>
            ) : null}

            <div>
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#4c4d9a] dark:text-[#a1a1c9]">
                  Active share links
                </p>
                <button
                  className="text-xs font-semibold text-primary transition-colors hover:text-primary/80 disabled:cursor-not-allowed disabled:opacity-60"
                  type="button"
                  onClick={refreshTokens}
                  disabled={isLoadingTokens}
                >
                  {isLoadingTokens ? "Refreshing..." : "Refresh"}
                </button>
              </div>

              <div className="mt-3 space-y-3">
                {isLoadingTokens ? (
                  <p className="text-xs text-[#4c4d9a] dark:text-[#a1a1c9]">
                    Loading active share links...
                  </p>
                ) : activeTokens.length === 0 ? (
                  <p className="text-xs text-[#4c4d9a] dark:text-[#a1a1c9]">
                    No active share links yet.
                  </p>
                ) : (
                  activeTokens.map((token) => {
                    const link = buildShareLink(token.token);
                    const maxUsesLabel = token.maxUses ? `${token.useCount} / ${token.maxUses}` : `${token.useCount} / unlimited`;
                    return (
                      <div
                        key={token.id}
                        className="rounded-xl border border-[#e7e7f3] bg-white/70 p-4 shadow-sm dark:border-[#2a2b4a] dark:bg-[#0f1024]"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="space-y-1">
                            <p className="text-sm font-semibold text-[#0d0e1b] dark:text-[#f8f8fc]">
                              {formatPermission(token.permissionLevel)} access
                            </p>
                            <p className="text-xs text-[#4c4d9a] dark:text-[#a1a1c9]">
                              Expires: {formatExpiration(token.expirationDate)}
                            </p>
                            <p className="text-xs text-[#4c4d9a] dark:text-[#a1a1c9]">
                              Uses: {maxUsesLabel}
                            </p>
                          </div>
                          <button
                            className="flex h-9 items-center justify-center gap-2 rounded-lg border border-[#e7e7f3] bg-white px-3 text-xs font-semibold text-[#d14b4b] transition-colors hover:border-[#d14b4b]/40 hover:bg-[#fff5f5] disabled:cursor-not-allowed disabled:opacity-70 dark:border-[#2a2b4a] dark:bg-[#0f1024] dark:text-[#ff9b9b] dark:hover:bg-[#1b1b2f]"
                            type="button"
                            onClick={() => handleRevoke(token.token)}
                            disabled={revokingToken === token.token}
                          >
                            <span className="material-symbols-outlined !text-[16px]">delete</span>
                            <span>{revokingToken === token.token ? "Revoking..." : "Revoke link"}</span>
                          </button>
                        </div>
                        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                          <input
                            className="h-10 w-full rounded-lg border border-[#e7e7f3] bg-white px-3 text-xs text-[#0d0e1b] shadow-sm focus:border-primary/50 focus:outline-none dark:border-[#2a2b4a] dark:bg-[#0f1024] dark:text-[#f8f8fc]"
                            readOnly
                            type="text"
                            value={link}
                            onFocus={(event) => event.target.select()}
                          />
                          <button
                            className="flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-3 text-xs font-semibold text-white shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 sm:w-28"
                            onClick={() => handleCopy(token.token)}
                            type="button"
                          >
                            <span className="material-symbols-outlined !text-[16px]">
                              {copiedToken === token.token ? "check" : "content_copy"}
                            </span>
                            <span>{copiedToken === token.token ? "Copied" : "Copy"}</span>
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-[#e7e7f3] bg-[#f8f8fc] px-6 py-4 dark:border-[#2a2b4a] dark:bg-[#1e1f3a]">
          <button
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-[#4c4d9a] transition-colors hover:bg-[#e7e7f3] dark:text-[#a1a1c9] dark:hover:bg-[#2a2b4a]"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
