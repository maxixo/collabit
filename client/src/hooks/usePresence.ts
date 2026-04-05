import { useEffect, useCallback, useRef } from "react";
import type { Collaborator, CursorPosition } from "../app/store";
import { useAppStore, actions } from "../app/store";

type PresenceSnapshotPayload = {
  users?: Collaborator[];
  cursors?: CursorPosition[];
};

type UserJoinedPayload = {
  user: Collaborator;
  cursor?: CursorPosition | null;
};

type CursorUpdatePayload = {
  userId: string;
  position: CursorPosition;
};

const normalizeBaseUrl = (baseUrl: string) => baseUrl.replace(/\/$/, "");

export const usePresence = (documentId?: string | null) => {
  const { presence, connectionStatus, dispatch } = useAppStore();
  const { collaborators, cursorPositions } = presence;
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef(0);

  const presenceBaseUrl =
    import.meta.env.VITE_PRESENCE_SSE_URL?.trim() ||
    import.meta.env.VITE_API_BASE_URL?.trim() ||
    window.location.origin;
  const sseBaseUrl =
    import.meta.env.VITE_PRESENCE_SSE_URL?.trim() || presenceBaseUrl;

  const handlePresenceUpdate = useCallback(
    (presenceData: PresenceSnapshotPayload) => {
      const nextCollaborators = presenceData.users ?? [];
      const nextCursors = new Map<string, CursorPosition>();

      if (presenceData.cursors) {
        presenceData.cursors.forEach((cursor) => {
          nextCursors.set(cursor.userId, cursor);
        });
      }

      dispatch(
        actions.setPresence({
          collaborators: nextCollaborators,
          cursorPositions: nextCursors
        })
      );
    },
    [dispatch]
  );

  const handleUserJoined = useCallback(
    (payload: UserJoinedPayload) => {
      dispatch(actions.addCollaborator(payload.user));
      if (payload.cursor) {
        dispatch(actions.updateCursor(payload.user.id, payload.cursor));
      }
    },
    [dispatch]
  );

  const handleUserLeft = useCallback((userId: string) => {
    dispatch(actions.removeCollaborator(userId));
  }, [dispatch]);

  const handleCursorUpdate = useCallback(
    (update: CursorUpdatePayload) => {
      dispatch(actions.updateCursor(update.userId, update.position));
    },
    [dispatch]
  );

  const sendPresenceUpdate = useCallback(
    async (path: string, payload?: Record<string, unknown>) => {
      if (!documentId) {
        return false;
      }

      try {
        const baseUrl = normalizeBaseUrl(presenceBaseUrl);
        const response = await fetch(
          `${baseUrl}/api/presence/${encodeURIComponent(documentId)}/${path}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: payload ? JSON.stringify(payload) : undefined
          }
        );

        return response.ok;
      } catch {
        return false;
      }
    },
    [presenceBaseUrl, documentId]
  );

  useEffect(() => {
    dispatch(actions.setPresence({ collaborators: [], cursorPositions: new Map() }));
  }, [documentId, dispatch]);

  useEffect(() => {
    if (!documentId) {
      return;
    }

    if (!sseBaseUrl) {
      return;
    }

    reconnectAttemptsRef.current = 0;
    const normalizedBaseUrl = normalizeBaseUrl(sseBaseUrl);
    const url = `${normalizedBaseUrl}/api/presence/${encodeURIComponent(documentId)}`;
    let isActive = true;

    const cleanupEventSource = () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };

    const scheduleReconnect = () => {
      if (!isActive || reconnectTimeoutRef.current !== null) {
        return;
      }

      const attempt = reconnectAttemptsRef.current + 1;
      reconnectAttemptsRef.current = attempt;
      const delay = Math.min(30000, 1000 * Math.pow(2, attempt - 1));

      reconnectTimeoutRef.current = window.setTimeout(() => {
        reconnectTimeoutRef.current = null;
        if (!isActive) {
          return;
        }
        connect();
      }, delay);
    };

    const parsePayload = (event: MessageEvent) => {
      if (!event.data) {
        return null;
      }
      try {
        return JSON.parse(event.data as string);
      } catch {
        return null;
      }
    };

    const connect = () => {
      cleanupEventSource();

      const eventSource = new EventSource(url, { withCredentials: true });
      eventSourceRef.current = eventSource;

      eventSource.addEventListener("presence", (event) => {
        const payload = parsePayload(event as MessageEvent);
        if (payload) {
          handlePresenceUpdate(payload);
        }
      });

      eventSource.addEventListener("user_joined", (event) => {
        const payload = parsePayload(event as MessageEvent);
        if (payload) {
          handleUserJoined(payload);
        }
      });

      eventSource.addEventListener("user_left", (event) => {
        const payload = parsePayload(event as MessageEvent);
        if (payload?.userId) {
          handleUserLeft(payload.userId);
        }
      });

      eventSource.addEventListener("cursor_update", (event) => {
        const payload = parsePayload(event as MessageEvent);
        if (payload) {
          handleCursorUpdate(payload);
        }
      });

      eventSource.onopen = () => {
        reconnectAttemptsRef.current = 0;
      };

      eventSource.onerror = () => {
        cleanupEventSource();
        scheduleReconnect();
      };
    };

    connect();

    return () => {
      isActive = false;
      cleanupEventSource();
      if (reconnectTimeoutRef.current !== null) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [documentId, handlePresenceUpdate, handleUserJoined, handleUserLeft, handleCursorUpdate, sseBaseUrl]);

  // Clean up presence when document changes or user goes offline
  useEffect(() => {
    if (connectionStatus === 'offline') {
      dispatch(actions.setPresence({ collaborators: [], cursorPositions: new Map() }));
    }
  }, [connectionStatus, dispatch]);

  return {
    onlineCount: collaborators.length,
    collaborators,
    cursorPositions,
    isOnline: connectionStatus === 'online',
    sendCursorUpdate: (position: number, range?: { from: number; to: number }) =>
      sendPresenceUpdate("cursor", { position, range }),
    sendSelectionUpdate: (selection: { from: number; to: number }) =>
      sendPresenceUpdate("selection", selection)
  };
};
