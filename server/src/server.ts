import http from "http";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { initWebSocketServer } from "./websocket/index.js";
import { logger } from "./utils/logger.js";
import { runAuthMigrations } from "./auth.js";
import { runMigrations } from "./config/migrations.js";
import { checkDatabaseConnection, db } from "./config/db.js";

const startServer = async () => {
  try {
    // Run auth migrations first (creates user tables)
    await runAuthMigrations();
    
    // Run document migrations (creates document tables)
    await runMigrations();
    
    // Verify database connection and required tables
    await checkDatabaseConnection();
    
    logger.info("Database migrations completed successfully");
  } catch (error) {
    logger.error("Database initialization failed", error);
    throw error;
  }

  const app = createApp();
  const server = http.createServer(app);

  initWebSocketServer(server);
  server.requestTimeout = env.requestTimeoutMs;
  server.headersTimeout = env.headersTimeoutMs;
  server.keepAliveTimeout = 5_000;

  server.listen(env.port, () => {
    logger.info(`Server listening on port ${env.port}`);
  });

  let isShuttingDown = false;
  const shutdown = async (signal: string) => {
    if (isShuttingDown) {
      return;
    }
    isShuttingDown = true;
    logger.info(`Received ${signal}. Shutting down...`);

    try {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
      await db.end();
      logger.info("Shutdown complete");
      process.exit(0);
    } catch (error) {
      logger.error("Shutdown failed", error);
      process.exit(1);
    }
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
};

startServer().catch((error) => {
  logger.error("Failed to start server", error);
  process.exit(1);
});
