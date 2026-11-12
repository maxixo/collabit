import { fileURLToPath } from "node:url";
import { db } from "./db.js";
import { createMigrationRunner } from "./migrationRunner.js";

const runner = createMigrationRunner(db, {
  directory: fileURLToPath(new URL("../../migrations/", import.meta.url)),
  initializeAuth: async () => {
    const { runAuthMigrations } = await import("../auth.js");
    await runAuthMigrations();
  }
});

// Both entry points initialize auth while holding the same migration session lock.
export const runMigrations = async (): Promise<void> => {
  await runner.run();
};

export const runMigration = async (filename: string): Promise<void> => {
  await runner.run(filename);
};

export const getMigrationStatus = runner.status;

export const getAppliedMigrations = async () => {
  return (await runner.status())
    .filter((migration) => migration.appliedAt !== null)
    .map((migration) => ({ filename: migration.filename, applied_at: migration.appliedAt! }));
};
