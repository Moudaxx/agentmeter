# AgentMeter

Record AI agent usage and calculate cost using your own provider rates. A small, self-hosted ledger with a REST API, JavaScript SDK, CLI and MCP tools, built with Agent Fun Studio.

[Public calculator](https://agentmeter.btcmax.chatgpt.site/) · [Product checks](https://github.com/Moudaxx/agentmeter/actions)

## What runs today

- A public browser-local calculator and the approved symbol-only logo.
- An authenticated usage API with explicit USD-per-million prices and idempotent event IDs.
- JavaScript SDK, CLI and a basic JSON-over-HTTP MCP endpoint: `record_usage` and `usage_summary`.
- A persistent single-process JSON ledger, Docker packaging and automated tests.

The public website hosts the calculator only. The API in this repository requires a separate server deployment. It does not automatically collect provider usage, charge customers, manage wallets or trade tokens. MCP supports initialize and tools requests; SSE, sessions and OAuth are not implemented.

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

