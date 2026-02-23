#!/usr/bin/env node
/**
 * Migration Runner Script
 * 
 * This script allows you to run database migrations independently of the server.
 * Useful for deployment and development scenarios.
 * 
 * Usage:
 *   npm run migrations:run           # Run all pending migrations
 *   npm run migrations:status        # Show migration status
 *   npm run migrations:run 001      # Run specific migration
 */

import { runMigrations, getAppliedMigrations, runMigration } from "../src/config/migrations.js";
import { logger } from "../src/utils/logger.js";
import { db } from "../src/config/db.js";

const command = process.argv[2];

async function main() {
  try {
    switch (command) {
      case "status":
        await showMigrationStatus();
        break;
      
      case "run": {
        const migrationFile = process.argv[3];
        if (migrationFile) {
          await runMigration(migrationFile);
        } else {
          await runMigrations();
        }
        break;
      }
      
      default:
        console.log(`
Migration Runner
================

Usage:
  npm run migrations:run           Run all pending migrations
  npm run migrations:status        Show migration status
  npm run migrations:run <file>    Run specific migration by filename

Examples:
  npm run migrations:run                    # Run all pending migrations
  npm run migrations:status                # Show which migrations have been applied
  npm run migrations:run 001_create_documents.sql  # Run specific migration
        `);
        process.exit(0);
    }
    
    // Close database connection
    await db.end();
    process.exit(0);
  } catch (error) {
    logger.error("Migration script failed", error);
    await db.end().catch(() => {});
    process.exit(1);
  }
}

async function showMigrationStatus() {
  const applied = await getAppliedMigrations();
  
  console.log("\n=== Migration Status ===\n");
  
  if (applied.length === 0) {
    console.log("No migrations have been applied yet.\n");
  } else {
    console.log(`Applied migrations (${applied.length}):\n`);
    applied.forEach((migration) => {
      console.log(`  ✓ ${migration.filename}`);
      console.log(`    Applied: ${migration.applied_at}\n`);
    });
  }
  
  console.log("Migration file location: server/migrations/\n");
}

main();
