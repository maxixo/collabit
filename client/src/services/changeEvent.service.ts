const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

export interface ChangeEvent {
  id: string;
  documentId: string;
  userId: string;
  changeType: "insert" | "delete" | "update" | "format" | "title";
  content: Record<string, unknown>;
  position: number | null;
  createdAt: string;
  applied: boolean;
  workspaceId: string;
}

export interface CreateChangeEventInput {
  documentId: string;
  workspaceId: string;
  changeType: ChangeEvent["changeType"];
  content: Record<string, unknown>;
  position?: number | null;
}

export interface PendingChangesSummary {
  userId: string;
  changeCount: number;
  firstChange: string;
  lastChange: string;
  changeTypes: string[];
  user?: {
    id: string;
    displayName?: string;
    email?: string;
  };
}

/**
 * Create a new change event
 */
export const createChangeEvent = async (
  input: CreateChangeEventInput
): Promise<ChangeEvent> => {
  const response = await fetch(`${API_BASE_URL}/change-events`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${localStorage.getItem("auth_token")}`
    },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    throw new Error(`Failed to create change event: ${response.statusText}`);
  }

  return response.json();
};

/**
 * Fetch pending changes for a document
 */
export const getPendingChanges = async (
  documentId: string,
  workspaceId: string
): Promise<PendingChangesSummary[]> => {
  const response = await fetch(
    `${API_BASE_URL}/documents/${documentId}/pending-changes?workspaceId=${workspaceId}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("auth_token")}`
      }
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch pending changes: ${response.statusText}`);
  }

  const data = await response.json();
  return data.pendingChanges;
};

/**
 * Save document with pending changes
 */
export const saveDocument = async (
  documentId: string,
  workspaceId: string,
  options: {
    applyPendingChanges: boolean;
    specificUserChanges?: string[];
  }
): Promise<{ success: boolean; message: string; appliedChanges?: number }> => {
  const response = await fetch(
    `${API_BASE_URL}/documents/${documentId}/save?workspaceId=${workspaceId}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("auth_token")}`
      },
      body: JSON.stringify(options)
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to save document: ${response.statusText}`);
  }

  return response.json();
};

/**
 * Track editor changes for offline/eventual consistency
 */
export class ChangeEventTracker {
  private documentId: string;
  private workspaceId: string;
  private pendingEvents: ChangeEvent[] = [];
  private flushTimer: number | null = null;
  private isOffline: boolean = false;

  constructor(documentId: string, workspaceId: string) {
    this.documentId = documentId;
    this.workspaceId = workspaceId;

    // Listen for online/offline status
    window.addEventListener("online", this.handleOnline);
    window.addEventListener("offline", this.handleOffline);
  }

  /**
   * Track a change event
   */
  async trackChange(
    changeType: ChangeEvent["changeType"],
    content: Record<string, unknown>,
    position?: number | null
  ): Promise<void> {
    if (this.isOffline) {
      // Queue for later when online
      this.queueChange(changeType, content, position);
      return;
    }

    try {
      await createChangeEvent({
        documentId: this.documentId,
        workspaceId: this.workspaceId,
        changeType,
        content,
        position
      });
    } catch (error) {
      console.error("Failed to track change:", error);
      // Queue for retry
      this.queueChange(changeType, content, position);
    }
  }

  /**
   * Queue a change for later transmission
   */
  private queueChange(
    changeType: ChangeEvent["changeType"],
    content: Record<string, unknown>,
    position?: number | null
  ): void {
    const event: ChangeEvent = {
      id: crypto.randomUUID(),
      documentId: this.documentId,
      userId: localStorage.getItem("user_id") || "unknown",
      changeType,
      content,
      position: position ?? null,
      createdAt: new Date().toISOString(),
      applied: false,
      workspaceId: this.workspaceId
    };

    this.pendingEvents.push(event);

    // Set up auto-flush when online
    if (!this.flushTimer) {
      this.flushTimer = window.setInterval(() => this.flushPending(), 30000); // 30 seconds
    }
  }

  /**
   * Flush pending changes to server
   */
  private async flushPending(): Promise<void> {
    if (this.pendingEvents.length === 0 || this.isOffline) {
      return;
    }

    const eventsToFlush = [...this.pendingEvents];
    this.pendingEvents = [];

    for (const event of eventsToFlush) {
      try {
        await createChangeEvent({
          documentId: this.documentId,
          workspaceId: this.workspaceId,
          changeType: event.changeType,
          content: event.content,
          position: event.position
        });
      } catch (error) {
        console.error("Failed to flush change:", error);
        // Re-queue for later
        this.pendingEvents.push(event);
      }
    }

    if (this.pendingEvents.length === 0 && this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /**
   * Handle online status
   */
  private handleOnline = (): void => {
    this.isOffline = false;
    this.flushPending();
  };

  /**
   * Handle offline status
   */
  private handleOffline = (): void => {
    this.isOffline = true;
  };

  /**
   * Get pending events count
   */
  getPendingCount(): number {
    return this.pendingEvents.length;
  }

  /**
   * Cleanup
   */
  destroy(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    window.removeEventListener("online", this.handleOnline);
    window.removeEventListener("offline", this.handleOffline);
  }
}
