# MVP commit roadmap

Status: implementation started. Updated 11 November 2026. Scope: finish the existing public MVP before deploying a Vercel frontend and one Node backend process on the owner's VPS.

The [completion overview](mvp-completion-plan.md) contains the full product scope and acceptance matrix. This roadmap defines reviewable implementation commits. Numbers are plan IDs, not existing Git commits. All items start unchecked; mark one complete only after its changes are committed and its checks have recorded results.

## Execution rules

- Execute C00 through C17 in order; each item depends on the earlier items. Keep each commit limited to the behavior named in its message, including the focused regression tests needed to verify it.
- Preserve existing uncommitted application changes. Review and attribute relevant hunks before staging; do not sweep them into the planning commit or use `git add .` for this work.
- Use a working branch such as `mvp/finish-release`. Keep intermediate changes usable. If a coherent fix needs a schema change, backend behavior, and client changes together, include them in the same commit instead of splitting across broken states.
- Prefer additive schema changes. Document compatibility with the previous release for each migration; rehearse rollback/recovery without deleting valuable data.
- Use disposable PostgreSQL and browser profiles for integration, restart, migration, and recovery tests. Do not use a database containing valuable documents.
- For code changes, run the affected typechecks/tests and builds required by that change. Run the complete quality gate at milestone boundaries and before release. Documentation-only changes require whitespace/link review, not an application rebuild.
- Test data safety and authorization through realistic behavior, rather than tests that merely repeat implementation details. Include tests in their corresponding fix commits.
- Keep external inputs visible. Email credentials, final domains, and operator copy may arrive later; finish independent work first. Do not mark an external integration verified without exercising it.
- Update this roadmap's completion box, commit hash, and verification evidence as each item lands. Include that update in the implementation commit, or immediately follow it with a documentation-only checkpoint.

## Commit sequence

| Done | ID | Proposed commit message | Milestone |
| --- | --- | --- | --- |
| [x] | C00 | `docs(mvp): record commit-based completion roadmap` | Planning |
| [ ] | C01 | `fix(tooling): enforce frontend types and align Node runtimes` | Reliable checks |
| [ ] | C02 | `fix(db): make migrations standalone and coordinated` | Reliable checks |
| [ ] | C03 | `test(mvp): add isolated database and browser test stack` | Reliable checks |
| [ ] | C04 | `fix(offline): isolate cached data and replay by account` | Data safety |
| [ ] | C05 | `fix(offline): retain drafts until conflicts are resolved` | Data safety |
| [ ] | C06 | `fix(documents): reject stale writes and make replay retry-safe` | Data safety |
| [ ] | C07 | `fix(collaboration): persist rooms and synchronize document state` | Collaboration |
| [ ] | C08 | `fix(server): drain sockets and flush pending state on shutdown` | Collaboration |
| [ ] | C09 | `fix(sharing): enforce grant lifecycle and collaborator removal` | Access control |
| [ ] | C10 | `fix(security): validate API payloads and constrain socket traffic` | Access control |
| [ ] | C11 | `fix(offline): build the service worker and restore cached sessions` | Essential UX |
| [ ] | C12 | `feat(auth): implement password recovery and provider availability` | Essential UX |
| [ ] | C13 | `fix(ui): complete recovery screens and mobile workflows` | Essential UX |
| [ ] | C14 | `chore(server): prepare a reproducible VPS runtime` | Release preparation |
| [ ] | C15 | `chore(client): configure Vercel builds and production URLs` | Release preparation |
| [ ] | C16 | `chore(ops): add observability and recovery procedures` | Release preparation |
| [ ] | C17 | `test(release): verify production MVP acceptance criteria` | Release acceptance |

### C00 - Record the plan

**Scope:** `docs/mvp-commit-plan.md`, `docs/mvp-completion-plan.md`, the README roadmap link, and only the necessary `.gitignore` exceptions.

**Deliver:** a versionable roadmap with explicit scope, commit boundaries, checks, and progress tracking. Keep other generated/local documentation ignored.

**Verify:** `git diff --check`; links resolve; `git check-ignore` does not exclude either planning document; unrelated changes are absent from the staged diff.

### C01 - Make quality checks trustworthy

**Scope:** root/workspace packages, lockfile if needed, runtime version declarations, existing Docker base versions, client mouse-event typing, `.gitignore`, and `.github/workflows/ci.yml`.

