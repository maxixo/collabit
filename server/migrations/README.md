# Database migrations

Run commands below from the repository root. Development loads `server/.env`; production should inject backend variables. `DATABASE_URL` is required by the CLI. Production also requires the normal backend auth/origin/secret settings.

## Commands

```sh
# Inspect application migration status; safe on an empty database.
npm run migrations:status --workspace server

# Initialize Better Auth and apply all pending application migrations, then exit.
npm run migrations:run --workspace server

# Apply through a named migration, including all earlier prerequisites.
npm run migrations:run --workspace server -- 004_add_soft_delete.sql

# After building, run the production CLI without tsx/development dependencies.
npm run build --workspace server
npm run migrations:run:prod --workspace server
npm run migrations:status:prod --workspace server
```

`scripts/migrate.sh` forwards arguments to the source CLI from any working directory. The server's prebuild/pretypecheck hooks build shared declarations, and its explicit source root emits `dist/server.js` and `dist/migrate.js`. Keep `server/migrations/` beside `dist/` in the packaged runtime. Missing/unreadable directories and an empty SQL asset set fail instead of silently claiming success.

Status lists application files as pending/applied without creating tables or running Better Auth. `run` initializes Better Auth under the same session lock before applying application SQL. Successful commands close the shared auth/application pool and exit without starting HTTP or WebSockets. Failures set a nonzero exit code.

## Startup behavior

`npm run dev` keeps automatic auth/application initialization when `NODE_ENV=development`. In production and test, startup rejects pending application migrations and missing auth/document tables without applying migrations. Run the one-shot migration command successfully before starting the API:

```sh
npm run migrations:run:prod --workspace server
npm run start --workspace server
```

## Ordering, concurrency, and failure recovery

- Name files with a unique, zero-padded numeric prefix, such as `009_add_revision.sql`. Files run in filename order. Duplicate numeric prefixes and unknown/path-traversal targets are rejected.
- A PostgreSQL session advisory lock `(734021, 1)` serializes cooperating CLI/development runners across auth and application initialization. The lock is held on one dedicated connection throughout the run. Legacy runners that do not acquire this lock must not run concurrently.
- Each application SQL file and its `schema_migrations` insert share one transaction. A failure rolls back both; earlier successful files remain applied. Fix the underlying problem and rerun: recorded files are skipped.
- Better Auth uses its own schema initialization operations. Those operations are covered by the cross-process lock but are not part of an application file's transaction. An application failure does not roll back completed auth initialization.
- Do not put `BEGIN`, `COMMIT`, or `ROLLBACK` inside application migration files. Do not use operations that cannot run in a transaction, such as `CREATE INDEX CONCURRENTLY`, without a separately reviewed migration design.
- Read/review SQL changes before running them. The migration runner executes trusted repository SQL; it is not a sandbox for uploaded SQL.

## Existing databases and rollback

C02 changes orchestration, not the existing SQL schema files. Existing `schema_migrations(filename, applied_at)` rows and timestamps remain valid. Application migrations `000` through `008` are unchanged. The upgrade regression starts with migrations `000` through `004`, adds a document and membership, then verifies the remaining migrations preserve them and earlier tracking timestamps.

Before upgrading a real database, take and verify a backup. Stop legacy processes that automatically migrate, run the new one-shot CLI, then start the API. Application rollback does not undo schema changes: only revert to code known to be compatible with the installed schema. Prefer a reviewed forward migration for corrections. Restore a backup into a separate database if a data/schema rollback is required; do not delete tracking rows and blindly rerun SQL against valuable data.

Older runners could execute SQL and fail before recording it. If such partial state already exists, inspect it and repair it explicitly before upgrading; the new runner cannot retroactively make legacy operations atomic.

## Regression tests

Build the backend first, then set `MIGRATION_TEST_DATABASE_URL` to a **local disposable PostgreSQL admin connection** and run:

```sh
npm run test:migrations --workspace server
```

The suite creates uniquely named `mvp_migrations_*` databases, exercises the real compiled CLI and transaction behavior, and drops only those generated databases. It rejects non-local admin hosts and never resets the database named in the connection URL. Use a dedicated local test cluster/account with database-creation permission; never supply a production connection.

Coverage includes empty status, auth/application setup, repeat runs, concurrent processes, transaction and tracking failure recovery, missing assets, selected-target prerequisites, upgrade preservation, and CLI process exit. CI provides disposable PostgreSQL 16; local C02 verification also exercises PostgreSQL 18.
