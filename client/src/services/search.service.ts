import type { DocumentDetail, DocumentSummary } from "./document.service";
import { fetchDocumentById, fetchDocuments } from "./document.service";
import { indexDocument, searchDocumentsLocal, type SearchResult } from "../offline/searchIndex";
import { getOfflineAccount, isCurrentAccount, subscribeToAccountChange } from "../offline/accountScope";

const hydratedWorkspaces = new Set<string>();
subscribeToAccountChange(() => hydratedWorkspaces.clear());

const hydrateWorkspaceIndex = async (workspaceId: string, documents: DocumentSummary[]) => {
  const account = getOfflineAccount();
  const detailResults = await Promise.all(
    documents.map(async (doc) => {
      try {
        return await fetchDocumentById(doc.id, workspaceId);
      } catch {
        return null;
      }
    })
  );

  const details = detailResults.filter(Boolean) as DocumentDetail[];
  if (!isCurrentAccount(account)) return;
  await Promise.all(details.map((doc) => indexDocument(doc)));
};

export const searchDocumentsWithFallback = async (
  workspaceId: string,
  query: string
): Promise<{ results: SearchResult[]; source: "local" | "remote" }> => {
  const account = getOfflineAccount();
  const localResults = await searchDocumentsLocal(workspaceId, query);
  if (!isCurrentAccount(account)) return { results: [], source: "local" };
  if (localResults.length > 0) {
    return { results: localResults, source: "local" };
  }

  if (!hydratedWorkspaces.has(workspaceId)) {
    try {
      const documents = await fetchDocuments(workspaceId);
      if (documents.length > 0) {
        await hydrateWorkspaceIndex(workspaceId, documents);
      }
      if (!isCurrentAccount(account)) return { results: [], source: "local" };
      hydratedWorkspaces.add(workspaceId);
    } catch {
      // Ignore remote failures; return local results below.
    }
  }

  const remoteResults = await searchDocumentsLocal(workspaceId, query);
  return { results: remoteResults, source: "remote" };
};
