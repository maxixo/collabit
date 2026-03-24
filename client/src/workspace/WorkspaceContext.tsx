import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import {
  fetchWorkspaceSummary,
  formatWorkspaceName,
  type WorkspaceSummary
} from "../services/workspace.service";

type WorkspaceContextValue = {
  workspace: WorkspaceSummary;
  isLoading: boolean;
  error: string | null;
};

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined);

export const WorkspaceProvider = ({
  workspaceId,
  children
}: {
  workspaceId: string;
  children: ReactNode;
}) => {
  const normalizedWorkspaceId = workspaceId.trim() || "default";
  const [workspace, setWorkspace] = useState<WorkspaceSummary>({
    id: normalizedWorkspaceId,
    name: formatWorkspaceName(normalizedWorkspaceId),
    membershipStatus: "member"
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    setWorkspace({
      id: normalizedWorkspaceId,
      name: formatWorkspaceName(normalizedWorkspaceId),
      membershipStatus: "member"
    });
    setIsLoading(true);
    setError(null);

    fetchWorkspaceSummary(normalizedWorkspaceId)
      .then((nextWorkspace) => {
        if (!isActive) {
          return;
        }
        setWorkspace(nextWorkspace);
      })
      .catch((fetchError) => {
        if (!isActive) {
          return;
        }
        setError(fetchError instanceof Error ? fetchError.message : "Failed to load workspace.");
      })
      .finally(() => {
        if (isActive) {
          setIsLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [normalizedWorkspaceId]);

  const value = useMemo(
    () => ({
      workspace,
      isLoading,
      error
    }),
    [workspace, isLoading, error]
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
};

export const useWorkspace = () => {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider");
  }
  return context;
};
