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
    this.doc.getXmlFragment("content");
    this.awareness = new Awareness(this.doc);
  }

  connect(): void {
    if (this.provider) {
      return;
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const serverUrl = (
      import.meta.env.VITE_WS_URL?.trim() ||
      `${protocol}//${window.location.host}/ws`
    ).replace(/\/$/, "");

    const params: Record<string, string> = {};
    if (this.token) {
      params.token = this.token;
    }

    this.provider = new YWebsocketProvider(serverUrl, this.documentId, this.doc, {
      awareness: this.awareness,
      connect: true,
      params,
      disableBc: true
    });

    if (this.userId) {
      this.awareness.setLocalStateField("user", {
        id: this.userId,
        name: this.userName || "Anonymous",
        color: this.getUserColor(this.userId),
        image: this.userImage
      });
    }
  }

  disconnect(): void {
    if (!this.provider) {
      return;
    }

    this.provider.disconnect();
    this.provider.destroy();
    this.provider = null;
  }

  isConnected(): boolean {
    return this.provider?.wsconnected ?? false;
  }

  incrementRefCount(): number {
    this.refCount += 1;
    return this.refCount;
  }

  decrementRefCount(): number {
    this.refCount = Math.max(0, this.refCount - 1);
    return this.refCount;
  }

  destroy(): void {
    if (this.refCount > 0) {
      return;
    }

    this.disconnect();
    this.doc.destroy();
  }

  forceDestroy(): void {
    this.refCount = 0;
    this.disconnect();
    this.doc.destroy();
  }

  private getUserColor(userId: string): string {
    const colors = [
      "#ef4444",
      "#f97316",
      "#f59e0b",
      "#eab308",
      "#84cc16",
      "#22c55e",
      "#10b981",
      "#14b8a6",
      "#06b6d4",
      "#0ea5e9",
      "#3b82f6",
      "#6366f1",
      "#8b5cf6",
      "#a855f7",
      "#d946ef",
      "#ec4899",
      "#f43f5e"
    ];

    const index =
      userId.split("").reduce((total, character) => total + character.charCodeAt(0), 0) %
      colors.length;

    return colors[index];
  }
}

const providers = new Map<string, WebSocketYjsProvider>();

export const getYjsProvider = (
  documentId: string,
  options?: WebSocketYjsProviderOptions
): YjsProvider => {
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

export const getRegisteredProviders = () => providers;

export const getPendingChangeCount = (_documentId: string): number => 0;

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

export const destroyAllYjsProviders = (): void => {
  providers.forEach((provider) => provider.forceDestroy());
  providers.clear();
};
