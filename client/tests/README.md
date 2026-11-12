# Isolated MVP tests

`npm test` also runs IndexedDB ownership/search and late-response regressions using `fake-indexeddb`. The browser account-isolation case exercises real IndexedDB, cookies, API requests, and A -> B -> A queued replay. Legacy `collab-editor` data is never assigned to a new login; Profile offers a deliberate unassigned export instead.

The recovery suite checks durable local/server conflicts after reload, download preservation, rejected and acknowledged duplicate requests, explicit reload-server resolution, 401/403 retry from Profile, and navigation before the autosave debounce. Queue regressions cover transient outages and edits made during an in-flight save. To recover work manually, open Profile > Local drafts. Downloading keeps the draft; Retry sync checks the current server version again; Discard draft removes that local snapshot after confirmation.

Run `npm ci` from the repository root, then install the locked browser revision:

```sh
npx playwright install chromium --only-shell
npm run test:stack
```

The runner builds the application, initializes auth/application migrations, starts the API and Vite preview on temporary loopback ports, runs Playwright, and cleans up its own processes and database. It never uses `DATABASE_URL`, `PLAYWRIGHT_BASE_URL`, or `PLAYWRIGHT_API_BASE_URL` from a developer environment to select an existing application.

Locally, PostgreSQL tools (`pg_config`, `initdb`, `pg_ctl`) must be installed. Set `PG_BIN` if needed. A temporary cluster is created under the OS temporary directory with a loopback-only listener. CI instead supplies `TEST_DATABASE_ADMIN_URL` for a disposable local PostgreSQL service. The runner rejects non-local admin hosts and creates/drops only a unique `mvp_stack_<uuid>` database; it never resets the database named in the admin connection URL.

CI uses Ubuntu 24.04, supported by the locked Playwright release. Keep the runner pinned until the browser dependency supports a newer Ubuntu image; `ubuntu-latest` can move ahead of that support.

Pass Playwright filters after `--`, for example `npm run test:stack -- --grep "API"`. For frontend-only debugging after a successful backend build, `--reuse-server-build` skips rebuilding the unchanged backend while rebuilding the frontend with the new test URLs. Default/CI runs always build everything. Each invocation uses fresh fixtures and a fresh database. Tests create unique users/documents through real HTTP endpoints.

Failure evidence is retained in `client/test-results/` (trace, screenshots, video), `client/playwright-report/`, and `test-results/stack.log`. CI uploads those directories. Browser tests block service workers until C11 repairs the production worker, so these tests currently validate IndexedDB/application offline behavior rather than service-worker offline startup.

Normal failures and termination signals clean up owned resources. A forced OS kill can leave a temporary PostgreSQL cluster; identify its `collabit-stack-*` directory and use `pg_ctl -D <directory>/data -m fast -w stop` before removing that exact temporary directory. Never stop or remove an unrelated PostgreSQL installation/data directory.
