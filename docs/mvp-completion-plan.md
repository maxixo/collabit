# Collabit MVP completion plan

Implementation order and progress are tracked in the [commit-by-commit roadmap](mvp-commit-plan.md). This document remains the scope and acceptance overview; use the roadmap for commit boundaries and validation requirements.

Drafted 10 November 2026 from the codebase readiness review. Target: a public MVP, with the frontend eventually on Vercel and one Node backend process on the user's VPS. Hosting activation and production deployment follow completion of this plan.

## Scope and working rules

Finish the existing product: authentication, documents, editing, collaboration, sharing, history, suggestions, export, stars, trash/restore, profile, and offline recovery. Preserve existing uncommitted edits. Add focused regression tests for data loss, access control, and recovery; avoid broad refactors or new editor features unless needed to fix those behaviors.

Defer billing, richer workspace administration, new integrations, horizontal scaling, and performance work without a measured user-facing problem. Keep one backend process for this release, including when using a process manager; do not enable cluster mode.

Use a disposable PostgreSQL database for integration and browser tests. Never point destructive tests or reset scripts at a development database containing valuable documents or at production.

## Phase 1 — Establish a trustworthy baseline

Work:

- Fix the React/native `MouseEvent` type collision in `client/src/pages/Editor.tsx`.
- Add explicit frontend typechecking to the root verification command and CI.
- Align local development, CI, and container Node versions with the test runner's requirements.
- Stop ignoring `.github/` and prepare the existing workflow for version control.
- Provide a repeatable isolated test stack with PostgreSQL, auth migrations, document migrations, fixture setup, and cleanup.
- Capture existing editor regression behavior before changing persistence and hydration.

Completion check: a fresh install can run lint, typechecking, helper tests, builds, and the existing five Playwright cases against the isolated stack. Preserve failure traces for investigation. An unexplained failure remains a blocker.

Primary files: root/workspace `package.json`, `.gitignore`, `.github/workflows/ci.yml`, `client/playwright.config.ts`, editor page, test helpers.

## Phase 2 — Isolate account data and preserve offline drafts

Implement account isolation before service-worker caching or queue behavior expands.

Work:

- Namespace IndexedDB records, queued operations, search indexes, and relevant local metadata by authenticated user.
- Handle existing unscoped browser data explicitly: do not silently assign it to whichever account signs in next. Preserve recoverable drafts through a controlled migration/export path.
- Pause queue replay until the matching account has an authenticated session; prevent a running replay from continuing across logout/account changes.
- Reset in-memory document, presence, and search state on logout while retaining unsynced drafts under their original account.
- Persist unresolved conflicts and rejected drafts. Remove queued drafts only after durable acknowledgement or explicit user resolution/discard.
- Keep remote fetch/cache updates from overwriting the only local conflict copy.
- Enforce conflict checks atomically on the server with an expected revision/version. Avoid a separate fetch-then-write race that can overwrite a newer change.
- Serialize replay and ensure retries cannot duplicate operations or reverse the intended star state.

Completion checks:

- Account B cannot read or submit account A's cached documents or operations on the same browser.
- An offline draft survives reload and becomes available when its original account returns.
- Conflicts survive reload/navigation and offer duplicate, download, or reload-latest recovery.
- Concurrent remote edits cause an explicit conflict instead of a silent overwrite.
- Session expiry, 403 responses, and transient failures retain recoverable work without uncontrolled retries.

Primary files: `client/src/offline/`, auth context, app effects/store, logout menu, `useDocument`, document API/service.

## Phase 3 — Make collaboration durable and consistent

Work:

