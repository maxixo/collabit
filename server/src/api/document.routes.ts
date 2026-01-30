import { randomUUID } from "crypto";
import { Router } from "express";
import type { DocumentModel } from "../models/document.model.js";
import { authMiddleware, type AuthenticatedRequest } from "../middlewares/auth.middleware.js";
import {
  createDocument,
  emptyTrash,
  getDocumentById,
  getStarredDocuments,
  getTrashDocuments,
  listDocuments,
  moveToTrash,
  permanentlyDeleteDocument,
  restoreFromTrash,
  toggleStarDocument,
  updateDocument
} from "../services/document.service.js";
import { canEditDocument, getDocumentRole } from "../services/permission.service.js";

export const documentRoutes = Router();

const DEFAULT_DOCUMENT_CONTENT = {
  type: "doc",
  content: [{ type: "paragraph" }]
};

documentRoutes.use(authMiddleware);

documentRoutes.get("/", async (req: AuthenticatedRequest, res, next) => {
  try {
    const workspaceId = typeof req.query.workspaceId === "string" ? req.query.workspaceId : "";
    if (!workspaceId) {
      res.status(400).json({ message: "workspaceId is required" });
      return;
    }

    const userId = req.user?.id ?? "";
    const documents = await listDocuments(workspaceId, userId);
    res.json({ documents });
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

    const documentId = typeof id === "string" && id.trim().length > 0 ? id.trim() : randomUUID();
    const document: DocumentModel = {
      id: documentId,
      title: title?.trim() || "Untitled document",
      content: content ?? DEFAULT_DOCUMENT_CONTENT,
      updatedAt: new Date().toISOString(),
      ownerId: req.user?.id ?? "",
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

    const userId = req.user?.id ?? "";
    const documents = await getStarredDocuments(workspaceId, userId);
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

    const userId = req.user?.id ?? "";
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

    const userId = req.user?.id ?? "";
    const deletedCount = await emptyTrash(workspaceId, userId);
    res.json({ deletedCount });
  } catch (error) {
    next(error);
  }
});

documentRoutes.get("/:id", async (req: AuthenticatedRequest, res, next) => {
  try {
    const workspaceId = typeof req.query.workspaceId === "string" ? req.query.workspaceId : "";
    if (!workspaceId) {
      res.status(400).json({ message: "workspaceId is required" });
      return;
    }

    const userId = req.user?.id ?? "";
    const role = await getDocumentRole(userId, req.params.id, workspaceId);
    if (!role) {
      res.status(403).json({ message: "Access denied" });
      return;
    }

    const document = await getDocumentById(req.params.id, workspaceId, userId);
    if (!document) {
      res.status(404).json({ message: "Document not found" });
      return;
    }

    res.json({ document });
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

    const userId = req.user?.id ?? "";
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

    const userId = req.user?.id ?? "";
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

    const userId = req.user?.id ?? "";
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

    const userId = req.user?.id ?? "";
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
    const workspaceId = typeof req.query.workspaceId === "string" ? req.query.workspaceId : "";
    if (!workspaceId) {
      res.status(400).json({ message: "workspaceId is required" });
      return;
    }

    const { title, content } = req.body as {
      title?: string;
      content?: Record<string, unknown>;
    };

    const userId = req.user?.id ?? "";
    const role = await getDocumentRole(userId, req.params.id, workspaceId);
    if (!canEditDocument(role)) {
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

    res.json({ document: updated });
  } catch (error) {
    next(error);
  }
});
