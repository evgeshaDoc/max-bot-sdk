import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const packageName = '@tlman/max-bot-sdk';
const temporaryDirectory = mkdtempSync(join(tmpdir(), 'max-sdk-consumer-'));
const subpaths = [
  'api', 'bot', 'composer', 'context', 'filter-query', 'filters', 'middleware', 'session',
  'webhook', 'webhook-adapters', 'webhook-server',
  'core/helpers/attachments', 'core/helpers/buttons', 'core/helpers/keyboard',
  'core/helpers/upload', 'core/network/api/client', 'core/network/api/error',
  'core/network/api/parse-update', 'core/network/api/raw-api',
  'core/network/api/modules/subscriptions/types', 'core/network/api/modules/types',
  'core/network/api/types/attachment', 'core/network/api/types/attachment-request',
  'core/network/api/types/bot', 'core/network/api/types/chat',
  'core/network/api/types/common', 'core/network/api/types/int64',
  'core/network/api/types/keyboard', 'core/network/api/types/markup',
  'core/network/api/types/message', 'core/network/api/types/update',
  'core/network/api/types/uploads', 'core/network/api/types/user',
];

try {
  const packed = run('npm', ['pack', '--json', '--silent', '--pack-destination', temporaryDirectory]);
  const [metadata] = JSON.parse(packed.stdout);
  assert.equal(metadata.id, `${packageName}@0.2.5-tlman.1`);
  assert.match(metadata.integrity, /^sha512-/);
  assert.ok(metadata.files.every(({ path }) => !path.startsWith('src/')));
  assert.ok(!metadata.files.some(({ path }) => path === 'dist/index.js' || path === 'dist/types.js'));

  const tarball = join(temporaryDirectory, metadata.filename);
  writeFileSync(join(temporaryDirectory, 'package.json'), JSON.stringify({ private: true }));
  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', tarball], temporaryDirectory);

  const consumer = `
const assert = require('node:assert/strict');
const { Bot } = require('${packageName}/bot');
const { Context } = require('${packageName}/context');
const { parseUpdate } = require('${packageName}/core/network/api/parse-update');
assert.throws(() => require('${packageName}'));
for (const subpath of ${JSON.stringify(subpaths)}) require('${packageName}/' + subpath);
class CustomContext extends Context {}
let requests = 0;
const fetch = async (input) => {
  requests += 1;
  const path = new URL(String(input)).pathname;
  if (path === '/me') return new Response('{"user_id":1,"first_name":"Bot","username":"bot","is_bot":true,"name":"Bot"}');
  return new Response('{"message":{"recipient":{"chat_id":2,"chat_type":"chat","user_id":null},"timestamp":3,"body":{"mid":"reply","seq":4,"text":"ok","attachments":null}}}');
};
(async () => {
  const bot = new Bot('token', { contextType: CustomContext, clientOptions: { fetch, timeoutMs: 10_000 } });
  bot.use((context) => context.reply('pong'));
  await bot.initialize();
  const parsed = parseUpdate(new TextEncoder().encode('{"update_type":"message_removed","timestamp":1,"message_id":"m","chat_id":2,"user_id":3}'));
  assert.equal(parsed.kind, 'known');
  await bot.dispatchUpdate(parsed.update);
  assert.equal(requests, 2);
})().catch((error) => { console.error(error); process.exitCode = 1; });
`;
  const consumerPath = join(temporaryDirectory, 'consumer.cjs');
  writeFileSync(consumerPath, consumer);
  run(process.execPath, [consumerPath], temporaryDirectory);
  run('bun', [consumerPath], temporaryDirectory);

  const esmConsumer = `
import assert from 'node:assert/strict';
import { parseUpdate } from '${packageName}/core/network/api/parse-update';
import { inlineKeyboard } from '${packageName}/core/helpers/keyboard';
import { callback, createButton } from '${packageName}/core/helpers/buttons';
import { Upload } from '${packageName}/core/helpers/upload';
import '${packageName}/core/network/api/modules/subscriptions/types';
import '${packageName}/core/network/api/modules/types';
for (const subpath of ${JSON.stringify(subpaths)}) {
  await import('${packageName}/' + subpath);
}
await assert.rejects(
  import('${packageName}'),
  (error) => (
    error?.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED'
    || String(error).includes("Cannot find module '${packageName}'")
  ),
);
const parsed = parseUpdate('{"update_type":"future_event","unsafe":9223372036854775808}');
assert.deepEqual(parsed, { kind: 'unknown', updateType: 'future_event' });
assert.equal(inlineKeyboard([[callback('OK', 'ok')]]).type, 'inline_keyboard');
assert.equal(createButton('link', 'MAX', 'https://max.ru').type, 'link');
assert.equal(typeof Upload, 'function');
`;
  const esmConsumerPath = join(temporaryDirectory, 'consumer.mjs');
  writeFileSync(esmConsumerPath, esmConsumer);
  run(process.execPath, [esmConsumerPath], temporaryDirectory);
  run('bun', [esmConsumerPath], temporaryDirectory);

  const typeConsumer = `
import { Bot } from '${packageName}/bot';
import type { ApiTransformer } from '${packageName}/core/network/api/client';
import { Context } from '${packageName}/context';
import { createButton } from '${packageName}/core/helpers/buttons';
import type { FilterQuery } from '${packageName}/filter-query';
import type { MiddlewareFn } from '${packageName}/middleware';
import { session } from '${packageName}/session';
import type { SessionFlavor, StorageAdapter } from '${packageName}/session';
import { nodeHttpWebhookAdapter } from '${packageName}/webhook-adapters';
import { serveWebhook } from '${packageName}/webhook-server';
import type { Int64 } from '${packageName}/core/network/api/types/int64';
import type { ParsedUpdate } from '${packageName}/core/network/api/types/update';
import type { Button } from '${packageName}/core/network/api/types/keyboard';
type AuditFlavor = { audit: { updateType: string } };
type RequestFlavor = { requestId: string };
type PluginContext = Context & AuditFlavor & RequestFlavor;
type SessionContext = Context & SessionFlavor<{ count: number }>;
const id: Int64 = '9223372036854775807';
const button: Button = createButton('callback', 'OK', 'ok');
const query: FilterQuery = 'message_created:text';
const bot = new Bot('token');
const transformer: ApiTransformer = async (next, call) => {
  call.method;
  call.route;
  await next({ timeoutMs: 1000 });
};
bot.api.use(transformer);
const pluginBot = new Bot<PluginContext>('token');
const plugin: MiddlewareFn<PluginContext> = async (context, next) => {
  context.audit = { updateType: context.updateType };
  context.requestId = context.update.timestamp;
  await next();
};
pluginBot.use(plugin);
pluginBot.on('message_created:text', (context) => (
  context.audit.updateType + context.requestId + context.message.body.text
));
const storage: StorageAdapter<{ count: number }> = {
  read: () => undefined,
  write: () => undefined,
  delete: () => undefined,
};
const sessionBot = new Bot<SessionContext>('token');
sessionBot.use(session({
  storage,
  initial: () => ({ count: 0 }),
  getSessionKey: (context) => context.update.timestamp,
}));
const parsed: ParsedUpdate = { kind: 'unknown', updateType: id };
void bot;
void button;
void pluginBot;
void sessionBot;
void parsed;
void query;
void nodeHttpWebhookAdapter;
void serveWebhook;
`;
  const typeConsumerPath = join(temporaryDirectory, 'consumer.ts');
  writeFileSync(typeConsumerPath, typeConsumer);
  run(process.execPath, [
    resolve('node_modules/typescript/bin/tsc'),
    '--noEmit', '--strict', '--skipLibCheck', '--module', 'Node16', '--moduleResolution', 'Node16',
    typeConsumerPath,
  ], temporaryDirectory);

  process.stdout.write(`packed consumer passed: ${metadata.filename} ${metadata.integrity}\n`);
} finally {
  rmSync(temporaryDirectory, { force: true, recursive: true });
}

function run(command, args, cwd = process.cwd()) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed\n${result.stdout}\n${result.stderr}`);
  }
  return result;
}
