import { db } from "./config/db.js";
import { env } from "./config/env.js";
import { getMigrationStatus, runMigration, runMigrations } from "./config/migrations.js";
import { logger } from "./utils/logger.js";

const main = async () => {
  const [command, filename, ...extra] = process.argv.slice(2);
  try {
    if (command === "help" || command === "--help") {
      console.info("Usage: migrate <run [filename.sql] | status>");
      return;
    }
    if (!["run", "status"].includes(command ?? "") || extra.length || (command === "status" && filename)) {
      throw new Error("Usage: migrate <run [filename.sql] | status>");
    }
    if (!env.databaseUrl) {
      throw new Error("DATABASE_URL is required for migration commands.");
    }
    if (command === "run") {
      if (filename) {
        await runMigration(filename);
      } else {
        await runMigrations();
      }
    } else {
      const migrations = await getMigrationStatus();
      for (const migration of migrations) {
        console.info(`${migration.appliedAt ? "applied" : "pending"} ${migration.filename}`);
      }
      const applied = migrations.filter((migration) => migration.appliedAt !== null).length;
      console.info(`${applied} applied, ${migrations.length - applied} pending`);
    }
  } catch (error) {
    logger.error("Migration command failed", error);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
};

void main().catch((error) => {
  logger.error("Failed to close migration resources", error);
  process.exitCode = 1;
});
