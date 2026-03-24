export interface WorkspaceSummary {
  id: string;
  name: string;
  membershipStatus: "owner" | "member" | "guest";
}

const API_BASE_URL = import.meta.env?.VITE_API_BASE_URL ?? "http://localhost:4000";

const parseJson = async <T>(response: Response): Promise<T> => {
  const data = (await response.json()) as T;
  if (!response.ok) {
    const message = (data as { message?: string }).message ?? "Workspace request failed";
    throw new Error(message);
  }
  return data;
};

export const formatWorkspaceName = (workspaceId: string) => {
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

export const fetchWorkspaceSummary = async (workspaceId: string): Promise<WorkspaceSummary> => {
  const response = await fetch(
    `${API_BASE_URL}/api/workspaces/${encodeURIComponent(workspaceId)}`,
    {
      credentials: "include"
    }
  );

  const data = await parseJson<{ workspace: WorkspaceSummary }>(response);
  if (data.workspace) {
    return data.workspace;
  }

  return {
    id: workspaceId,
    name: formatWorkspaceName(workspaceId),
    membershipStatus: "member"
  };
};
