import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';

const requiredEnvironment = [
  'LIVE_PACKAGE_ROOT',
  'MAX_TEST_BOT_TOKEN',
  'MAX_TEST_WEBHOOK_BASE_URL',
  'MAX_TEST_RECEIVER_CONTROL_URL',
  'MAX_TEST_RECEIVER_CONTROL_TOKEN',
  'RELEASE_VERSION',
];
for (const name of requiredEnvironment) {
  if (!process.env[name]) throw new Error(`Missing required release environment: ${name}`);
}

const requireCandidate = createRequire(join(process.env.LIVE_PACKAGE_ROOT, 'package.json'));
const { Bot } = requireCandidate('@tlman/max-bot-sdk/bot');
const { parseUpdate } = requireCandidate('@tlman/max-bot-sdk/core/network/api/parse-update');
const runId = randomUUID();
const webhookUrl = new URL(runId, withTrailingSlash(process.env.MAX_TEST_WEBHOOK_BASE_URL)).toString();
const secret = randomUUID().replaceAll('-', '_');
const controlUrl = withTrailingSlash(process.env.MAX_TEST_RECEIVER_CONTROL_URL);
const bot = new Bot(process.env.MAX_TEST_BOT_TOKEN);
let dispatched = false;
let creationAttempted = false;
let armed = false;

bot.use(() => {
  dispatched = true;
});

try {
  await bot.initialize();
  await control('arm', { secret, webhookUrl });
  armed = true;
  creationAttempted = true;
  const created = await bot.api.createSubscription({
    url: webhookUrl,
    secret,
    update_types: ['message_created'],
  });
  assert.equal(created.success, true, created.message);

  const listed = await bot.api.getSubscriptions();
  const subscription = listed.subscriptions.find((item) => item.url === webhookUrl);
  assert.ok(subscription);
  assert.deepEqual(subscription.update_types, ['message_created']);

  const receipt = await control('trigger', { updateType: 'message_created', webhookUrl });
  assert.equal(receipt.secretMatched, true);
  assert.equal(receipt.status, 200);
  const parsed = parseUpdate(Buffer.from(receipt.rawBodyBase64, 'base64'));
  assert.equal(parsed.kind, 'known');
  await bot.dispatchUpdate(parsed.update);
  assert.equal(dispatched, true);
  assert.equal(receipt.redactionReviewed, true);
  const redactedBody = Buffer.from(receipt.redactedBodyBase64, 'base64');
  assert.equal(parseUpdate(redactedBody).kind, 'known');
  preserveEvidence(redactedBody);
} finally {
  try {
    if (creationAttempted) {
      await bot.api.deleteSubscription(webhookUrl);
      const remaining = await bot.api.getSubscriptions();
      assert.ok(!remaining.subscriptions.some((subscription) => subscription.url === webhookUrl));
    }
  } finally {
    if (armed) await control('disarm', { webhookUrl });
  }
}

process.stdout.write(`live webhook gate passed for ${runId}\n`);

async function control(action, body) {
  const response = await fetch(new URL(action, controlUrl), {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.MAX_TEST_RECEIVER_CONTROL_TOKEN}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Receiver control ${action} failed with HTTP ${response.status}`);
  return response.json();
}

function withTrailingSlash(value) {
  return value.endsWith('/') ? value : `${value}/`;
}

function preserveEvidence(redactedBody) {
  const directory = 'live-evidence';
  const fixtureName = `webhook-${runId}.json`;
  const sha256 = createHash('sha256').update(redactedBody).digest('hex');
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, fixtureName), redactedBody);
  writeFileSync(join(directory, 'manifest.json'), JSON.stringify({
    candidateVersion: process.env.RELEASE_VERSION,
    capturedAt: new Date().toISOString(),
    fixture: fixtureName,
    redactionReviewed: true,
    sha256,
    source: 'protected MAX test bot webhook gate',
  }, null, 2));
}
