# AgentMeter

Record AI agent usage and calculate cost using your own provider rates. A small, self-hosted ledger with a REST API, JavaScript SDK, CLI and MCP tools, built with Agent Fun Studio.

[Public calculator](https://agentmeter.btcmax.chatgpt.site/) · [Product checks](https://github.com/Moudaxx/agentmeter/actions)

## What runs today

- A public browser-local calculator and the approved symbol-only logo.
- An authenticated usage API with explicit USD-per-million prices and idempotent event IDs.
- JavaScript SDK, CLI and a basic JSON-over-HTTP MCP endpoint: `record_usage` and `usage_summary`.
- A persistent single-process JSON ledger, Docker packaging and automated tests.

The hosted service at https://agentmeter.btcmax.chatgpt.site now includes a per-account API, dashboard and durable storage. Open `/dashboard` to sign in and create a scoped API key. Hosted application source is in `hosted/`; the original single-process Node server at the repository root remains available for self-hosting. It does not automatically collect provider usage, charge customers, manage wallets or trade tokens. External MCP clients use `/api/mcp` with an AgentMeter key. The ChatGPT Site plugin uses `/mcp` with platform identity. The standalone root server is unchanged and does not implement OAuth.

## Verify your first hosted event

Sign in to the [dashboard](https://agentmeter.btcmax.chatgpt.site/dashboard), create a Sandbox write key, and supply it through the `PRODUCT_API_KEY` environment variable. If your host requires a separate Site service credential, supply it through `SITES_ACCESS_TOKEN`. From the repository root on Node 22+, run:

```sh
node examples/sandbox-check.mjs
```

The check records a synthetic event with 100,000 input and 20,000 output tokens at illustrative rates of $2 and $5 per million. The estimated cost is $0.30. It sends the same event twice and verifies the duplicate response. Rerunning the check uses the same event ID. Open the Sandbox dashboard to inspect the record. This example makes no model call.

## Run locally

Requires Node.js 22 or later. No package installation is needed.

```sh
npm test
export PRODUCT_API_KEY="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))')"
npm start
```

Keep the key in a secret manager for deployment. Do not place it in browser code. The default URL is `http://localhost:3000`; set `PORT` to change it. Use the same key for the SDK, CLI and MCP client.

## API

See [openapi.json](openapi.json). Public routes: `/`, `/health`, `/openapi.json` and specific website assets. Protected routes require `Authorization: Bearer <PRODUCT_API_KEY>`.

| Endpoint | Purpose |
| --- | --- |
| `GET /api/usage` | Event count, token totals and cost in USD |
| `POST /api/usage` | Record one usage event |
| `POST /mcp` | MCP initialize, tool discovery and tool calls |

Example event (prices are illustrative, not provider quotations):

```json
{"eventKey":"request-123","model":"your-model","inputTokens":2000000,"outputTokens":200000,"inputPrice":1,"outputPrice":4}
```

This event costs $2.80. Reusing an `eventKey` returns the original event, even with a different payload. Use a fresh ID for a new request. Retries with the same ID do not add costs twice. Prices are caller-supplied; there is no live provider-price feed.

## SDK, CLI and agents

```js
import {UsageClient} from './sdk.mjs';
const client = new UsageClient(process.env.PRODUCT_URL, process.env.PRODUCT_API_KEY);
const totals = await client.summary();
```

```sh
export PRODUCT_URL=http://localhost:3000
node cli.mjs summary
node cli.mjs record '{"eventKey":"request-123","model":"your-model","inputTokens":2000000,"outputTokens":200000,"inputPrice":1,"outputPrice":4}'
```

Connect an MCP client that supports bearer headers to `<PRODUCT_URL>/mcp`. See [SKILL.md](SKILL.md). This endpoint does not use the private Studio's ChatGPT sign-in.

## Deploy

Build the Dockerfile and provide `PRODUCT_API_KEY` through the runtime environment. Terminate HTTPS at your hosting proxy. Set `DATA_FILE` to a file on a persistent volume; default: `data/usage.json`.

Run one process per ledger file. There is no multi-tenant isolation, distributed locking, billing integration, provider verification or tamper-evident audit trail. The ledger is capped at 50,000 events. Replace the file store with a database before horizontal scaling or large production use.

`public/` can be deployed independently to static hosting. It does not run the API or store visitors' usage. The Docker context excludes local environment files and ledger data.

## Token and development status

No token contract or live trade is claimed in this release. `public/token.json` contains prepared launch metadata and the approved image URL; publishing it does not mint a token. `metadata.draft.json` is the original generation draft. No wallet secrets, platform credentials or private Studio records belong in this repository.

GitHub Actions runs the tests on Node 22 and 24. Tests exercise authorization, validation, duplicate requests, persistence across restarts, public assets, SDK, CLI and MCP tools.


## Hosted release v0.3

The hosted service isolates each account and its Live/Sandbox ledgers, uses hashed API keys with read-only or read/write scope, limits active keys to ten and expires them after 30 days. Keys can be revoked from the dashboard. `hosted/test/service.test.mjs` runs the actual service against SQLite using the production migration. Run `npm run test:hosted` on Node 22.13+ (Node 24 recommended).

The hosted manifest intentionally contains no Site project ID. Use your own Sites project for a separate deployment. Sites must provide trusted identity headers; do not expose the hosted source behind an untrusted header-forwarding proxy.

### Hosted access from non-browser clients

Some hosting access policies can reject a client before the application runs (for example a non-JSON HTTP 403). For supported Site service access, the SDK accepts an optional third constructor argument `{siteAccessToken: process.env.SITES_ACCESS_TOKEN}`; the CLI reads `SITES_ACCESS_TOKEN`. This is separate from the scoped AgentMeter API key. Keep both in a secret manager and send the Site credential only to your own Site. Alternatively, use the authenticated AgentMeter ChatGPT plugin. The SDK never retries with a different browser identity.

Production verification: signed-in dashboard writes, persistence after reload, deduplication and Live/Sandbox separation passed. Health and rejection of anonymous/spoofed identity requests passed through supported Site service access. A real externally issued AgentMeter API key has not yet been exercised against production.