**Deliver:** fix the native/React `MouseEvent` collision; provide a root typecheck command covering client/server/shared; include typechecking in `ci:check`; align the Node runtime with the tests' TypeScript execution requirements; make the CI workflow trackable and runnable.

**Verify:** fresh dependency install, lint, typecheck, existing helper tests, and production builds pass using the selected runtime. Record existing warnings and any unrelated failures explicitly.

### C02 - Make database initialization deployable

**Scope:** `server/scripts/run-migrations.ts`, `server/src/config/migrations.ts`, auth initialization, package scripts/build configuration, and focused migration tests.

**Deliver:** a one-shot migration command covering auth and application schema; deterministic ordering; coordinated concurrent runners; atomic application migration/tracking where supported; useful status output on an empty database; failure when migration assets are missing. Separate migration execution from starting HTTP/WebSockets. Preserve a clearly documented local-development bootstrap path.

**Verify:** empty-database setup, repeat execution, concurrent invocation, migration failure/recovery, and upgrade from a representative earlier schema. Successful one-shot execution exits without binding a port or keeping pools open. Record the prior-release compatibility strategy.

### C03 - Establish the integration baseline

**Scope:** isolated test stack configuration, fixture/lifecycle scripts, Playwright configuration/helpers, API/database test harness, CI, and test documentation.

**Deliver:** reproducible disposable PostgreSQL with migrations and fresh fixtures; explicit safeguards against running resets on other databases; controlled app startup/cleanup; retained failure traces. Exercise real authentication, documents, and editor behavior.

**Verify:** the five existing browser regression cases plus API smoke tests pass from a fresh test stack; cleanup is scoped to the test resources. Run the complete quality gate.

### C04 - Isolate account data

**Scope:** IndexedDB schema, offline queues/search metadata, auth context, app effects/store, logout flow, provider cleanup, and account-switch regressions.

**Deliver:** user-scoped documents, search, queues, and metadata; explicit handling of legacy unscoped drafts; pause/cancel replay when authentication changes; clear in-memory account state and close prior-account sockets; preserve unsynced work under its original identity. Quarantine/export legacy drafts when ownership cannot be established instead of assigning them to the next login.

**Verify:** account A queues work, logs out, and account B signs in in the same browser. B cannot list/read/replay A's drafts, search entries, or collaboration state. A can recover its pending work after returning, including following a reload.

### C05 - Make conflicts recoverable

**Scope:** document queue/storage, document fetch/cache behavior, conflict UI/state, `useDocument`, and recovery regressions.

**Deliver:** durable pending/conflict/rejected states; preserve local and remote copies separately; acknowledge/remove operations only after success or explicit resolution; rehydrate conflict UI after reload. Keep duplicate/download/reload-latest actions working.

**Verify:** produce a local/remote conflict, reload or navigate away, and resolve it later without losing the local copy. Repeat with a 401, a 403, and a transient outage. A server read must not overwrite the only local draft.

### C06 - Prevent stale writes and unsafe retries

**Scope:** document revision migration/contracts, document routes/services, offline replay, star API/queue, and concurrency regressions.

**Deliver:** a server-enforced expected revision or equivalent atomic concurrency guard; explicit conflict responses; serialized replay; retry-safe mutation identities or desired-state operations. Reconnect/retry must not duplicate work or invert a star twice. Update all current writers, including history/save endpoints, to respect the revision contract.

**Verify:** race two writes based on the same revision; a stale write cannot overwrite the winner. Interrupt and retry a successful request with a lost response; the final document/star state remains correct. Migration preserves existing documents. Run the complete quality gate and offline recovery suite.

### C07 - Persist collaboration coherently

**Scope:** server Yjs manager/persistence, document/version/suggestion services, shared contracts/schema if needed, client provider/sync/hydration, save-status UI, and multi-browser regressions.

**Deliver:** authoritative collaborative state and consistent JSON/version projections; awaited, single room initialization; one-time legacy JSON seeding; ordered durable writes; initialization errors that prevent unsafe empty-room sync. REST updates, offline replay, history restore, and suggestions must update active collaborative state coherently. Display saved status only after durable acknowledgement. Align the adapter's flush behavior with in-flight writes.

This is one coherent cross-stack change: do not enable persistent room hydration while leaving the client unconditionally replacing synchronized content. If further subdivision is needed during implementation, use a disabled-by-default path until the complete behavior passes.

