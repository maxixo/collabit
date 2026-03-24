import { Router, type Response } from "express";
import { authMiddleware, type AuthenticatedRequest } from "../middlewares/auth.middleware.js";
import { getWorkspaceSummary } from "../services/workspace.service.js";

export const workspaceRoutes = Router();

const requireUserId = (req: AuthenticatedRequest, res: Response): string | null => {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ message: "Unauthorized" });
    return null;
  }
  return userId;
};

workspaceRoutes.use(authMiddleware);

workspaceRoutes.get("/:id", async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) {
      return;
    }

    const workspaceId = typeof req.params.id === "string" ? req.params.id.trim() : "";
    if (!workspaceId) {
      res.status(400).json({ message: "workspaceId is required" });
      return;
    }

    const workspace = await getWorkspaceSummary(workspaceId, userId);
    res.json({ workspace });
  } catch (error) {
    next(error);
  }
});
