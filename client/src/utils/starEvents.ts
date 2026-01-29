export type StarUpdate = {
  documentId: string;
  workspaceId: string;
  isStarred: boolean;
};

type StarUpdatePayload = StarUpdate & {
  sourceId: string;
};

const CHANNEL_NAME = "collab-document-stars";

const createSourceId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `star_${Date.now()}_${Math.random().toString(16).slice(2)}`;
};

const sourceId = createSourceId();
const channel = typeof BroadcastChannel !== "undefined"
  ? new BroadcastChannel(CHANNEL_NAME)
  : null;

const emitLocalEvent = (payload: StarUpdatePayload) => {
  const event = new CustomEvent(CHANNEL_NAME, { detail: payload });
  window.dispatchEvent(event);
};

export const emitStarUpdate = (update: StarUpdate) => {
  const payload: StarUpdatePayload = { ...update, sourceId };
  if (channel) {
    channel.postMessage(payload);
  }
  emitLocalEvent(payload);
};

export const subscribeToStarUpdates = (handler: (update: StarUpdate) => void) => {
  const handleBroadcast = (event: MessageEvent) => {
    const payload = event.data as StarUpdatePayload;
    if (!payload || payload.sourceId === sourceId) {
      return;
    }
    handler(payload);
  };

  const handleLocalEvent = (event: Event) => {
    const detail = (event as CustomEvent<StarUpdatePayload>).detail;
    if (!detail) {
      return;
    }
    handler(detail);
  };

  if (channel) {
    channel.addEventListener("message", handleBroadcast);
  }
  window.addEventListener(CHANNEL_NAME, handleLocalEvent);

  return () => {
    if (channel) {
      channel.removeEventListener("message", handleBroadcast);
    }
    window.removeEventListener(CHANNEL_NAME, handleLocalEvent);
  };
};