**Verify:** simultaneous two-browser editing, concurrent first opens, last-client disconnect/reopen, stale offline replay against an active room, history restore, and suggestion review all converge without duplicated content. Force-terminate and restart the backend after a saved acknowledgement; saved edits remain. Inject database failure and verify the UI does not report saved.

### C08 - Handle shutdown and disconnected clients

**Scope:** HTTP/WebSocket lifecycle, room cleanup, persistence flush/disposal, database pool ownership, and restart tests.

**Deliver:** stop accepting new work, close/drain sockets, await pending durable writes, dispose room/awareness resources, close all database pools, and enforce a bounded shutdown deadline. Surface failures instead of falsely reporting a clean flush. Ensure a returning client cannot race teardown of its room.

**Verify:** send SIGTERM with active clients and pending writes; restart/reconnect retains acknowledged state. Verify a stuck dependency cannot hang shutdown indefinitely. Test repeated connect/disconnect cleanup and clients returning during room teardown. Run the complete quality gate and collaboration suite.

### C09 - Finish sharing semantics

**Scope:** share/member/grant schema as needed, permission/document/share services and routes, socket authorization, owner controls in `ShareModal`, and access-control regressions.

**Deliver:** owner-only collaborator administration; consistent token redemption and usage counting; active connection invalidation on relevant grant/member/role changes; expiry enforcement for token-only sessions; deleted/trashed document session handling.

**Product rule:** link revocation stops future redemption; an already joined collaborator remains a member until explicitly removed. Removing a member closes that user's affected sessions, but another valid independent link can grant access again. Explain this distinction in the UI. Reconnect for existing membership does not consume another redemption. Preserve unrelated valid grants and collaborators.

**Verify:** viewer HTTP/socket writes fail; removed/downgraded collaborators lose the relevant active privileges; owner-only controls are enforced on the server; revoked/expired links fail as defined; concurrent redemptions cannot exceed `maxUses`. Exercise direct HTTP and socket entry points, not only token lookup.

### C10 - Harden request boundaries

**Scope:** document validation/middleware, WebSocket upgrade/message handling, rate/connection controls, configuration, and focused abuse tests.

**Deliver:** runtime validation for IDs, titles, document payloads, permissions, and limits; origin checks before socket upgrade; explicit frame/connection constraints and heartbeat cleanup; document API abuse limits. Retain auth CSRF/origin protections and credentialed origin allowlists.

**Verify:** malformed/oversized inputs fail with controlled responses; untrusted-origin socket handshakes are rejected; viewer and normal editor traffic still work; limit and heartbeat behavior is deterministic and releases resources. Run the complete quality gate and permission suite.

### C11 - Finish production offline behavior

**Scope:** Vite/service-worker build/registration, shell/asset cache lifecycle, auth context/protected routes, account-scoped offline access, and production-bundle browser tests.

**Deliver:** executable JavaScript worker with app-wide scope; observable registration errors; safe shell updates; no cross-account private API caching; explicit offline mode for previously known local identity. A failed session request must not be mistaken for confirmed logout, and cached identity must never authorize server requests.

**Verify:** serve production assets, confirm worker scope/control, cache a document, go offline, and reload a deep link. Test first-ever offline visit, session expiry after reconnect, account switch, and worker update while a draft is pending. Retain queue/conflict recovery guarantees.

### C12 - Complete account recovery

**Scope:** Better Auth configuration, reset request/completion pages/routes, email adapter/env examples, provider-availability UI, and auth regressions.

**Deliver:** password-reset request and completion, email integration with safe user-facing responses, expiring single-use recovery tokens, and error/retry states. Hide Google login when credentials are absent; verify the OAuth flow if it is part of the release.

**External input:** choose the transactional email provider/sender. Build and test against a local email sandbox first; production delivery verification happens before public signup is enabled.

**Verify:** real reset-link round trip in the email sandbox, successful login after reset, expired/reused/invalid-token rejection, and appropriate session invalidation. Avoid account-enumeration responses. Exercise configured/unconfigured OAuth states.

### C13 - Finish essential UX

**Scope:** route/error boundaries, document/save/conflict screens, editor/dialog responsive behavior, signup/footer links, product information, and relevant browser checks.

