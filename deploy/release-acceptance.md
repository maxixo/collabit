# MVP release acceptance record

**Recorded:** 16 November 2026
**Branch:** `mvp/c09-c11`
**Result:** Local acceptance gates pass; the MVP is not yet cleared for public production traffic.

## Verified locally

| Gate | Result | Evidence |
| --- | --- | --- |
| Quality gate | Pass | `npm run ci:check`: client/server lint, all workspace typechecks and unit tests, and production builds passed. Existing six Fast Refresh warnings, stale Browserslist data, and the >500 kB editor vendor chunk warning remain. |
| Browser and API acceptance | Pass | Final `npm run test:stack`: all 24 Chromium cases passed against production-built assets and an isolated PostgreSQL database. Covers account isolation, auth/recovery, collaboration, revision/retry safety, permissions, malformed inputs, editor regressions, offline conflict recovery, service-worker reload, and mobile/dialog behavior. |
| Server integration/lifecycle | Pass | The isolated stack passed all nine document and lifecycle integration checks, including durable collaboration after restart, blocked-write shutdown deadline, and database write failure/retry. |
| Backup and restore rehearsal | Pass | The test stack made a custom-format `pg_dump`, restored it to a separately named disposable database, compared users/documents/members/versions/suggestions row counts, started the compiled API on the restored database, and confirmed `/health` and `/ready`. The disposable database was removed afterward. |
| Readiness degradation | Pass | With the isolated PostgreSQL service stopped after checks, `/health` remained 200 and `/ready` returned 503. The API logged idle pool errors as redacted JSON and remained alive. |
| Frontend production URLs and deep links | Pass | Built with `VITE_API_BASE_URL=https://api.example.com` and `VITE_WS_URL=wss://api.example.com/ws`; verified both values in emitted JS, `service-worker.js`, and preview app-shell responses for `/`, `/signin`, `/editor/recent`, `/profile`, and `/trash`. |
| Dependency advisory review | Pass | `npm audit --audit-level=high` reported 0 vulnerabilities across the locked dependency tree. |
| Packaging static checks | Pass | `vercel.json` and production Compose YAML parsed; backup/restore Bash scripts passed `bash -n`; `git diff --check` passed. |

## Required before public traffic

| Gate | Status | Required check |
| --- | --- | --- |
| Production backend image | Not verified | Docker-compatible tooling was unavailable here. On the VPS, run Compose config/build, inspect the runtime image for expected runtime and migration assets, run the one-shot migration service, start the single API process, and confirm health/readiness. |
| TLS reverse proxy | Not verified | Install the Nginx template with the real domain/certificate, run `nginx -t`, then exercise API cookies and an actual `wss://api.example.com/ws/...` collaborative session through Nginx. Confirm body/time limits and readiness behavior through the proxy. |
| Vercel custom domain | Not verified | Configure the project using [deployment-guide.md](deployment-guide.md), attach `app.example.com`, and verify direct refreshes, service-worker assets, exact credentialed CORS, cross-host session cookies, reset flow, and live WebSocket collaboration. |
| Production email | Not verified | Add a verified SMTP sender and provider credentials to the VPS, then complete password reset from the delivered message. Automated tests use an in-memory test mail capture. |
| Google OAuth | Conditional | If enabled for launch, configure the Google client and `https://api.example.com/api/auth/callback/google`, then complete a real login. Otherwise leave provider credentials blank so the button stays hidden. |
| Offline edge cases | Follow-up | The suite covers account switching and cached offline reload. First-ever offline use and a worker update while an unsynced draft is pending remain acceptance scenarios to add or exercise manually. |
| Operator/legal copy | Review required | Review the privacy/terms drafts and fill in the operator identity, support contact, governing law, provider list, and retention details before public launch. |
| Error alerting | Operator setup | JSON logs and health/readiness checks are ready, but no external error-reporting or uptime-monitoring provider is selected or activated. Configure alert delivery and backup retention on the VPS. |

The repository has no environment-based signup-disable switch. Keep the production deployment protected or off the public domain until email recovery, cookies, and WebSocket checks pass. See the [VPS deployment guide](../server/deployment-vps.md) and [operations runbook](../server/ops-runbook.md) for the operator commands.

## Acceptance decision

C17 remains incomplete until the Docker-backed VPS package/proxy checks pass and the live Vercel, cookie/WebSocket, and production SMTP checks are recorded. Do not treat a green local quality gate as evidence that DNS, TLS, credentials, or external hosting have been configured.
