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

export const createApp = () => {
  const app = express();
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
