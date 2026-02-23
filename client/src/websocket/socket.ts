import { ClientEvent, ServerEvent } from "../../../shared/events.js";
import type { ServerReadyPayload, ServerSyncResponsePayload, ServerPresenceBroadcastPayload, ServerErrorPayload } from "../../../shared/types.js";

/**
 * WebSocket connection manager
 * Handles connection to server, message routing, and automatic reconnection
 */
export class WebSocketManager {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000; // Start with 1 second
  private isConnecting = false;
  private messageHandlers = new Map<string, (payload: unknown) => void>();

  constructor(private url: string) {}

  /**
   * Connect to WebSocket server
   */
  connect(): void {
    if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    this.isConnecting = true;

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log("[WebSocket] Connected to", this.url);
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.reconnectDelay = 1000;
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (error) {
          console.warn("[WebSocket] Failed to parse message:", error);
        }
      };

      this.ws.onclose = (event) => {
        if (event.code !== 1000) {
          // Only log if it's not an intentional disconnect
          console.warn("[WebSocket] Disconnected:", event.code, event.reason);
        }
        this.isConnecting = false;
        this.ws = null;

        // Attempt to reconnect if not intentionally closed and max attempts not reached
        if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.attemptReconnect();
        }
      };

      this.ws.onerror = (_error) => {
        // Don't log errors excessively - they're usually just connection failures
        this.isConnecting = false;
      };

    } catch (error) {
      console.error("Failed to create WebSocket connection:", error);
      this.isConnecting = false;
      this.attemptReconnect();
    }
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close(1000, "User disconnected");
      this.ws = null;
    }
    this.reconnectAttempts = this.maxReconnectAttempts; // Prevent reconnection
  }

  /**
   * Send a message to the server
   */
  send(type: ClientEvent, payload: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, payload }));
    } else {
      console.warn("WebSocket not connected, message not sent:", type);
    }
  }

  /**
   * Register a handler for a specific server event
   */
  on(event: ServerEvent, handler: (payload: unknown) => void): void {
    this.messageHandlers.set(event, handler);
  }

  /**
   * Register a typed handler for a specific server event
   */
  onTyped<T>(event: ServerEvent, handler: (payload: T) => void): void {
    this.messageHandlers.set(event, handler as (payload: unknown) => void);
  }

  /**
   * Remove a handler for a specific server event
   */
  off(event: ServerEvent): void {
    this.messageHandlers.delete(event);
  }

  /**
   * Handle incoming messages from server
   */
  private handleMessage(message: { type: string; payload: unknown }): void {
    const { type, payload } = message;

    // Call the registered handler for this event type
    const handler = this.messageHandlers.get(type as ServerEvent);
    if (handler) {
      handler(payload);
    } else {
      console.warn(`No handler registered for event: ${type}`);
    }
  }

  /**
   * Attempt to reconnect to the server
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.warn("[WebSocket] Max reconnection attempts reached. Please refresh the page.");
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1); // Exponential backoff

    console.log(`[WebSocket] Reconnecting in ${Math.round(delay / 1000)}s (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    setTimeout(() => {
      this.connect();
    }, delay);
  }

  /**
   * Check if WebSocket is connected
   */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}

/**
 * Create a singleton WebSocket manager instance
 */
let wsManager: WebSocketManager | null = null;

export const getWebSocketManager = (url?: string): WebSocketManager => {
  if (!wsManager) {
    if (!url) {
      throw new Error("WebSocket URL required for initial connection");
    }
    wsManager = new WebSocketManager(url);
  }
  return wsManager;
};

/**
 * Connect to WebSocket server with event handlers
 */
export const connectWebSocket = (
  url: string,
  handlers: {
    onReady?: (payload: ServerReadyPayload) => void;
    onSyncResponse?: (payload: ServerSyncResponsePayload) => void;
    onPresenceBroadcast?: (payload: ServerPresenceBroadcastPayload) => void;
    onError?: (payload: ServerErrorPayload) => void;
  }
): WebSocketManager => {
  const manager = getWebSocketManager(url);

  // Register handlers with proper type casting
  if (handlers.onReady) {
    manager.onTyped(ServerEvent.Ready, handlers.onReady);
  }
  if (handlers.onSyncResponse) {
    manager.onTyped(ServerEvent.SyncResponse, handlers.onSyncResponse);
  }
  if (handlers.onPresenceBroadcast) {
    manager.onTyped(ServerEvent.PresenceBroadcast, handlers.onPresenceBroadcast);
  }
  if (handlers.onError) {
    manager.onTyped(ServerEvent.Error, handlers.onError);
  }

  // Connect to server
  manager.connect();

  return manager;
};