**Deliver:** useful application/404/load/save recovery screens; accessible keyboard/dialog behavior; phone/tablet/desktop editor access; working privacy/terms links and product-specific operator-reviewed content. Ensure all existing MVP flows remain discoverable.

**External input:** operator/support identity and final data-handling copy. Prepare concrete copy for review; do not label placeholders as final policy.

**Verify:** keyboard navigation and representative viewport checks for authentication, documents, toolbar, share/history/conflict dialogs, profile, and trash. Exercise recovery actions. Run the complete quality gate and existing browser suite.

### C14 - Package the VPS backend

**Scope:** `.dockerignore`, backend Dockerfile/build settings, environment examples, production Compose/service configuration, reverse-proxy template, and packaging documentation.

**Deliver:** reproducible backend installation/build; migration assets and runtime dependencies included; secrets/local artifacts excluded; one backend process; explicit release/start commands; private Node/database ports; HTTPS/WebSocket proxy configuration and health checks. Keep local-development configuration usable.

**Verify:** build and inspect the image, run migrations as a one-shot job, start with injected production-mode environment, and exercise readiness, API cookies, and `/ws/...` through a local production-style proxy. No real credentials belong in images, templates, or logs. Check proxy and API body/time limits agree.

### C15 - Package the Vercel frontend

**Scope:** Vercel configuration, client environment examples, build instructions, and deep-link smoke checks.

**Deliver:** monorepo-aware frontend build and `client/dist` output; SPA fallback; build-time `VITE_API_BASE_URL` and `VITE_WS_URL` documentation including the `/ws` suffix. Document same-parent-domain app/API addresses, credentialed CORS, and optional Google callback configuration. Keep backend secrets out of frontend variables/artifacts.

**Verify:** a production frontend build uses the supplied API/WebSocket URLs; direct navigation/refresh works on editor/profile/auth routes; assets and service worker are served correctly. Prepare exact Vercel settings. Verify final Vercel hosting and cross-host cookies during deployment, after MVP acceptance.

### C16 - Prepare operations and recovery

**Scope:** structured/redacted logging, error-reporting configuration, health/readiness behavior, backup/restore scripts or templates, rollback/runbook, and focused failure checks.

**Deliver:** useful operational signals without document bodies/secrets; backup scheduling/retention guidance; restore and rollback procedures; schema compatibility constraints; documented restart/draining and one-process requirement. Provide monitoring configuration ready for later activation.

**Verify:** temporary database failure degrades readiness; injected errors produce actionable redacted logs; restore a backup into a disposable database and reopen documents, memberships, versions, suggestions, and collaborative state. Rehearse the documented rollback where schema compatibility permits. Record what must be activated on the real VPS.

### C17 - Record the release acceptance result

**Scope:** missing cross-feature regression tests, acceptance/checklist documentation, actual verification results, and roadmap status. Fixes discovered by acceptance belong in focused commits before this checkpoint is marked complete.

**Deliver:** a release candidate that satisfies the full [acceptance matrix in the completion overview](mvp-completion-plan.md), with actual commands/outcomes and explicitly accepted noncritical limitations. Link regression evidence for every original data-loss/access-control finding. Review production and relevant development dependency advisories.

**Verify:** clean-install lint/typecheck/unit/integration/build gates; production-bundle Playwright; two-user collaboration; restart and failure recovery; offline/account isolation; grant lifecycle; password recovery; history/suggestions/export; mobile/keyboard checks; migration and backup restore. No unexplained critical failures remain.

**Exit:** mark the MVP complete and ready for the separate VPS + Vercel deployment milestone. Real DNS/TLS, production email delivery, monitoring activation, and the final external cookie/WebSocket smoke test are deployment tasks, completed before opening public traffic.

## Verification record

Add entries here as implementation commits land. The planning document itself does not demonstrate that the MVP is finished.

| Plan ID | Commit hash | Commands/scenarios checked | Outcome / remaining limitation |
| --- | --- | --- | --- |
| C00 | This planning commit; resolved by its unique commit message. | Documentation links, 18 commit entries, ignore exceptions, and staged whitespace/scope review. | Passed; earlier application edits excluded. |

## First commit staging boundary

C00 includes only the two planning documents, the README link, and the scoped `.gitignore` changes introduced for them. The repository already contains other uncommitted `.gitignore` and application edits. Stage the intended hunks explicitly and inspect `git diff --cached` before committing. The plan does not authorize bundling those earlier edits or starting production deployment.
