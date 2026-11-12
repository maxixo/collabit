# Server Tests

The server test suite runs through the workspace test script:

```bash
npm run test --workspace server
```

Current coverage focuses on the Phase 1 public-release hardening work:

- profile payload validation
- workspace naming fallback behavior

## Migration integration tests

Build the backend, set `MIGRATION_TEST_DATABASE_URL` to a local disposable PostgreSQL admin connection, then run:

```sh
npm run build --workspace server
npm run test:migrations --workspace server
```

The suite creates and removes only unique `mvp_migrations_*` databases. It tests production startup refusing pending schema, the real compiled CLI, auth/application initialization, concurrent runners, atomic migration tracking, failure/retry, upgrade preservation, asset failures, and process exit. It requires database-creation permission and rejects non-local hosts. It is separate from helper tests so `npm test` does not accidentally use a developer's database. CI runs both suites.

See [migration commands and recovery](../migrations/README.md) for setup and compatibility details.
