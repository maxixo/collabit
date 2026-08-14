# Playwright Editor Regression Plan

## Scope

- Add Playwright browser E2E coverage for the editor.
- Target the reported regressions:
  - new document does not reset cleanly,
  - shared-link editor can break on load,
  - typed letters can appear stuck with red suggestion styling.

## Implemented Setup

- `client/playwright.config.ts`
- `client/tests/e2e/editor-regressions.spec.ts`
- `client/tests/e2e/helpers/editor.ts`
- `client/package.json` scripts:
  - `npm run test:e2e --workspace client`
  - `npm run test:e2e:ui --workspace client`
  - `npm run test:e2e:headed --workspace client`

## Covered Scenarios

1. Open an existing document, create a new one, and confirm the editor resets.
2. Type in a fresh document and confirm no suggestion/delete artifacts are rendered.
3. Open a shared link as another user, confirm it loads cleanly, then create a new document and confirm no shared-state contamination remains.

## Required Environment

- Client app running at `PLAYWRIGHT_BASE_URL` or `http://localhost:5173`
- Server API running at `PLAYWRIGHT_API_BASE_URL` or `http://localhost:4000`
- Working auth + database stack

## Notes

- Tests create unique users through the auth API for isolation.
- Tests create documents and share tokens through the API, then validate the editor through the browser.
- Stable `data-testid` hooks were added for the editor and share modal to keep the suite reliable.
