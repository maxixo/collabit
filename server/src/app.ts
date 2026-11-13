import express from "express";
import cors from "cors";
import helmet from "helmet";
import { authRoutes } from "./api/auth.routes.js";
import { documentRoutes } from "./api/document.routes.js";
import { presenceRoutes } from "./api/presence.routes.js";
import { userRoutes } from "./api/user.routes.js";
import { workspaceRoutes } from "./api/workspace.routes.js";
import { db } from "./config/db.js";
import { env } from "./config/env.js";
import { errorMiddleware } from "./middlewares/error.middleware.js";
import { isDraining } from "./serverState.js";

export const createApp = () => {
  const app = express();
  const documentWindows = new Map<string, { start: number; count: number }>();
  const allowAnyOrigin = !env.isProduction && env.corsOrigins.length === 0;

  app.disable("x-powered-by");
  if (env.trustProxy) {
    app.set("trust proxy", 1);
  }
  app.use(helmet());
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) {
          callback(null, true);
          return;
        }
        if (allowAnyOrigin) {
          callback(null, true);
          return;
        }
        callback(null, env.corsOrigins.includes(origin));
      },
      methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
      credentials: true
    })
  );
  app.use(express.json({ limit: env.apiBodyLimit }));
  app.use(express.urlencoded({ extended: false, limit: env.apiBodyLimit }));

  app.use((req, res, next) => {
    if (isDraining() && (req.path === "/ready" || req.path.startsWith("/api/"))) {
      res.status(503).json({ status: "draining" });
      return;
    }
    next();
  });

  app.use((req, res, next) => {
    if (!req.path.startsWith("/api/documents")) { next(); return; }
    const now = Date.now();
    const key = req.ip || req.socket.remoteAddress || "unknown";
    let window = documentWindows.get(key);
    if (!window || now - window.start >= 60_000) {
      window = { start: now, count: 0 };
      documentWindows.set(key, window);
    }
    window.count++;
    if (window.count > 180) {
      res.setHeader("Retry-After", "60");
      res.status(429).json({ message: "Document API rate limit exceeded" });
      return;
    }
    if (documentWindows.size > 10_000) {
      for (const [ip, value] of documentWindows) if (now - value.start >= 60_000) documentWindows.delete(ip);
    }
    next();
  });

  app.get("/", (_req, res) => {
    res.json({
      service: "collab-api",
      status: "ok",
      health: "/health"
    });
  });

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/ready", async (_req, res) => {
    if (isDraining()) { res.status(503).json({ status: "draining" }); return; }
    try {
      await db.query("SELECT 1");
      res.json({ status: "ready" });
    } catch {
      res.status(503).json({ status: "degraded" });
    }
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/documents", documentRoutes);
  app.use("/api/presence", presenceRoutes);
  app.use("/api/users", userRoutes);
  app.use("/api/workspaces", workspaceRoutes);

  app.use(errorMiddleware);

  return app;
};
