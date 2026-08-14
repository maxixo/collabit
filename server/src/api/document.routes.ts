import { randomUUID } from "crypto";
import { Router, type Response } from "express";
import type { ShareTokenOptions } from "@shared/types.js";
import type { DocumentModel } from "../models/document.model.js";
import { authMiddleware, type AuthenticatedRequest } from "../middlewares/auth.middleware.js";
import { logger } from "../utils/logger.js";
import {
  autoJoinDocumentViaShare,
  createDocument,
  emptyTrash,
  getDocumentById,
  listSharedDocuments,
  getStarredDocuments,
  getTrashDocuments,
  listDocuments,
  moveToTrash,
  permanentlyDeleteDocument,
  restoreFromTrash,
  toggleStarDocument,
  updateDocument,
  validateDocumentAccessWithShare
} from "../services/document.service.js";
import {
  getPendingChanges,
  markAllChangesApplied,
  markChangesApplied
} from "../services/changeEvent.service.js";
import {
  acceptSuggestions,
  createSuggestion,
  getPendingSuggestionSummary,
  getSuggestionById,
  listSuggestions,
  rejectSuggestions,
  resolveSuggestionsByAuthor
} from "../services/suggestion.service.js";
import { canEditDocument, getDocumentRole } from "../services/permission.service.js";
import {
  generateShareToken,
  getShareTokenByToken,
  incrementTokenUsage,
  listActiveShareTokens,
  revokeShareToken,
  validateShareToken
} from "../services/shareToken.service.js";
import {
  getDocumentVersions,
  restoreDocumentVersion,
  createDocumentVersion
} from "../services/documentVersion.service.js";

export const documentRoutes = Router();

const DEFAULT_DOCUMENT_CONTENT = {
  type: "doc",
  content: [{ type: "paragraph" }]
};

const SHARE_PERMISSION_LEVELS = new Set(["viewer", "editor", "owner"]);

const requireUserId = (req: AuthenticatedRequest, res: Response): string | null => {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ message: "Unauthorized" });
    return null;
  }
  return userId;
};

documentRoutes.get("/share/:token", async (req, res, next) => {
  try {
    const token = typeof req.params.token === "string" ? req.params.token.trim() : "";
    if (!token) {
      res.status(400).json({ message: "token is required" });
      return;
    }

    const validation = await validateShareToken(token);
    if (!validation.valid) {
      const status = validation.reason === "not_found" ? 404 : 410;
      const message =
        validation.reason === "not_found"
          ? "Share token not found"
          : validation.reason === "expired"
            ? "Share token expired"
            : "Share token has reached its usage limit";
      res.status(status).json({ message });
      return;
    }

    const updatedToken = await incrementTokenUsage(token);
    if (!updatedToken) {
      res.status(410).json({ message: "Share token is no longer valid" });
      return;
    }

    res.json({ shareToken: updatedToken });
  } catch (error) {
    next(error);
  }
});

documentRoutes.use(authMiddleware);

documentRoutes.get("/", async (req: AuthenticatedRequest, res, next) => {
  try {
    const workspaceId = typeof req.query.workspaceId === "string" ? req.query.workspaceId : "";
    if (!workspaceId) {
      res.status(400).json({ message: "workspaceId is required" });
      return;
    }

    const userId = requireUserId(req, res);
    if (!userId) {
      return;
    }

    const documents = await listDocuments(workspaceId, userId);
    res.json({ documents });
  } catch (error) {
    next(error);
  }
});

