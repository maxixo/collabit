# Deployment guide: Vercel frontend + VPS backend

This is the release handoff for the current monorepo. Deploy the backend and database to the VPS, then deploy the static Vite client to Vercel. Use a shared parent domain, such as `app.example.com` and `api.example.com`, so browser requests are cross-origin but remain same-site. The browser still needs credentialed CORS because the origins differ.

The repository includes a Vercel config at `vercel.json` and backend packaging in [the VPS guide](../server/deployment-vps.md). The Vercel config uses the official Vite framework preset, builds the client workspace from the repository root, publishes `client/dist`, and sends SPA deep links to `index.html`. See [Vercel's Vite guide](https://vercel.com/docs/frameworks/frontend/vite) and [project configuration reference](https://vercel.com/docs/project-configuration/vercel-json).

## 1. Prepare the release branch

1. Merge the accepted MVP branch into the deployment branch through the repository's normal PR process.
2. Confirm the GitHub quality workflow is green for the exact commit to deploy.
3. Select the final frontend and API hostnames. This guide uses `app.example.com` and `api.example.com` as examples.
4. Keep the database private. Do not expose PostgreSQL or the Node API directly to the public internet; Nginx on the VPS is the public TLS endpoint for the API.
5. Configure the transactional email provider and verified sender before enabling public password recovery/signup. If Google sign-in is enabled, configure the callback below.

## 2. Deploy the backend on the VPS

Follow [the backend VPS guide](../server/deployment-vps.md) to install Docker Compose and Nginx, create `.env.production`, prepare TLS, and start the production Compose services. Replace every example domain and credential. Set:

```dotenv
AUTH_BASE_URL=https://api.example.com
CLIENT_BASE_URL=https://app.example.com
CORS_ORIGINS=https://app.example.com
TRUST_PROXY=true
```

Set strong, unique backend values for `DATABASE_URL`, `POSTGRES_PASSWORD`, `JWT_SECRET`, and `AUTH_SECRET`. Set the real SMTP settings. Keep `.env.production` on the VPS with restrictive permissions; it is not a Vercel environment file and must never be uploaded as a frontend variable.

Before moving on, verify:

```sh
curl --fail https://api.example.com/health
curl --fail https://api.example.com/ready
```

Then verify TLS and WebSocket upgrades through Nginx from a browser or WebSocket client. `/ready` must become unhealthy when PostgreSQL is unreachable.

## 3. Configure the Vercel project

Create a Vercel project connected to the GitHub repository with these settings:

| Setting | Value |
| --- | --- |
| Root Directory | `.` (repository root) |
| Framework Preset | Vite |
| Install Command | `npm ci` |
| Build Command | `npm run build --workspace @collab/client` |
| Output Directory | `client/dist` |
| Node.js Version | 22.x |

`vercel.json` tracks the install/build/output and SPA fallback settings. Add these **Production** and **Preview** environment variables in Vercel before building each environment:

| Variable | Production value | Preview value |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `https://api.example.com` | A staging API origin, or leave deployments gated until one exists |
| `VITE_WS_URL` | `wss://api.example.com/ws` | The matching staging WebSocket origin ending in `/ws` |

These `VITE_` variables are public build-time values embedded in JavaScript. They may contain hostnames, but never credentials, signing keys, SMTP values, or database URLs. A change to them requires a new Vercel build/deployment.

Do not use the default Vercel preview hostname as the production CORS origin. For preview testing, add the exact preview origin to the staging backend's `CORS_ORIGINS` and Better Auth `trustedOrigins` configuration. Avoid adding broad wildcard origins to production.

## 4. Configure domains and Google OAuth

1. Add `app.example.com` to the Vercel project and configure its DNS as Vercel instructs.
2. Point `api.example.com` to the VPS, allow inbound ports 80/443, install/renew a TLS certificate, and confirm Nginx serves the API certificate.
3. Keep the configured client origin identical across Vercel custom domain, `CLIENT_BASE_URL`, and the `CORS_ORIGINS` allowlist. Origins include scheme and host, without a path or trailing slash.
4. If Google OAuth is enabled, add this authorized redirect URI in Google Cloud and use the same origin in the VPS environment:

   `https://api.example.com/api/auth/callback/google`

5. Set the Vercel `VITE_API_BASE_URL` and `VITE_WS_URL` to the public API host, not the VPS IP or loopback address.

## 5. Production smoke checks

Run these checks after each production deployment and before opening signup to the public:

- Open `/`, then directly navigate to and refresh `/signin`, `/signup`, `/editor/recent?workspaceId=default`, `/profile`, and `/trash`; each should serve the client app.
- Confirm Vercel serves `/service-worker.js` as JavaScript with app-root scope and loads all built assets from the Vercel origin.
- Sign up, sign in, refresh the session, and sign out. In browser devtools, confirm API calls use credentials and responses allow exactly `https://app.example.com` with credentialed CORS.
- Request a password reset and complete it using the real SMTP email. Confirm invalid/reused links fail.
- If enabled, test Google OAuth through the registered callback.
- Open a document in two independent browser sessions, edit simultaneously, and verify the WebSocket uses `wss://api.example.com/ws/...` and changes converge.
- Verify `/health` and `/ready`, inspect redacted backend logs, and verify an off-host database backup can be restored into a disposable PostgreSQL database.
- Do not open production traffic until SMTP, account recovery, cookie/session behavior, and WebSocket collaboration have passed. This repository currently has no environment-based switch to disable signup; keep the production deployment protected or unattached to the public domain while those checks are outstanding.

## 6. Release and rollback sequence

For each backend release, take and verify a database backup, pull the reviewed Git commit, rebuild the backend image, run the migration job, then start/restart the single API service. Check readiness and logs before promoting the paired Vercel deployment. Keep only one API process; this release uses in-memory WebSocket rooms and rate-limit counters.

For frontend rollback, promote the previous known-good Vercel deployment. For backend rollback, return to a code version known to support the already-applied schema. Migrations are forward-only; do not assume reverting application code also reverts the database. If the previous backend cannot safely use the new schema, restore the pre-release backup into a separate database and follow the reviewed data-recovery procedure rather than deleting migration state or overwriting production in place.

## Verification boundary

Local Vite builds and route/service-worker artifact checks can be run before deployment. Real TLS/DNS, Vercel domain setup, production SMTP/OAuth, cross-host cookie behavior, and the final public WSS check require the owner's Vercel, DNS, VPS, and provider accounts and are deployment-time acceptance steps.
