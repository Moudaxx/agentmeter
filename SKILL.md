---
name: amtr-usage
description: Record AI agent usage and read recorded costs through an authenticated MCP endpoint.
---
Use the product's /mcp endpoint with the PRODUCT_API_KEY bearer token stored in your agent's secret manager. Call record_usage with an idempotent eventKey, model, integer inputTokens/outputTokens, and your explicit USD-per-million inputPrice/outputPrice. Read usage_summary. Do not invent provider pricing or recorded usage. Never publish the API key.

