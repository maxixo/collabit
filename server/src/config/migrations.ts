import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { db } from "./db.js";
import { logger } from "../utils/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface MigrationRecord {
  filename: string;
  applied_at: Date;
}

/**
 * Create the migrations table if it doesn't exist
 */
const createMigrationsTable = async (): Promise<void> => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
};

/**
 * Check if a migration has been applied
 */
const isMigrationApplied = async (filename: string): Promise<boolean> => {
  const { rows } = await db.query(
    "SELECT 1 FROM schema_migrations WHERE filename = $1",
    [filename]
  );
  return rows.length > 0;
};

/**
 * Mark a migration as applied
 */
const markMigrationApplied = async (filename: string): Promise<void> => {
  await db.query(
    "INSERT INTO schema_migrations (filename, applied_at) VALUES ($1, NOW())",
    [filename]
  );
};

/**
 * Execute a SQL migration file
 */
const executeMigration = async (sql: string, filename: string): Promise<void> => {
  try {
    await db.query(sql);
    await markMigrationApplied(filename);
    logger.info(`Migration applied: ${filename}`);
  } catch (error) {
    logger.error(`Failed to apply migration: ${filename}`, error);
    throw error;
  }
};

/**
 * Read all SQL migration files from the migrations directory
 */
const getMigrationFiles = async (): Promise<string[]> => {
  const migrationsDir = path.join(__dirname, "../../migrations");
  try {
    const files = await fs.readdir(migrationsDir);
    // Filter for .sql files and sort them
    return files
      .filter((file) => file.endsWith(".sql"))
      .sort();
  } catch {
    logger.warn("Migrations directory not found or inaccessible");
    return [];
  }
};

/**
 * Run all pending migrations
 */
export const runMigrations = async (): Promise<void> => {
  try {
    logger.info("Running database migrations...");
    
    await createMigrationsTable();
    
    const migrationFiles = await getMigrationFiles();
    
    if (migrationFiles.length === 0) {
      logger.info("No migration files found");
      return;
    }

    let appliedCount = 0;
    for (const filename of migrationFiles) {
      const alreadyApplied = await isMigrationApplied(filename);
      
      if (alreadyApplied) {
        logger.info(`Migration already applied: ${filename}`);
        continue;
      }

      const migrationPath = path.join(__dirname, "../../migrations", filename);
      const sql = await fs.readFile(migrationPath, "utf-8");
      
      await executeMigration(sql, filename);
      appliedCount++;
    }

    logger.info(`Migrations completed. Applied ${appliedCount} new migration(s)`);
  } catch (error) {
    logger.error("Migration failed", error);
    throw error;
  }
};

/**
 * Get list of applied migrations
 */
export const getAppliedMigrations = async (): Promise<MigrationRecord[]> => {
  const { rows } = await db.query(
    "SELECT filename, applied_at FROM schema_migrations ORDER BY applied_at"
  );
  return rows;
};

/**
 * Run a specific migration by filename
 */
export const runMigration = async (filename: string): Promise<void> => {
  logger.info(`Running migration: ${filename}`);
  
  const alreadyApplied = await isMigrationApplied(filename);
  if (alreadyApplied) {
    logger.info(`Migration already applied: ${filename}`);
    return;
  }

  const migrationPath = path.join(__dirname, "../../migrations", filename);
  const sql = await fs.readFile(migrationPath, "utf-8");
  
  await executeMigration(sql, filename);
};
