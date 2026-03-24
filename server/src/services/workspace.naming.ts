export const formatWorkspaceDisplayName = (workspaceId: string) => {
  const trimmed = workspaceId.trim();
  if (!trimmed || trimmed === "default") {
    return "Shared workspace";
  }

  return trimmed
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};
