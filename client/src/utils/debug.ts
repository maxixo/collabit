import { getPendingChangeCount, getRegisteredProviders, resetProvider } from "../collaboration/yjsProvider";
import { getQueuedDocumentUpdate } from "../offline/documentQueue";
import { getDocumentHistory } from "../services/history.service";

const inspectYjsDoc = async (documentId: string) => {
  console.group(`Yjs document: ${documentId}`);

  try {
    const provider = getRegisteredProviders().get(documentId);
    if (!provider) {
      console.warn("No provider found for this document.");
      console.groupEnd();
      return;
    }

    console.log("Connected:", provider.isConnected());
    console.log("Awareness:", Array.from(provider.awareness.getStates().entries()));
    console.log("Content:", provider.doc.getXmlFragment("content").toJSON());
    console.log("Queued changes:", getPendingChangeCount(documentId));
    console.log("Queued draft:", await getQueuedDocumentUpdate(documentId));
  } catch (error) {
    console.error("Failed to inspect document:", error);
  }

  console.groupEnd();
};

const viewVersionHistory = async (documentId: string, workspaceId: string) => {
  console.group(`Version history: ${documentId}`);

  try {
    const versions = await getDocumentHistory(documentId, workspaceId);
    console.log("Versions:", versions);
  } catch (error) {
    console.error("Failed to load history:", error);
  }

  console.groupEnd();
};

const forceYjsSync = (documentId: string) => {
  console.group(`Force sync: ${documentId}`);

  try {
    const provider = getRegisteredProviders().get(documentId);
    if (!provider) {
      console.warn("No provider found for this document.");
      console.groupEnd();
      return;
    }

    provider.disconnect();
    window.setTimeout(() => {
      provider.connect();
      console.log("Reconnected provider.");
    }, 1000);
  } catch (error) {
    console.error("Failed to force sync:", error);
  }

  console.groupEnd();
};

export const registerDebugCommands = () => {
  (window as Window & { debugCollab?: Record<string, unknown> }).debugCollab = {
    inspectYjsDoc,
    viewVersionHistory,
    forceYjsSync,
    resetProvider,
    listDocuments: () => {
      console.log("Active documents:", Array.from(getRegisteredProviders().keys()));
    }
  };
};

export const unregisterDebugCommands = () => {
  delete (window as Window & { debugCollab?: Record<string, unknown> }).debugCollab;
};
