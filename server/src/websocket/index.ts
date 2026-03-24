import { randomUUID } from "crypto";
import type { IncomingMessage, Server } from "http";
import { WebSocketServer } from "ws";
import { createYjsServer } from "../collaboration/yjsServer.js";
import { autoJoinDocumentViaShare, validateDocumentAccessWithShare } from "../services/document.service.js";
import { canEditDocument } from "../services/permission.service.js";
import { logger } from "../utils/logger.js";
import { getSessionUser } from "../middlewares/auth.middleware.js";

const yjsServer = createYjsServer();

type ParsedConnection = {
  documentId: string;
  shareToken?: string;
};

type SocketUser = Awaited<ReturnType<typeof authenticateSocket>>;

const parseConnection = (request: IncomingMessage): ParsedConnection | null => {
  const hostHeader = request.headers.host ?? "localhost";
  const url = new URL(request.url ?? "", `http://${hostHeader}`);
  const segments = url.pathname.split("/").filter(Boolean);

  if (segments[0] !== "ws") {
    return null;
  }

  const documentId = decodeURIComponent(
    segments[1] ?? url.searchParams.get("documentId") ?? ""
  ).trim();
  const shareToken = (
    url.searchParams.get("token") ??
    url.searchParams.get("shareToken") ??
    ""
  ).trim();

  return {
    documentId,
    shareToken: shareToken || undefined
  };
};

const closeUnauthorized = (reason: string, socket: import("ws").WebSocket) => {
  socket.close(1008, reason);
};

const getConnectionUserId = (user: NonNullable<SocketUser>) => user.id;

const getGuestUserId = () => `guest:${randomUUID()}`;

const authenticateSocket = async (request: IncomingMessage) => {
  try {
    const cookieHeader = request.headers.cookie;
    const hostHeader = request.headers.host;
    const forwardedProto = request.headers["x-forwarded-proto"];
    const defaultProtocol = (request.socket as { encrypted?: boolean }).encrypted ? "https" : "http";
    const protocol = Array.isArray(forwardedProto)
      ? forwardedProto[0]
      : forwardedProto ?? defaultProtocol;

    const fakeRequest = {
      protocol,
      get: (name: string) => {
        if (name.toLowerCase() === "host") {
          return Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
        }
        return undefined;
      },
      header: (name: string) => {
        if (name.toLowerCase() === "cookie") {
          return Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader;
        }
        return undefined;
      }
    };

    return await getSessionUser(fakeRequest as any);
  } catch (error) {
    logger.error(`[WebSocket] authentication failed: ${error}`);
    return null;
  }
};

const authorizeConnection = async (
  request: IncomingMessage,
  user: SocketUser
) => {
  const parsed = parseConnection(request);
  if (!parsed || !parsed.documentId) {
    return { ok: false as const, reason: "documentId is required" };
  }

  const access = await validateDocumentAccessWithShare(
    parsed.documentId,
    user?.id ?? "",
    parsed.shareToken
  );

  if (!access.allowed) {
    if (access.reason === "not_found") {
      return { ok: false as const, reason: "Document not found" };
    }

    if (access.reason === "share_invalid") {
      return { ok: false as const, reason: "Invalid or expired share token" };
    }

    return { ok: false as const, reason: "Access denied" };
  }

  return {
    ok: true as const,
    documentId: parsed.documentId,
    shareToken: parsed.shareToken,
    access
  };
};

export const initWebSocketServer = (server: Server) => {
  const wss = new WebSocketServer({ server });

  wss.on("connection", async (socket, request) => {
    try {
      const parsed = parseConnection(request);
      if (!parsed) {
        closeUnauthorized("Unsupported websocket path", socket);
        return;
      }

      const user = await authenticateSocket(request);
      const authorization = await authorizeConnection(request, user);
      if (!authorization.ok) {
        closeUnauthorized(authorization.reason, socket);
        return;
      }

      const userId = user ? getConnectionUserId(user) : getGuestUserId();
      if (user && authorization.access.source === "share" && authorization.access.shareToken) {
        await autoJoinDocumentViaShare(
          authorization.documentId,
          user.id,
          authorization.access.shareToken.token,
          authorization.access.shareToken.permissionLevel
        );
      }

      yjsServer.attach(socket, {
        documentId: authorization.documentId,
        userId,
        canWrite: canEditDocument(authorization.access.role)
      });

      logger.info(
        `[WebSocket] connected document=${authorization.documentId} user=${userId} role=${authorization.access.role}`
      );
    } catch (error) {
      logger.error(`[WebSocket] connection failed: ${error}`);
      socket.close(1011, "Internal Server Error");
    }
  });

  logger.info("WebSocket server initialized");

  return wss;
};
