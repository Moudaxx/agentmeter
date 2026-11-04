import { pathToFileURL } from 'node:url';
import { UsageClient } from '../sdk.mjs';

const fixture = {
  eventKey: 'agentmeter-onboarding-v1',
  model: 'synthetic-onboarding',
  inputTokens: 100000,
  outputTokens: 20000,
  inputPrice: 2,
  outputPrice: 5,
};

export async function checkSandbox(client) {
  const path = '/api/usage?environment=sandbox';
  const before = await client.request(path);
  if (before.environment !== 'sandbox') {
    throw new Error('This check requires the hosted Sandbox ledger.');
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await client.request(path, fixture);
    if (result.environment !== 'sandbox' || result.event?.costUsd !== 0.3 ||
        !Object.entries(fixture).every(([key, value]) => result.event[key] === value)) {
      throw new Error('Sandbox returned an unexpected event or cost.');
    }
    if (attempt === 1 && result.duplicate !== true) {
      throw new Error('The retry was not reported as a duplicate.');
    }
  }
  return { environment: 'sandbox', eventKey: fixture.eventKey, costUsd: 0.3, retryDeduplicated: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (!process.env.PRODUCT_API_KEY) throw new Error('Set PRODUCT_API_KEY to a Sandbox write key.');
    const client = new UsageClient('https://agentmeter.btcmax.chatgpt.site', process.env.PRODUCT_API_KEY, {
      siteAccessToken: process.env.SITES_ACCESS_TOKEN,
    });
    console.log(JSON.stringify(await checkSandbox(client), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