documentRoutes.post("/:id/share", async (req: AuthenticatedRequest, res, next) => {
  try {
    const workspaceId = typeof req.query.workspaceId === "string" ? req.query.workspaceId : "";
    if (!workspaceId) {
      res.status(400).json({ message: "workspaceId is required" });
      return;
    }

    const userId = requireUserId(req, res);
    if (!userId) {
      return;
    }
    const role = await getDocumentRole(userId, req.params.id, workspaceId);
    if (role !== "owner") {
      res.status(403).json({ message: "Access denied" });
      return;
    }

    const { permission, expiration, maxUses } = req.body as Partial<ShareTokenOptions>;
    let permissionValue: ShareTokenOptions["permission"] | undefined;
    let expirationValue: string | null | undefined;
    let maxUsesValue: number | null | undefined;

    if (typeof permission === "string") {
      if (!SHARE_PERMISSION_LEVELS.has(permission)) {
        res.status(400).json({ message: "permission must be viewer, editor, or owner" });
        return;
      }
      permissionValue = permission;
    } else if (typeof permission !== "undefined" && permission !== null) {
      res.status(400).json({ message: "permission must be viewer, editor, or owner" });
      return;
    }

    if (typeof expiration === "string") {
      const parsed = new Date(expiration);
      if (Number.isNaN(parsed.getTime())) {
        res.status(400).json({ message: "expiration must be a valid ISO date string" });
        return;
      }
      expirationValue = parsed.toISOString();
    } else if (expiration === null || typeof expiration === "undefined") {
      expirationValue = null;
    } else {
      res.status(400).json({ message: "expiration must be a valid ISO date string" });
      return;
    }

    if (typeof maxUses === "number") {
      if (!Number.isInteger(maxUses) || maxUses <= 0) {
        res.status(400).json({ message: "maxUses must be a positive integer" });
        return;
      }
      maxUsesValue = maxUses;
    } else if (maxUses === null || typeof maxUses === "undefined") {
      maxUsesValue = null;
    } else {
      res.status(400).json({ message: "maxUses must be a positive integer" });
      return;
    }

    const shareToken = await generateShareToken(req.params.id, userId, {
      permission: permissionValue,
      expiration: expirationValue,
      maxUses: maxUsesValue
    });

    res.status(201).json({ shareToken });
  } catch (error) {
    next(error);
  }
});

documentRoutes.get("/:id/share-tokens", async (req: AuthenticatedRequest, res, next) => {
  try {
    const workspaceId = typeof req.query.workspaceId === "string" ? req.query.workspaceId : "";
    if (!workspaceId) {
      res.status(400).json({ message: "workspaceId is required" });
      return;
    }

    const userId = requireUserId(req, res);
    if (!userId) {
      return;
    }
    const role = await getDocumentRole(userId, req.params.id, workspaceId);
    if (!canEditDocument(role)) {
      res.status(403).json({ message: "Access denied" });
      return;
    }

    const tokens = await listActiveShareTokens(req.params.id);
    res.json({ tokens });
  } catch (error) {
    next(error);
  }
});

documentRoutes.delete("/share/:token", async (req: AuthenticatedRequest, res, next) => {
  try {
    const workspaceId = typeof req.query.workspaceId === "string" ? req.query.workspaceId : "";
    if (!workspaceId) {
      res.status(400).json({ message: "workspaceId is required" });
      return;
    }

    const token = typeof req.params.token === "string" ? req.params.token.trim() : "";
    if (!token) {
      res.status(400).json({ message: "token is required" });
      return;
    }

    const shareToken = await getShareTokenByToken(token);
    if (!shareToken) {
      res.status(404).json({ message: "Share token not found" });
      return;
    }

    const userId = requireUserId(req, res);
    if (!userId) {
      return;
    }
    const role = await getDocumentRole(userId, shareToken.documentId, workspaceId);
    if (!canEditDocument(role)) {
      res.status(403).json({ message: "Access denied" });
      return;
    }

    const revoked = await revokeShareToken(token);
    if (!revoked) {
      res.status(404).json({ message: "Share token not found" });
      return;
    }

    res.json({ token, revoked: true });
  } catch (error) {
    next(error);
  }
});

