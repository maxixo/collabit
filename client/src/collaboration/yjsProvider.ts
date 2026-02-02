import { Awareness } from "y-protocols/awareness";
import * as Y from "yjs";
import { WebsocketProvider as YWebsocketProvider } from "y-websocket";
import { ChangeEventTracker, type ChangeEvent } from "../services/changeEvent.service";

export interface YjsProvider {
  doc: Y.Doc;
  awareness: Awareness;
  connect: () => void;
  disconnect: () => void;
  destroy: () => void;
  isConnected: () => boolean;
}

interface WebSocketYjsProviderOptions {
  token?: string;
  userId?: string;
  userName?: string;
  userImage?: string;
  workspaceId?: string;
  enableChangeTracking?: boolean;
}

class WebSocketYjsProvider implements YjsProvider {
  doc: Y.Doc;
  awareness: Awareness;
  private provider: YWebsocketProvider | null = null;
  private readonly documentId: string;
  private readonly token?: string;
  private readonly userId?: string;
  private readonly userName?: string;
  private readonly userImage?: string;
  private readonly workspaceId?: string;
  private readonly enableChangeTracking: boolean;
  private refCount = 1;
  private changeTracker: ChangeEventTracker | null = null;

  constructor(documentId: string, options: WebSocketYjsProviderOptions = {}) {
    this.documentId = documentId;
    this.token = options.token;
    this.userId = options.userId;
    this.userName = options.userName;
    this.userImage = options.userImage;
    this.workspaceId = options.workspaceId;
    this.enableChangeTracking = options.enableChangeTracking ?? true;

    this.doc = new Y.Doc();
    // Ensure the collaboration fragment exists for TipTap bindings.
    this.doc.getXmlFragment("content");
    this.awareness = new Awareness(this.doc);
    
    // Initialize change tracking if enabled
    if (this.enableChangeTracking && this.workspaceId) {
      this.changeTracker = new ChangeEventTracker(documentId, this.workspaceId);
    }
  }

  connect(): void {
    if (this.provider) {
      // Provider already exists, just connect
      return;
    }

    // Get WebSocket URL from environment
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = import.meta.env.VITE_WS_URL || `${wsProtocol}//${window.location.host}/ws`;

    // Create y-websocket provider
    // The URL will be /ws?documentId=xxx&token=xxx
    const url = new URL(wsHost);
    url.searchParams.append('documentId', this.documentId);
    if (this.token) {
      url.searchParams.append('token', this.token);
    }

    this.provider = new YWebsocketProvider(
      url.toString(),
      this.documentId,
      this.doc,
      {
        awareness: this.awareness,
        connect: true
      }
    );

    // Set local user state in awareness
    if (this.userId) {
      this.awareness.setLocalStateField('user', {
        name: this.userName || 'Anonymous',
        color: this.getUserColor(this.userId),
        image: this.userImage
      });
    }

    // Log connection status
    this.provider.on('status', (event: { status: "connected" | "disconnected" | "connecting" }) => {
      console.log(`[YjsProvider] ${this.documentId} status: ${event.status}`);
    });

    this.provider.on('sync', (synced: boolean) => {
      console.log(`[YjsProvider] ${this.documentId} synced: ${synced}`);
    });

    this.provider.on('connection-error', (event: Event, provider: YWebsocketProvider) => {
      console.error(`[YjsProvider] ${this.documentId} connection error:`, event);
    });
    
    // Set up change tracking for Y.js document
    if (this.enableChangeTracking) {
      this.setupChangeTracking();
    }
  }

  disconnect(): void {
    if (this.provider) {
      this.provider.disconnect();
      this.provider = null;
    }
  }

  isConnected(): boolean {
    return this.provider?.wsconnected ?? false;
  }

  incrementRefCount(): number {
    this.refCount += 1;
    console.log(`[YjsProvider] ${this.documentId} refCount incremented to ${this.refCount}`);
    return this.refCount;
  }

  decrementRefCount(): number {
    this.refCount = Math.max(0, this.refCount - 1);
    console.log(`[YjsProvider] ${this.documentId} refCount decremented to ${this.refCount}`);
    return this.refCount;
  }

