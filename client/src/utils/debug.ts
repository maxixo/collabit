/**
 * Debug utilities for real-time collaboration
 * Provides console commands for inspecting collaboration state
 */

import { getYjsProvider, getPendingChangeCount } from "../collaboration/yjsProvider";
import { getDocumentHistory } from "../services/history.service";
import { getPendingChanges } from "../services/changeEvent.service";

/**
 * Debug command: Inspect Y.js document state
 */
const inspectYjsDoc = (documentId: string) => {
  console.group(`🔍 Y.js Document Inspection: ${documentId}`);
  
  try {
    const provider = (getYjsProvider as any)().providers?.get?.(documentId);
    if (!provider) {
      console.warn("No provider found for this document");
      console.groupEnd();
      return;
    }

    console.log("Connection Status:", provider.isConnected() ? "✅ Connected" : "❌ Disconnected");
    console.log("Document:", provider.doc);
    console.log("Content Fragment:", provider.doc.getXmlFragment("content").toJSON());
    console.log("Awareness State:", Array.from(provider.awareness.getStates().entries()));
    console.log("Pending Changes:", provider.getPendingChangeCount?.() ?? "N/A");
    console.log("RefCount:", provider.refCount);
  } catch (error) {
    console.error("Error inspecting Y.js document:", error);
  }
  
  console.groupEnd();
};

/**
 * Debug command: View pending changes details
 */
const viewPendingChanges = async (documentId: string, workspaceId: string) => {
  console.group(`📝 Pending Changes: ${documentId}`);
  
  try {
    const pending = await getPendingChanges(documentId, workspaceId);
    const clientPending = getPendingChangeCount(documentId);
    
    console.log("Server Pending Changes:", pending);
    console.log("Client Pending Changes:", clientPending);
    console.log("Total Users with Changes:", pending.length);
    
    pending.forEach((change, index) => {
      console.log(`User ${index + 1}:`, {
        userId: change.userId,
        changeCount: change.changeCount,
        firstChange: change.firstChange,
        lastChange: change.lastChange,
        changeTypes: change.changeTypes
      });
    });
  } catch (error) {
    console.error("Error fetching pending changes:", error);
  }
  
  console.groupEnd();
};

/**
 * Debug command: View document version history
 */
const viewVersionHistory = async (documentId: string, workspaceId: string) => {
  console.group(`📜 Version History: ${documentId}`);
  
  try {
    const versions = await getDocumentHistory(documentId, workspaceId);
    console.log(`Total Versions: ${versions.length}`);
    
    versions.forEach((version, index) => {
      console.log(`Version ${index + 1}:`, {
        id: version.id,
        versionNumber: version.versionNumber,
        title: version.title,
        createdBy: version.createdBy,
        createdAt: version.createdAt,
        contentPreview: JSON.stringify(version.content).substring(0, 100) + "..."
      });
    });
  } catch (error) {
    console.error("Error fetching version history:", error);
  }
  
  console.groupEnd();
};

/**
 * Debug command: Force Y.js sync
 */
const forceYjsSync = (documentId: string) => {
  console.group(`🔄 Force Sync: ${documentId}`);
  
  try {
    const provider = (getYjsProvider as any)().providers?.get?.(documentId);
    if (!provider) {
      console.warn("No provider found for this document");
      console.groupEnd();
      return;
    }

    // Disconnect and reconnect to force sync
    provider.disconnect();
    setTimeout(() => {
      provider.connect();
      console.log("Forced reconnection - check logs for sync status");
    }, 1000);
  } catch (error) {
    console.error("Error forcing sync:", error);
  }
  
  console.groupEnd();
};

/**
 * Debug command: Reset provider for document
 */
const resetProviderDebug = (documentId: string) => {
  console.group(`🔧 Reset Provider: ${documentId}`);
  
  try {
    const { resetProvider } = (window as any).resetProvider;
    if (typeof resetProvider === 'function') {
      resetProvider(documentId);
      console.log("Provider reset successfully");
    } else {
      console.warn("resetProvider not available on window");
    }
  } catch (error) {
    console.error("Error resetting provider:", error);
  }
  
  console.groupEnd();
};

/**
 * Debug command: Run full diagnostics
 */
const runDiagnostics = async (documentId: string, workspaceId: string) => {
  console.group(`🩺 Full Diagnostics: ${documentId}`);
  console.log("Timestamp:", new Date().toISOString());
  console.log("User Agent:", navigator.userAgent);
  console.log("Online Status:", navigator.onLine ? "Online" : "Offline");
  
  inspectYjsDoc(documentId);
  await viewPendingChanges(documentId, workspaceId);
  await viewVersionHistory(documentId, workspaceId);
  
  console.groupEnd();
};

/**
 * Register debug commands on window object
 */
export const registerDebugCommands = () => {
  (window as any).debugCollab = {
    inspectYjsDoc,
    viewPendingChanges,
    viewVersionHistory,
    forceYjsSync,
    resetProvider: resetProviderDebug,
    runDiagnostics,
    
    // Helper: List all documents with providers
    listDocuments: () => {
      const providers = (getYjsProvider as any)().providers;
      if (!providers) {
        console.log("No providers registered");
        return;
      }
      console.log("Active Documents:", Array.from(providers.keys()));
    }
  };
  
  console.log("🐛 Debug commands available on window.debugCollab");
  console.log("  - debugCollab.inspectYjsDoc(documentId)");
  console.log("  - debugCollab.viewPendingChanges(documentId, workspaceId)");
  console.log("  - debugCollab.viewVersionHistory(documentId, workspaceId)");
  console.log("  - debugCollab.forceYjsSync(documentId)");
  console.log("  - debugCollab.resetProvider(documentId)");
  console.log("  - debugCollab.runDiagnostics(documentId, workspaceId)");
  console.log("  - debugCollab.listDocuments()");
};

/**
 * Remove debug commands from window object
 */
export const unregisterDebugCommands = () => {
  delete (window as any).debugCollab;
  console.log("Debug commands removed");
};