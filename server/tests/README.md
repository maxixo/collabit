# Server Tests

The server test suite runs through the workspace test script:

```bash
npm run test --workspace server
```

Current coverage focuses on the Phase 1 public-release hardening work:

- profile payload validation
- workspace naming fallback behavior

Add API or database-backed tests here as additional release blockers are implemented.