documentRoutes.post("/", async (req: AuthenticatedRequest, res, next) => {
  try {
    const { id, title, content, workspaceId } = req.body as {
      id?: string;
      title?: string;
      content?: Record<string, unknown>;
      workspaceId?: string;
    };

    if (!workspaceId) {
      res.status(400).json({ message: "workspaceId is required" });
      return;
    }

    // Note: We don't check permissions here because the user is creating a NEW document.
    // The document service will automatically add them as the owner in document_members.
    // Permission checks will happen when they try to GET, PATCH, or DELETE the document.

    const userId = requireUserId(req, res);
    if (!userId) {
      return;
    }

    const documentId = typeof id === "string" && id.trim().length > 0 ? id.trim() : randomUUID();
    const document: DocumentModel = {
      id: documentId,
      title: title?.trim() || "Untitled document",
      content: content ?? DEFAULT_DOCUMENT_CONTENT,
      updatedAt: new Date().toISOString(),
      ownerId: userId,
      workspaceId,
      isStarred: false
    };

    try {
      const createdDocument = await createDocument(document);
      res.status(201).json({ document: createdDocument });
    } catch (error) {
      const err = error as { code?: string };
      if (err.code === "23505") {
        res.status(409).json({ message: "Document already exists" });
        return;
      }
      throw error;
    }
  } catch (error) {
    next(error);
  }
});

documentRoutes.get("/starred", async (req: AuthenticatedRequest, res, next) => {
  try {
    const workspaceId = typeof req.query.workspaceId === "string" ? req.query.workspaceId : "";
    if (!workspaceId) {
      res.status(400).json({ message: "workspaceId is required" });
      return;
    }

    const userId = requireUserId(req, res);
    if (!userId) {
      return;
    }

    const documents = await getStarredDocuments(workspaceId, userId);
    res.json({ documents });
  } catch (error) {
    next(error);
  }
});

documentRoutes.get("/shared", async (req: AuthenticatedRequest, res, next) => {
  try {
    const workspaceId = typeof req.query.workspaceId === "string" ? req.query.workspaceId : "";
    if (!workspaceId) {
      res.status(400).json({ message: "workspaceId is required" });
      return;
    }

    const userId = requireUserId(req, res);
    if (!userId) {
      return;
    }

    const documents = await listSharedDocuments(workspaceId, userId);
    res.json({ documents });
  } catch (error) {
    next(error);
  }
});

documentRoutes.get("/trash", async (req: AuthenticatedRequest, res, next) => {
  try {
    const workspaceId = typeof req.query.workspaceId === "string" ? req.query.workspaceId : "";
    if (!workspaceId) {
      res.status(400).json({ message: "workspaceId is required" });
      return;
    }

    const userId = requireUserId(req, res);
    if (!userId) {
      return;
    }

    const documents = await getTrashDocuments(workspaceId, userId);
    res.json({ documents });
  } catch (error) {
    next(error);
  }
});

documentRoutes.delete("/trash", async (req: AuthenticatedRequest, res, next) => {
  try {
    const workspaceId = typeof req.query.workspaceId === "string" ? req.query.workspaceId : "";
    if (!workspaceId) {
      res.status(400).json({ message: "workspaceId is required" });
      return;
    }

    const userId = requireUserId(req, res);
    if (!userId) {
      return;
    }

    const deletedCount = await emptyTrash(workspaceId, userId);
    res.json({ deletedCount });
  } catch (error) {
    next(error);
  }
});

documentRoutes.get("/:id", async (req: AuthenticatedRequest, res, next) => {
  try {
    let workspaceId = typeof req.query.workspaceId === "string" ? req.query.workspaceId : "";
    const userId = req.user?.id ?? "";
    const shareToken = req.shareToken;

    const access = await validateDocumentAccessWithShare(req.params.id, userId, shareToken);
    if (!access.allowed) {
      if (access.reason === "not_found") {
        res.status(404).json({ message: "Document not found" });
        return;
      }
      res.status(403).json({ message: "Access denied" });
      return;
    }

    if (!workspaceId && access.source === "share") {
      workspaceId = access.workspaceId;
    }

    if (!workspaceId) {
      res.status(400).json({ message: "workspaceId is required" });
      return;
    }

    const document = await getDocumentById(req.params.id, workspaceId, userId, {
      bypassAccessCheck: access.source === "share"
    });
    if (!document) {
      res.status(404).json({ message: "Document not found" });
      return;
    }

    if (access.source === "share" && access.shareToken && userId) {
      await autoJoinDocumentViaShare(
        req.params.id,
        userId,
        access.shareToken.token,
        access.shareToken.permissionLevel
      );
    }

    res.json({
      document,
      accessRole: access.role,
      accessSource: access.source
    });
  } catch (error) {
    next(error);
  }
});