  destroy(): void {
    if (this.refCount > 0) {
      console.log(
        `[YjsProvider] ${this.documentId} destroy skipped (refCount=${this.refCount})`
      );
      return;
    }
    this.disconnect();
    this.doc.destroy();
  }

  forceDestroy(): void {
    this.refCount = 0;
    console.log(`[YjsProvider] ${this.documentId} force destroy`);
    this.disconnect();
    this.cleanupChangeTracking();
    this.doc.destroy();
  }

  /**
   * Set up change tracking for Y.js document
   */
  private setupChangeTracking(): void {
    if (!this.changeTracker) {
      return;
    }

    // Get the content fragment
    const contentFragment = this.doc.getXmlFragment("content");
    
    // Debounce change tracking to avoid excessive events
    let changeTimeout: number | null = null;
    
    contentFragment.observe((event) => {
      if (!this.userId || changeTimeout) {
        return;
      }
      
      // Clear previous timeout
      if (changeTimeout) {
        clearTimeout(changeTimeout);
      }
      
      // Debounce for 500ms to batch changes
      changeTimeout = window.setTimeout(() => {
        if (!this.changeTracker || !this.userId) {
          return;
        }
        
        // Track the change event
        const changeType = this.determineChangeType(event);
        
        void this.changeTracker.trackChange(
          changeType,
          {
            delta: JSON.stringify(event.changes.delta),
            added: event.changes.added.size,
            deleted: event.changes.deleted.size
          },
          null
        );
        
        changeTimeout = null;
      }, 500);
    });
  }
  
  /**
   * Determine the type of change based on Y.js event
   */
  private determineChangeType(event: Y.YXmlEvent): ChangeEvent["changeType"] {
    const hasAdded = event.changes.added.size > 0;
    const hasDeleted = event.changes.deleted.size > 0;
    
    if (hasAdded && !hasDeleted) {
      return "insert";
    } else if (!hasAdded && hasDeleted) {
      return "delete";
    } else if (hasAdded && hasDeleted) {
      return "update";
    }
    
    return "update";
  }
  
  /**
   * Clean up change tracking
   */
  private cleanupChangeTracking(): void {
    if (this.changeTracker) {
      this.changeTracker.destroy();
      this.changeTracker = null;
    }
  }
  
  /**
   * Get pending change count (for offline mode)
   */
  getPendingChangeCount(): number {
    return this.changeTracker?.getPendingCount() ?? 0;
  }
  
  /**
   * Generate a consistent color for a user based on their ID
   */
  private getUserColor(userId: string): string {
    const colors = [
      '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16',
      '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9',
      '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef',
      '#ec4899', '#f43f5e'
    ];
    const index = userId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length;
    return colors[index];
  }
}

const providers = new Map<string, WebSocketYjsProvider>();

export const getYjsProvider = (documentId: string, options?: WebSocketYjsProviderOptions): YjsProvider => {
  // Create a new provider for this document
  if (!providers.has(documentId)) {
    const provider = new WebSocketYjsProvider(documentId, options);
    providers.set(documentId, provider);
    return provider;
  }
  const provider = providers.get(documentId)!;
  provider.incrementRefCount();
  return provider;
};

/**
 * Get pending change count for a document (for offline mode)
 */
export const getPendingChangeCount = (documentId: string): number => {
  const provider = providers.get(documentId);
  if (!provider || !('getPendingChangeCount' in provider)) {
    return 0;
  }
  return (provider as WebSocketYjsProvider).getPendingChangeCount();
};

export const resetProvider = (documentId: string): void => {
  const provider = providers.get(documentId);
  if (!provider) {
    return;
  }
  provider.forceDestroy();
  providers.delete(documentId);
};

export const destroyYjsProvider = (documentId: string): void => {
  const provider = providers.get(documentId);
  if (!provider) {
    return;
  }
  const remainingRefs = provider.decrementRefCount();
  if (remainingRefs > 0) {
    return;
  }
  provider.destroy();
  providers.delete(documentId);
};

// Destroy all providers - useful for cleanup during tests or app shutdown
export const destroyAllYjsProviders = (): void => {
  providers.forEach((provider) => provider.forceDestroy());
  providers.clear();
};
