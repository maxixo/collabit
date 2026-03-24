import { Router, type Response } from "express";
import { authMiddleware, type AuthenticatedRequest } from "../middlewares/auth.middleware.js";
import { validateProfileUpdatePayload } from "./profile.validation.js";
import { getUserById, listUsers, updateUserById } from "../services/user.service.js";

export const userRoutes = Router();

const requireUserId = (req: AuthenticatedRequest, res: Response): string | null => {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ message: "Unauthorized" });
    return null;
  }
  return userId;
};

userRoutes.use(authMiddleware);

userRoutes.get("/", async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!requireUserId(req, res)) {
      return;
    }

    const limitParam = typeof req.query.limit === "string" ? req.query.limit : "";
    const parsedLimit = Number(limitParam);
    const limit = Number.isFinite(parsedLimit) ? parsedLimit : 50;

    const users = await listUsers(limit);
    res.json({ users });
  } catch (error) {
    next(error);
  }
});

userRoutes.patch("/me", async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) {
      return;
    }

    const validation = validateProfileUpdatePayload(req.body);
    if (!validation.ok) {
      res.status(400).json({ message: validation.message });
      return;
    }

    const user = await updateUserById(userId, validation.data);
    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image
      }
    });
  } catch (error) {
    next(error);
  }
});

userRoutes.get("/:id", async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!requireUserId(req, res)) {
      return;
    }

    const userId = typeof req.params.id === "string" ? req.params.id.trim() : "";
    if (!userId) {
      res.status(400).json({ message: "id is required" });
      return;
    }

    const user = await getUserById(userId);
    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    res.json({ user });
  } catch (error) {
    next(error);
  }
});