documentRoutes.patch("/:id/trash", async (req: AuthenticatedRequest, res, next) => {
  try {
    const workspaceId = typeof req.query.workspaceId === "string" ? req.query.workspaceId : "";
    if (!workspaceId) {
      res.status(400).json({ message: "workspaceId is required" });
      return;
    }

    const userId = requireUserId(req, res);
    if (!userId) {
      return;
    }
    const role = await getDocumentRole(userId, req.params.id, workspaceId);
    if (!canEditDocument(role)) {
      res.status(403).json({ message: "Access denied" });
      return;
    }

    const trashed = await moveToTrash(req.params.id, workspaceId, userId);
    if (!trashed) {
      res.status(404).json({ message: "Document not found" });
      return;
    }

    res.json({ documentId: req.params.id, trashed: true });
  } catch (error) {
    next(error);
  }
});

documentRoutes.patch("/:id/restore", async (req: AuthenticatedRequest, res, next) => {
  try {
    const workspaceId = typeof req.query.workspaceId === "string" ? req.query.workspaceId : "";
    if (!workspaceId) {
      res.status(400).json({ message: "workspaceId is required" });
      return;
    }

    const userId = requireUserId(req, res);
    if (!userId) {
      return;
    }
    const role = await getDocumentRole(userId, req.params.id, workspaceId);
    if (!canEditDocument(role)) {
      res.status(403).json({ message: "Access denied" });
      return;
    }

    const restored = await restoreFromTrash(req.params.id, workspaceId, userId);
    if (!restored) {
      res.status(404).json({ message: "Document not found" });
      return;
    }

    res.json({ documentId: req.params.id, restored: true });
  } catch (error) {
    next(error);
  }
});

documentRoutes.delete("/:id", async (req: AuthenticatedRequest, res, next) => {
  try {
    const workspaceId = typeof req.query.workspaceId === "string" ? req.query.workspaceId : "";
    if (!workspaceId) {
      res.status(400).json({ message: "workspaceId is required" });
      return;
    }

    const userId = requireUserId(req, res);
    if (!userId) {
      return;
    }
    const role = await getDocumentRole(userId, req.params.id, workspaceId);
    if (role !== "owner") {
      res.status(403).json({ message: "Access denied" });
      return;
    }

    const deleted = await permanentlyDeleteDocument(req.params.id, workspaceId, userId);
    if (!deleted) {
      res.status(404).json({ message: "Document not found" });
      return;
    }

    res.json({ documentId: req.params.id, deleted: true });
  } catch (error) {
    next(error);
  }
});

documentRoutes.patch("/:id/star", async (req: AuthenticatedRequest, res, next) => {
  try {
    const workspaceId = typeof req.query.workspaceId === "string" ? req.query.workspaceId : "";
    if (!workspaceId) {
      res.status(400).json({ message: "workspaceId is required" });
      return;
    }

    const userId = requireUserId(req, res);
    if (!userId) {
      return;
    }
    const role = await getDocumentRole(userId, req.params.id, workspaceId);
    if (!role) {
      res.status(403).json({ message: "Access denied" });
      return;
    }

    const result = await toggleStarDocument(req.params.id, userId);
    res.json({ documentId: req.params.id, isStarred: result.isStarred });
  } catch (error) {
    next(error);
  }
});

