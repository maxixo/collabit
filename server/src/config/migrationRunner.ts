import fs from "node:fs/promises";
import path from "node:path";
import type { Pool } from "pg";
import { logger } from "../utils/logger.js";

export interface MigrationStatus {
  filename: string;
  appliedAt: Date | null;
}

interface MigrationOptions {
  directory: string;
  initializeAuth?: () => Promise<void>;
}

// A session lock covers auth and application migrations across cooperating processes.
const MIGRATION_LOCK = [734021, 1];

export const createMigrationRunner = (pool: Pool, options: MigrationOptions) => {
  const readFiles = async () => {
    const entries = await fs.readdir(options.directory, { withFileTypes: true });
    const filenames = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
      .map((entry) => entry.name)
      .sort();

    if (filenames.length === 0) {
      throw new Error(`No SQL migration files found in ${options.directory}`);
    }
    const prefixes = new Set<string>();
    for (const filename of filenames) {
      const match = /^(\d+)_[a-zA-Z0-9_]+\.sql$/.exec(filename);
      if (!match) {
        throw new Error(`Invalid migration filename: ${filename}`);
      }
      const prefix = BigInt(match[1]).toString();
      if (prefixes.has(prefix)) {
        throw new Error(`Duplicate migration number: ${filename}`);
      }
      prefixes.add(prefix);
    }

    // Read every asset before opening a connection or changing schema.
    return Promise.all(filenames.map(async (filename) => ({
      filename,
      sql: await fs.readFile(path.join(options.directory, filename), "utf8")
    })));
  };

  const status = async (): Promise<MigrationStatus[]> => {
    const files = await readFiles();
    const { rows } = await pool.query<{ present: string | null }>(
      "SELECT to_regclass('public.schema_migrations')::text AS present"
    );
    const applied = rows[0]?.present
      ? (await pool.query<{ filename: string; applied_at: Date }>(
          "SELECT filename, applied_at FROM public.schema_migrations ORDER BY filename"
        )).rows
      : [];
    const timestamps = new Map(applied.map((row) => [row.filename, row.applied_at]));
    return files.map(({ filename }) => ({ filename, appliedAt: timestamps.get(filename) ?? null }));
  };

  const run = async (throughFilename?: string): Promise<number> => {
    const files = await readFiles();
    const target = throughFilename === undefined
      ? files.length - 1
      : files.findIndex((file) => file.filename === throughFilename);
    if (target < 0) {
      throw new Error(`Unknown migration: ${throughFilename}`);
    }

    const client = await pool.connect();
    let locked = false;
    let appliedCount = 0;
    try {
      await client.query("SELECT pg_advisory_lock($1, $2)", MIGRATION_LOCK);
      locked = true;
      await options.initializeAuth?.();
      await client.query(`
        CREATE TABLE IF NOT EXISTS public.schema_migrations (
          filename TEXT PRIMARY KEY,
          applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);

      for (const { filename, sql } of files.slice(0, target + 1)) {
        const { rowCount } = await client.query(
          "SELECT 1 FROM public.schema_migrations WHERE filename = $1", [filename]
        );
        if (rowCount) {
          continue;
        }
        await client.query("BEGIN");
        try {
          await client.query(sql);
          await client.query(
            "INSERT INTO public.schema_migrations (filename) VALUES ($1)", [filename]
          );
          await client.query("COMMIT");
        } catch (error) {
          await client.query("ROLLBACK");
          throw new Error(`Migration failed: ${filename}`, { cause: error });
        }
        appliedCount += 1;
        logger.info(`Migration applied: ${filename}`);
      }
      logger.info(`Migrations completed. Applied ${appliedCount} new migration(s)`);
      return appliedCount;
    } finally {
      try {
        if (locked) {
          await client.query("SELECT pg_advisory_unlock($1, $2)", MIGRATION_LOCK);
        }
      } finally {
        // Never return a session with an uncertain transaction or held lock to the pool.
        client.release(true);
      }
    }
  };

  return { run, status };
};
