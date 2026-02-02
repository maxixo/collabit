import { Awareness } from "y-protocols/awareness";
import * as Y from "yjs";
import { WebsocketProvider as YWebsocketProvider } from "y-websocket";

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
  private refCount = 1;

  constructor(documentId: string, options: WebSocketYjsProviderOptions = {}) {
    this.documentId = documentId;
    this.token = options.token;
    this.userId = options.userId;
    this.userName = options.userName;
    this.userImage = options.userImage;

    this.doc = new Y.Doc();
    // Ensure the collaboration fragment exists for TipTap bindings.
    this.doc.getXmlFragment("content");
    this.awareness = new Awareness(this.doc);
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
    this.doc.destroy();
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