documentRoutes.patch("/:id", async (req: AuthenticatedRequest, res, next) => {
  try {
    let workspaceId = typeof req.query.workspaceId === "string" ? req.query.workspaceId : "";

    const { title, content } = req.body as {
      title?: string;
      content?: Record<string, unknown>;
    };

    const userId = req.user?.id ?? "";
    const shareToken = req.shareToken;
    const access = await validateDocumentAccessWithShare(req.params.id, userId, shareToken);

    if (!access.allowed) {
      if (access.reason === "not_found") {
        res.status(404).json({ message: "Document not found" });
        return;
      }
      res.status(403).json({ message: "Access denied" });
      return;
    }

    if (!workspaceId && access.source === "share") {
      workspaceId = access.workspaceId;
    }

    if (!workspaceId) {
      res.status(400).json({ message: "workspaceId is required" });
      return;
    }

    if (!canEditDocument(access.role)) {
      res.status(403).json({ message: "Access denied" });
      return;
    }

    const updated = await updateDocument({
      id: req.params.id,
      workspaceId,
      title: title?.trim(),
      content
    });

    if (!updated) {
      res.status(404).json({ message: "Document not found" });
      return;
    }

    if (access.source === "share" && access.shareToken && userId) {
      await autoJoinDocumentViaShare(
        req.params.id,
        userId,
        access.shareToken.token,
        access.shareToken.permissionLevel
      );
    }

    res.json({ document: updated });
  } catch (error) {
    next(error);
  }
});

// Get pending changes for a document
documentRoutes.get("/:id/pending-changes", async (req: AuthenticatedRequest, res, next) => {
  try {
    const workspaceId = typeof req.query.workspaceId === "string" ? req.query.workspaceId : "";
    if (!workspaceId) {
      res.status(400).json({ message: "workspaceId is required" });
      return;
    }

    const userId = requireUserId(req, res);
    if (!userId) {
      return;
    }
    const role = await getDocumentRole(userId, req.params.id, workspaceId);
    if (!role) {
      res.status(403).json({ message: "Access denied" });
      return;
    }

    const pendingChanges = await getPendingChanges(req.params.id, workspaceId);
    res.json({ pendingChanges });
  } catch (error) {
    next(error);
  }
});

documentRoutes.get("/:id/suggestions", async (req: AuthenticatedRequest, res, next) => {
  try {
    const workspaceId = typeof req.query.workspaceId === "string" ? req.query.workspaceId : "";
    if (!workspaceId) {
      res.status(400).json({ message: "workspaceId is required" });
      return;
    }

    const userId = requireUserId(req, res);
    if (!userId) {
      return;
    }

    const role = await getDocumentRole(userId, req.params.id, workspaceId);
    if (!role) {
      res.status(403).json({ message: "Access denied" });
      return;
    }

    const status = typeof req.query.status === "string" ? req.query.status : "pending";
    const suggestions = await listSuggestions(
      req.params.id,
      workspaceId,
      status === "all" || status === "accepted" || status === "rejected" ? status : "pending"
    );
    const pendingChanges = await getPendingSuggestionSummary(req.params.id, workspaceId);
    res.json({ suggestions, pendingChanges });
  } catch (error) {
    next(error);
  }
});

documentRoutes.post("/:id/suggestions", async (req: AuthenticatedRequest, res, next) => {
  try {
    const workspaceId = typeof req.query.workspaceId === "string" ? req.query.workspaceId : "";
    if (!workspaceId) {
      res.status(400).json({ message: "workspaceId is required" });
      return;
    }

    const userId = requireUserId(req, res);
    if (!userId) {
      return;
    }

    const role = await getDocumentRole(userId, req.params.id, workspaceId);
    if (!canEditDocument(role)) {
      res.status(403).json({ message: "Access denied" });
      return;
    }

    const { suggestionType, from, to, originalText, suggestedText, metadata } = req.body as {
      suggestionType?: "insert" | "delete" | "replace" | "format";
      from?: number;
      to?: number;
      originalText?: string | null;
      suggestedText?: string | null;
      metadata?: Record<string, unknown>;
    };

    if (!suggestionType || typeof from !== "number" || typeof to !== "number") {
      res.status(400).json({ message: "suggestionType, from, and to are required" });
      return;
    }

    const suggestion = await createSuggestion({
      documentId: req.params.id,
      workspaceId,
      authorUserId: userId,
      suggestionType,
      from,
      to,
      originalText,
      suggestedText,
      metadata
    });

    res.status(201).json({ suggestion });
  } catch (error) {
    next(error);
  }
});

