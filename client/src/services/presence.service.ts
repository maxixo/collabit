export type CursorSelection = {
  from: number;
  to: number;
};

export type CursorPayload = {
  position: number;
  selection?: CursorSelection;
};

const normalizeBaseUrl = (baseUrl: string) => baseUrl.replace(/\/$/, "");

const PRESENCE_BASE_URL = normalizeBaseUrl(
  import.meta.env.VITE_PRESENCE_SSE_URL?.trim() ||
    import.meta.env.VITE_API_BASE_URL?.trim() ||
    "http://localhost:4000"
);

const getJwtHeaders = () => {
  const token = localStorage.getItem("auth_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const parseResponse = async (response: Response) => {
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message =
      (payload as { message?: string } | null)?.message ?? "Presence request failed";
    throw new Error(message);
  }

  return payload;
};

const postPresence = async (
  documentId: string,
  path: string,
  payload?: Record<string, unknown>
) => {
  const headers: HeadersInit = {
    "Content-Type": "application/json"
  };
  const jwtHeaders = getJwtHeaders();
  if (jwtHeaders.Authorization) {
    headers.Authorization = jwtHeaders.Authorization;
  }

  const response = await fetch(
    `${PRESENCE_BASE_URL}/api/presence/${encodeURIComponent(documentId)}/${path}`,
    {
      method: "POST",
      headers,
      credentials: "include",
      body: payload ? JSON.stringify(payload) : undefined
    }
  );

  await parseResponse(response);
};

const buildCursorPayload = (position: number, selection?: CursorSelection) => {
  const cursor: { position: number; range?: CursorSelection } = { position };
  if (selection) {
    cursor.range = selection;
  }
  return cursor;
};

export const joinDocument = async (
  documentId: string,
  userId: string,
  name: string,
  avatar?: string,
  cursor?: CursorPayload
) => {
  await postPresence(documentId, "join", {
    userId,
    name,
    avatar,
    cursor: cursor ? buildCursorPayload(cursor.position, cursor.selection) : undefined
  });
};

export const leaveDocument = async (documentId: string, userId: string) => {
  await postPresence(documentId, "leave", { userId });
};

export const updateCursor = async (
  documentId: string,
  userId: string,
  position: number,
  selection?: CursorSelection
) => {
  await postPresence(documentId, "cursor", {
    userId,
    ...buildCursorPayload(position, selection)
  });
};

export const updateSelection = async (
  documentId: string,
  userId: string,
  from: number,
  to: number
) => {
  await postPresence(documentId, "selection", { userId, from, to });
};