- Define the authoritative document body and its relationship to Yjs state, JSON autosave, history, suggestions, and export. Use durable collaborative state for active shared editing and keep JSON projections/version records consistent with it.
- Seed legacy JSON documents once when no collaborative state exists. Concurrent first opens must not seed the body twice.
- Await room initialization and persistence loading before accepting synchronization. Stop unconditional client hydration from replacing an already synchronized shared body.
- Connect the persistence adapter to room creation/update/teardown, with ordered writes, failure handling, and flushes that wait for in-flight work.
- Make REST saves, offline replay, history restore, and suggestion resolution cooperate with active collaboration; they must not leave the room and stored document disagreeing.
- Show "saved" only after the relevant state is durably acknowledged. Preserve pending local work on disconnect and show failed saves clearly.
- Drain WebSockets and flush dirty rooms during shutdown, with a bounded timeout and explicit failure reporting.

Completion checks:

- Two independent browser sessions converge during simultaneous edits without duplicated initial content.
- A document survives the last client disconnecting, reopening, and backend restart.
- Edits acknowledged as saved survive a forced backend termination; pending edits remain visibly pending/recoverable.
- Database failures do not produce a false saved indicator.
- History restore and suggestion acceptance/rejection converge across connected clients and survive reload.

Primary files: server collaboration/persistence modules, WebSocket initialization, server shutdown, client Yjs provider/editor hydration/sync, document/history/suggestion services.

## Phase 4 — Complete sharing permissions and abuse controls

Default product semantics for this draft:

- Revoking a share link prevents further redemption of that link.
- A collaborator who has explicitly joined remains a member until removed. Explain this behavior in the share UI.
- Removing a collaborator revokes membership and disconnects affected sessions. Another independently valid share link can grant access again.
- Sessions relying directly on a token lose access when that grant expires or is revoked.

Work:

- Add an owner-only collaborator list/removal flow and enforce role changes server-side.
- Track enough grant/session information to enforce token and membership lifecycle rules.
- Recheck or invalidate active socket access when membership, role, token validity, or document lifecycle changes.
- Make usage-limited link redemption atomic and consistent across direct API, browser, and WebSocket entry points. Routine socket reconnects must not consume another redemption for an established membership.
- Validate document IDs, titles, editor payload shape/size, and permission-bearing inputs at runtime.
- Validate WebSocket origins before upgrade and set explicit message/connection limits, heartbeat cleanup, and document API abuse controls.
- Keep production CSRF/origin checks enabled and scope CORS/trusted origins to intended frontend addresses.

Completion checks: viewer writes fail through both HTTP and WebSocket paths; removing a member closes existing access; link expiry/revocation and max-use races behave as defined; unauthorized origins and oversized/malformed messages are rejected safely; unrelated collaborators remain connected.

Primary files: document/share/permission services and routes, member/grant migrations as needed, WebSocket handling, `ShareModal`, authentication configuration.

## Phase 5 — Finish offline startup, account recovery, and essential UX

Work:

- Emit the service worker as executable JavaScript at a location/scope that controls app routes; make registration failures visible during verification.
- Cache the production application shell/assets with an update strategy that does not interrupt pending saves.
- Keep private document caches account-scoped. Prevent a worker from serving a previous account's authenticated API response.
- Distinguish temporary session-network failure from confirmed logout. Permit an explicit local offline mode for the last known account without treating cached identity as server authorization.
- Add password-reset request and completion screens, transactional email integration, expiring single-use tokens, and clear success/error states. Use an email sandbox in automated tests; configure the production sender before public signup.
- Verify Google OAuth if included; hide the entry point when it is not configured.
- Add a friendly application error boundary, unknown-route screen, and recoverable load/save failures.
- Connect signup privacy/terms links and replace implementation-placeholder copy with product-specific data handling/support information. Obtain final operator review of that content before launch.
- Check core flows at phone, tablet, and desktop widths, including keyboard navigation, toolbar access, dialogs, and offline/conflict states.

Completion checks: the production bundle controls app routes with a working service worker; a previously visited document opens after an offline reload; a fresh offline browser gets an accurate unavailable state; password recovery works and rejects expired/reused tokens; key screens remain usable on mobile and with a keyboard.