documentRoutes.get("/:id/suggestions/:suggestionId", async (req: AuthenticatedRequest, res, next) => {
  try {
    const workspaceId = typeof req.query.workspaceId === "string" ? req.query.workspaceId : "";
    if (!workspaceId) {
      res.status(400).json({ message: "workspaceId is required" });
      return;
    }

    const userId = requireUserId(req, res);
    if (!userId) {
      return;
    }

    const role = await getDocumentRole(userId, req.params.id, workspaceId);
    if (!role) {
      res.status(403).json({ message: "Access denied" });
      return;
    }

    const suggestion = await getSuggestionById(req.params.suggestionId, req.params.id, workspaceId);
    if (!suggestion) {
      res.status(404).json({ message: "Suggestion not found" });
      return;
    }

    res.json({ suggestion });
  } catch (error) {
    next(error);
  }
});

documentRoutes.post("/:id/suggestions/review", async (req: AuthenticatedRequest, res, next) => {
  try {
    const workspaceId = typeof req.query.workspaceId === "string" ? req.query.workspaceId : "";
    if (!workspaceId) {
      res.status(400).json({ message: "workspaceId is required" });
      return;
    }

    const userId = requireUserId(req, res);
    if (!userId) {
      return;
    }

    const role = await getDocumentRole(userId, req.params.id, workspaceId);
    if (!canEditDocument(role)) {
      res.status(403).json({ message: "Access denied" });
      return;
    }

    const { action, suggestionIds, authorUserIds } = req.body as {
      action?: "accept" | "reject";
      suggestionIds?: string[];
      authorUserIds?: string[];
    };

    if (action !== "accept" && action !== "reject") {
      res.status(400).json({ message: "action must be accept or reject" });
      return;
    }

    if (Array.isArray(suggestionIds) && suggestionIds.length > 0) {
      const suggestions = action === "accept"
        ? await acceptSuggestions(suggestionIds, req.params.id, workspaceId, userId)
        : await rejectSuggestions(suggestionIds, req.params.id, workspaceId, userId);
      res.json({ suggestions, resolvedCount: suggestions.length });
      return;
    }

    if (Array.isArray(authorUserIds) && authorUserIds.length > 0) {
      const resolvedCount = await resolveSuggestionsByAuthor(
        authorUserIds,
        req.params.id,
        workspaceId,
        action === "accept" ? "accepted" : "rejected",
        userId
      );
      res.json({ resolvedCount });
      return;
    }

    res.status(400).json({ message: "suggestionIds or authorUserIds are required" });
  } catch (error) {
    next(error);
  }
});

// Get document history/versions
documentRoutes.get("/:id/history", async (req: AuthenticatedRequest, res, next) => {
  try {
    let workspaceId = typeof req.query.workspaceId === "string" ? req.query.workspaceId : "";
    const userId = req.user?.id ?? "";
    const shareToken = req.shareToken;

    logger.info(`[History] Fetching history for document=${req.params.id}, workspace=${workspaceId}, user=${userId}`);

    const access = await validateDocumentAccessWithShare(req.params.id, userId, shareToken);
    if (!access.allowed) {
      if (access.reason === "not_found") {
        res.status(404).json({ message: "Document not found" });
        return;
      }
      res.status(403).json({ message: "Access denied" });
      return;
    }

    if (!workspaceId && access.source === "share") {
      workspaceId = access.workspaceId;
    }

    if (!workspaceId) {
      res.status(400).json({ message: "workspaceId is required" });
      return;
    }

    logger.info(`[History] Access granted, fetching versions for document=${req.params.id}, workspace=${workspaceId}`);
    const versions = await getDocumentVersions(req.params.id, workspaceId);
    logger.info(`[History] Found ${versions.length} versions for document=${req.params.id}`);
    res.json({ versions });
  } catch (error) {
    logger.error(`[History] Error fetching history for document=${req.params.id}:`, error);
    next(error);
  }
});

