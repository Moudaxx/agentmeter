# AgentMeter hosted service

English public site, authenticated per-account usage ledger and agent integrations.

## Endpoints

- `/`: public calculator and product overview.
- `/dashboard`: sign-in required; Live/Sandbox totals, recent events and API key management.
- `/docs` and `/openapi.json`: integration documentation.
- `/health`: non-sensitive database readiness.
- `/api/usage`, `/api/events`: bearer-key or signed-in session access, isolated by account and environment.
- `/api/keys`: signed-in same-origin requests only; scoped keys, SHA-256 hashes, 30-day expiry, revocation and 10 active keys per account.
- `/api/mcp`: external bearer-key MCP clients.
- `/mcp`: ChatGPT Site plugin with platform-authenticated identity.

## Development

Use the Sites skill to install dependencies, preview, build and publish this checkout. The production audience is public; ledger records require authentication. Preserve the existing Site identity and token image/metadata assets.

`node --test test/*.test.mjs` runs the service against a real SQLite database with the production schema. `node node_modules/typescript/bin/tsc --noEmit` checks types. Generate append-only Drizzle migrations after schema changes. Do not edit applied migrations.

The Worker uses the D1 binding named `DB`. No provider API key or shared administrator credential is required. Platform identity headers must be injected by trusted Sites dispatch; never expose a standalone copy of this Worker behind a proxy that accepts client-supplied identity headers.

## Limits

A beta with explicit caller-supplied prices, 50,000 records per account/environment, 64 KiB request bodies and a latest-100 event view. There is no automatic provider collection, invoicing, account-data deletion UI or full-export UI. Records are append-only. No wallet or token transaction is performed by this service.

`public/token.json` and `public/logo-symbol-only.png` preserve the reviewed launch assets. No token contract is asserted in this release.