Primary files: service worker/Vite configuration, auth context/routes/pages, server auth/email integration, app routes/error UI, landing/signup links, responsive editor components.

## Phase 6 — Prepare the release package for VPS + Vercel

Prepare local configuration and documentation here; do not activate hosting or deploy production yet.

Work:

- Correct environment examples, including the `/ws` suffix, and document frontend build-time variables separately from backend secrets.
- Add `.dockerignore`; make the backend image reproducible and exclude local secrets and build clutter.
- Provide a true one-shot migration command covering auth and application schema. Coordinate concurrent runs, make migration tracking atomic where supported, and fail clearly when migration files are absent.
- Rehearse a migration from both an empty database and a representative existing schema.
- Add Vercel frontend build/output settings and SPA fallback configuration.
- Prepare a VPS configuration with one backend process, HTTPS/WebSocket reverse proxying, private database access, appropriate body limits/timeouts, and health/readiness checks.
- Add configuration for useful structured/redacted logs, error reporting, backup/restore, rollback, and application restart/draining.
- Document same-parent-domain frontend/API addresses and Google callback configuration if enabled.

Completion checks: a clean production build starts from injected environment variables without bundled `.env` files; migrations exit successfully without leaving the server listening; `/health` and `/ready` behave correctly; local production-mode proxy tests pass HTTP, cookies, WebSockets, and deep-link navigation. Backup restoration succeeds into a disposable database. Rollback instructions include database compatibility constraints.

Primary files: Docker configuration, environment examples, server migration/startup modules and scripts, Vercel config, proxy template, README/runbook.

## Phase 7 — Run the release acceptance pass

Run against production-built assets and an isolated database, with two independent browser contexts where appropriate.

| Area | Required scenarios |
| --- | --- |
| Accounts | Signup, login, refresh, logout, account switch, session expiry, password reset; Google OAuth if enabled. |
| Documents | Create, edit, autosave, navigate with pending edits, reopen, title changes, star/unstar, trash, restore, permanent deletion. |
| Sharing | Viewer/editor roles, owner-only administration, link redemption/revoke/expiry/limits, collaborator removal with sockets already open. |
| Collaboration | Simultaneous edits, concurrent first opens, reconnect, last-client departure, graceful restart, forced termination, temporary database failure. |
| Offline | Cached reads/reload, queued edits, conflict resolution, conflict reload, interrupted replay, account isolation, service-worker update. |
| History and export | Save/version listing, restore while collaborators are connected, suggestion resolution, export content matches saved document. |
| UX and operations | Phone/tablet/desktop, keyboard/dialog behavior, useful error states, readiness degradation, migration rehearsal, backup restore. |

Run lint, typechecking, unit/integration tests, production builds, dependency review, and the browser suite. Investigate relevant development-tool vulnerabilities as well as production dependencies. Produce a short release checklist with actual results and any accepted limitations.

## Definition of MVP complete

All critical data-loss and access-control findings are resolved with regression evidence. Core flows pass against production builds. Saved edits survive restart, unresolved drafts survive reload, account data stays isolated, and permissions are enforced on HTTP and live sockets. CI can reproduce the checks from a clean checkout. Release configuration and recovery procedures are prepared and tested locally.

Deployment is the next milestone. Production DNS/TLS, real email delivery, external monitoring, and the final cross-host cookie/WebSocket smoke test are verified during that milestone before public traffic is enabled.

## Inputs needed during implementation

Most work can proceed without these. Collect them before the dependent final integration:

- A transactional email provider and sender identity for password recovery.
- Final frontend/API domains and whether Google login is included at launch.
- Operator/support contact and final product privacy/terms content.
- During deployment: VPS operating system/resources, deployment access, and the PostgreSQL hosting/backup choice.

The draft uses the sharing semantics above and assumes public email/password signup. If the launch is invite-only, account-recovery support can be scoped differently without dropping data-safety or permission checks.