// Restore document to a specific version
documentRoutes.post("/:id/restore", async (req: AuthenticatedRequest, res, next) => {
  try {
    let workspaceId = typeof req.query.workspaceId === "string" ? req.query.workspaceId : "";
    
    const { versionNumber } = req.body as { versionNumber: number };
    if (typeof versionNumber !== "number" || versionNumber < 1) {
      res.status(400).json({ message: "versionNumber must be a positive integer" });
      return;
    }

    const userId = req.user?.id ?? "";
    const shareToken = req.shareToken;
    const access = await validateDocumentAccessWithShare(req.params.id, userId, shareToken);

    if (!access.allowed) {
      if (access.reason === "not_found") {
        res.status(404).json({ message: "Document not found" });
        return;
      }
      res.status(403).json({ message: "Access denied" });
      return;
    }

    if (!workspaceId && access.source === "share") {
      workspaceId = access.workspaceId;
    }

    if (!workspaceId) {
      res.status(400).json({ message: "workspaceId is required" });
      return;
    }

    if (!canEditDocument(access.role)) {
      res.status(403).json({ message: "Access denied" });
      return;
    }

    const restoredContent = await restoreDocumentVersion(
      req.params.id,
      versionNumber,
      workspaceId
    );

    res.json({
      documentId: req.params.id,
      versionNumber,
      restored: true,
      content: restoredContent,
      message: `Document restored to version ${versionNumber}`
    });
  } catch (error) {
    next(error);
  }
});

// Save document with optional change application
documentRoutes.post("/:id/save", async (req: AuthenticatedRequest, res, next) => {
  try {
    let workspaceId = typeof req.query.workspaceId === "string" ? req.query.workspaceId : "";
    const userId = req.user?.id ?? "";
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const shareToken = req.shareToken;
    const access = await validateDocumentAccessWithShare(req.params.id, userId, shareToken);
    if (!access.allowed) {
      if (access.reason === "not_found") {
        res.status(404).json({ message: "Document not found" });
        return;
      }
      res.status(403).json({ message: "Access denied" });
      return;
    }

    if (!workspaceId && access.source === "share") {
      workspaceId = access.workspaceId;
    }

    if (!workspaceId) {
      res.status(400).json({ message: "workspaceId is required" });
      return;
    }

    if (!canEditDocument(access.role)) {
      res.status(403).json({ message: "Access denied" });
      return;
    }

    const { applyPendingChanges, specificUserChanges, title, content } = req.body as {
      applyPendingChanges?: boolean;
      specificUserChanges?: string[];
      title?: string;
      content?: Record<string, unknown>;
    };

    let appliedCount = 0;
    if (applyPendingChanges) {
      if (specificUserChanges && specificUserChanges.length > 0) {
        // Apply specific user's changes
        for (const targetUserId of specificUserChanges) {
          const count = await markChangesApplied(req.params.id, targetUserId, workspaceId);
          appliedCount += count;
        }
      } else {
        // Apply all pending changes
        appliedCount = await markAllChangesApplied(req.params.id, workspaceId);
      }
    }

    let versionSourceDocument = await getDocumentById(req.params.id, workspaceId, userId);
    if (!versionSourceDocument) {
      res.status(404).json({ message: "Document not found" });
      return;
    }

    if (typeof title !== "undefined" || typeof content !== "undefined") {
      const updated = await updateDocument({
        id: req.params.id,
        workspaceId,
        title: title?.trim(),
        content
      });

      if (!updated) {
        res.status(404).json({ message: "Document not found" });
        return;
      }
      versionSourceDocument = updated;
    }

    if (access.source === "share" && access.shareToken && userId) {
      await autoJoinDocumentViaShare(
        req.params.id,
        userId,
        access.shareToken.token,
        access.shareToken.permissionLevel
      );
    }

    const version = await createDocumentVersion(
      versionSourceDocument.id,
      versionSourceDocument.title,
      versionSourceDocument.content,
      userId,
      workspaceId
    );

    res.json({
      documentId: req.params.id,
      saved: true,
      versionNumber: version.versionNumber,
      versionCreatedAt: version.createdAt,
      versionCreatedBy: version.createdBy,
      appliedChanges: appliedCount,
      message: `Version saved${appliedCount > 0 ? ` with ${appliedCount} pending changes applied` : ""}`
    });
  } catch (error) {
    next(error);
  }
});
