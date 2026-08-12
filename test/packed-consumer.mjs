import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const packageName = '@tlman/max-bot-sdk';
const temporaryDirectory = mkdtempSync(join(tmpdir(), 'max-sdk-consumer-'));

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
const { parseUpdate } = require('${packageName}/parse-update');
assert.throws(() => require('${packageName}'));
for (const subpath of [
  'api', 'bot', 'composer', 'context', 'filters', 'middleware', 'webhook',
  'attachments', 'buttons', 'keyboard', 'upload', 'client', 'errors', 'parse-update',
  'raw-api', 'modules/subscriptions', 'api-methods', 'types/attachment',
  'types/attachment-request', 'types/bot', 'types/chat', 'types/common', 'types/int64',
  'types/keyboard', 'types/markup', 'types/message', 'types/update', 'types/upload', 'types/user',
]) require('${packageName}/' + subpath);
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
import { parseUpdate } from '${packageName}/parse-update';
import { inlineKeyboard } from '${packageName}/keyboard';
import { callback } from '${packageName}/buttons';
import { Upload } from '${packageName}/upload';
import '${packageName}/modules/subscriptions';
import '${packageName}/api-methods';
const parsed = parseUpdate('{"update_type":"future_event","unsafe":9223372036854775808}');
assert.deepEqual(parsed, { kind: 'unknown', updateType: 'future_event' });
assert.equal(inlineKeyboard([[callback('OK', 'ok')]]).type, 'inline_keyboard');
assert.equal(typeof Upload, 'function');
`;
  const esmConsumerPath = join(temporaryDirectory, 'consumer.mjs');
  writeFileSync(esmConsumerPath, esmConsumer);
  run(process.execPath, [esmConsumerPath], temporaryDirectory);
  run('bun', [esmConsumerPath], temporaryDirectory);

  const typeConsumer = `
import { Bot } from '${packageName}/bot';
import type { Int64 } from '${packageName}/types/int64';
import type { ParsedUpdate } from '${packageName}/types/update';
const id: Int64 = '9223372036854775807';
const bot = new Bot('token');
const parsed: ParsedUpdate = { kind: 'unknown', updateType: id };
void bot;
void parsed;
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
