import assert from 'node:assert/strict';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import {
  existsSync, mkdtempSync, readFileSync, rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { URec } from '@tsofist/stem';
import { isLosslessNumber } from 'lossless-json';

import { Api } from '../src/api';
import { createClient } from '../src/core/network/api/client';
import { MaxError, MaxErrorKind } from '../src/core/network/api/error';
import { RawApi } from '../src/core/network/api/raw-api';

const user = '{"user_id":9007199254740993,"first_name":"Bot","username":"bot",'
  + '"is_bot":true,"name":"Bot"}';
const chat = '{"chat_id":9007199254740993,"type":"chat","status":"active","title":"Chat",'
  + '"icon":null,"last_event_time":9007199254740994,"participants_count":1,"is_public":false,'
  + '"description":null}';
const member = '{"user_id":9007199254740993,"first_name":"User","username":null,'
  + '"is_bot":false,"name":"User","last_access_time":9007199254740994,"is_owner":false,'
  + '"is_admin":false,"join_time":9007199254740995}';
const message = '{"recipient":{"chat_id":9007199254740993,"chat_type":"chat","user_id":null},'
  + '"timestamp":9007199254740994,"body":{"mid":"m","seq":116328147937082782,'
  + '"text":"ok","attachments":null}}';
const action = '{"success":true}';

interface EndpointCase {
  readonly name: string;
  readonly method: string;
  readonly route: string;
  readonly response: string;
  readonly body?: string;
  readonly invoke: (api: RawApi) => Promise<unknown>;
}

const cases: readonly EndpointCase[] = [
  {
    name: 'get me',
    method: 'GET',
    route: '/me',
    response: user,
    invoke: (api) => api.bots.getMyInfo(),
  },
  {
    name: 'set commands',
    method: 'PATCH',
    route: '/me/commands',
    response: '{"commands":[]}',
    body: '{"commands":[]}',
    invoke: (api) => api.bots.editMyCommands({ commands: [] }),
  },
  {
    name: 'get chat',
    method: 'GET',
    route: '/chats/9007199254740993',
    response: chat,
    invoke: (api) => api.chats.getById({ chat_id: '9007199254740993' }),
  },
  {
    name: 'edit chat',
    method: 'PATCH',
    route: '/chats/9007199254740993',
    response: chat,
    body: '{"title":"Title"}',
    invoke: (api) => api.chats.edit({ chat_id: '9007199254740993', title: 'Title' }),
  },
  {
    name: 'send action',
    method: 'POST',
    route: '/chats/9007199254740993/actions',
    response: action,
    body: '{"action":"typing_on"}',
    invoke: (api) => api.chats.sendAction({ chat_id: '9007199254740993', action: 'typing_on' }),
  },
  {
    name: 'get pin',
    method: 'GET',
    route: '/chats/9007199254740993/pin',
    response: '{"message":null}',
    invoke: (api) => api.chats.getPinnedMessage({ chat_id: '9007199254740993' }),
  },
  {
    name: 'set pin',
    method: 'PUT',
    route: '/chats/9007199254740993/pin',
    response: action,
    body: '{"message_id":"m"}',
    invoke: (api) => api.chats.pinMessage({ chat_id: '9007199254740993', message_id: 'm' }),
  },
  {
    name: 'delete pin',
    method: 'DELETE',
    route: '/chats/9007199254740993/pin',
    response: action,
    invoke: (api) => api.chats.unpinMessage({ chat_id: '9007199254740993' }),
  },
  {
    name: 'get membership',
    method: 'GET',
    route: '/chats/9007199254740993/members/me',
    response: member,
    invoke: (api) => api.chats.getChatMembership({ chat_id: '9007199254740993' }),
  },
  {
    name: 'leave chat',
    method: 'DELETE',
    route: '/chats/9007199254740993/members/me',
    response: action,
    invoke: (api) => api.chats.leaveChat({ chat_id: '9007199254740993' }),
  },
  {
    name: 'get admins',
    method: 'GET',
    route: '/chats/9007199254740993/members/admins',
    response: `{"members":[${member}],"marker":9007199254740996}`,
    invoke: (api) => api.chats.getChatAdmins({ chat_id: '9007199254740993' }),
  },
  {
    name: 'set admins',
    method: 'POST',
    route: '/chats/9007199254740993/members/admins',
    response: action,
    body: '{"admins":[{"user_id":9007199254740994,"permissions":["write"]}]}',
    invoke: (api) => api.chats.setChatAdmins({
      chat_id: '9007199254740993',
      admins: [{
        user_id: '9007199254740994', permissions: ['write'],
      }],
    }),
  },
  {
    name: 'revoke admin',
    method: 'DELETE',
    route: '/chats/9007199254740993/members/admins/9007199254740994',
    response: action,
    invoke: (api) => api.chats.revokeChatAdmin({
      chat_id: '9007199254740993', user_id: '9007199254740994',
    }),
  },
  {
    name: 'get members',
    method: 'GET',
    route: '/chats/9007199254740993/members?user_ids=9007199254740994&marker=9007199254740995&count=1',
    response: `{"members":[${member}],"marker":9007199254740996}`,
    invoke: (api) => api.chats.getChatMembers({
      chat_id: '9007199254740993',
      user_ids: ['9007199254740994'],
      marker: '9007199254740995',
      count: 1,
    }),
  },
  {
    name: 'add members',
    method: 'POST',
    route: '/chats/9007199254740993/members',
    response: '{"success":false,"message":"rejected","failed_user_ids":[9007199254740994]}',
    body: '{"user_ids":[9007199254740994]}',
    invoke: (api) => api.chats.addChatMembers({
      chat_id: '9007199254740993', user_ids: ['9007199254740994'],
    }),
  },
  {
    name: 'remove member',
    method: 'DELETE',
    route: '/chats/9007199254740993/members?user_id=9007199254740994&block=false',
    response: action,
    invoke: (api) => api.chats.removeChatMember({
      chat_id: '9007199254740993', user_id: '9007199254740994', block: false,
    }),
  },
  {
    name: 'get subscriptions',
    method: 'GET',
    route: '/subscriptions',
    response: '{"subscriptions":[{"url":"https://bot.test/hook","time":9007199254740993,'
      + '"update_types":null}]}',
    invoke: (api) => api.subscriptions.getSubscriptions(),
  },
  {
    name: 'create subscription',
    method: 'POST',
    route: '/subscriptions',
    response: action,
    body: '{"url":"https://bot.test/hook"}',
    invoke: (api) => api.subscriptions.createSubscription({ url: 'https://bot.test/hook' }),
  },
  {
    name: 'delete subscription',
    method: 'DELETE',
    route: '/subscriptions?url=https%3A%2F%2Fbot.test%2Fhook',
    response: '{"success":false}',
    invoke: (api) => api.subscriptions.deleteSubscription({ url: 'https://bot.test/hook' }),
  },
  {
    name: 'get updates',
    method: 'GET',
    route: '/updates?limit=1&timeout=0&marker=9007199254740993',
    response: '{"updates":[],"marker":9007199254740994}',
    invoke: (api) => api.subscriptions.getUpdates({
      limit: 1, timeout: 0, marker: '9007199254740993',
    }),
  },
  {
    name: 'get upload URL',
    method: 'POST',
    route: '/uploads?type=image',
    response: '{"url":"https://upload.test/file","token":"t"}',
    invoke: (api) => api.uploads.getUploadUrl({ type: 'image' }),
  },
  {
    name: 'get messages',
    method: 'GET',
    route: '/messages?chat_id=9007199254740993&count=1',
    response: `{"messages":[${message}]}`,
    invoke: (api) => api.messages.get({ chat_id: '9007199254740993', count: 1 }),
  },
  {
    name: 'send message',
    method: 'POST',
    route: '/messages?chat_id=9007199254740993',
    response: `{"message":${message}}`,
    body: '{"text":"hello","attachments":null,"link":null}',
    invoke: (api) => api.messages.send({
      chat_id: '9007199254740993', text: 'hello', attachments: null, link: null,
    }),
  },
  {
    name: 'edit message',
    method: 'PUT',
    route: '/messages?message_id=m',
    response: action,
    body: '{"text":"edited","attachments":null,"link":null}',
    invoke: (api) => api.messages.edit({
      message_id: 'm', text: 'edited', attachments: null, link: null,
    }),
  },
  {
    name: 'delete message',
    method: 'DELETE',
    route: '/messages?message_id=m',
    response: action,
    invoke: (api) => api.messages.delete({ message_id: 'm' }),
  },
  {
    name: 'get message',
    method: 'GET',
    route: '/messages/m',
    response: message,
    invoke: (api) => api.messages.getById({ message_id: 'm' }),
  },
  {
    name: 'get video',
    method: 'GET',
    route: '/videos/token',
    response: '{"token":"token","width":1,"height":1,"duration":1,'
      + '"thumbnail":{"photo_id":9007199254740993,"token":"p","url":"https://image.test"}}',
    invoke: (api) => api.videos.get({ video_token: 'token' }),
  },
  {
    name: 'answer callback',
    method: 'POST',
    route: '/answers?callback_id=callback',
    response: action,
    body: '{"notification":"ok"}',
    invoke: (api) => api.messages.answerOnCallback({ callback_id: 'callback', notification: 'ok' }),
  },
];

test('the injected-fetch table covers exactly 28 current methods', async (context) => {
  assert.equal(cases.length, 28);

  for (const endpoint of cases) {
    await context.test(endpoint.name, async () => {
      let calls = 0;
      let transformerCalls = 0;
      const fetchMock: typeof fetch = async (input, init) => {
        calls += 1;
        const url = new URL(String(input));
        assert.equal(init?.method, endpoint.method);
        assert.equal(`${url.pathname}${url.search}`, endpoint.route);
        assert.equal(new Headers(init?.headers).get('authorization'), 'secret-token');
        assert.equal(init?.body, endpoint.body);
        return new Response(endpoint.response, {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      };
      const client = createClient('secret-token', {
        baseUrl: 'https://api.test', fetch: fetchMock,
      });
      client.use(async (next) => {
        transformerCalls += 1;
        await next();
      });
      const api = new RawApi(client);
      const result = await endpoint.invoke(api);
      assertJsonNative(result);
      assert.equal(calls, 1);
      assert.equal(transformerCalls, 1);
    });
  }
});

function assertJsonNative(value: unknown): void {
  assert.notEqual(typeof value, 'bigint');
  assert.equal(isLosslessNumber(value), false);
  if (Array.isArray(value)) {
    for (const item of value) assertJsonNative(item);
  } else if (typeof value === 'object' && value !== null) {
    for (const item of Object.values(value)) assertJsonNative(item);
  }
}

test('action responses are returned unchanged and malformed success shapes fail', async () => {
  const bodies = [
    '{"success":true}',
    '{"success":true,"message":"accepted"}',
    '{"success":false}',
    '{"success":false,"message":"rejected"}',
  ];
  for (const body of bodies) {
    const api = new RawApi(createClient('token', {
      fetch: async () => new Response(body, { status: 200 }),
    }));
    assert.deepEqual(await api.subscriptions.createSubscription({ url: 'https://bot.test' }), JSON.parse(body));
  }

  const api = new RawApi(createClient('token', {
    fetch: async () => new Response('{"message":"missing success"}', { status: 200 }),
  }));
  await assert.rejects(api.subscriptions.deleteSubscription({ url: 'https://bot.test' }));
});

test('friendly subscriptions reject invalid delivery settings before fetch', async () => {
  let calls = 0;
  const api = new Api(createClient('token', {
    fetch: async () => {
      calls += 1;
      return new Response(action);
    },
  }));
  const invalid = [
    () => api.createSubscription({ url: 'http://bot.test' as `https://${string}` }),
    () => api.createSubscription({ url: 'https://bot.test:443' }),
    () => api.createSubscription({ url: 'https://bot.test', secret: 'bad!' }),
    () => api.createSubscription({
      url: 'https://bot.test', update_types: ['legacy' as 'message_created'],
    }),
    () => api.deleteSubscription('https://user:password@bot.test'),
  ];
  for (const invoke of invalid) {
    await assert.rejects(invoke(), (error) => error instanceof MaxError
      && error.kind === MaxErrorKind.Protocol);
  }
  assert.equal(calls, 0);
});

test('known 2xx response shapes reject missing required fields and stale enums', async () => {
  for (const response of ['null', '{"user_id":1}',
    '{"chat_id":1,"type":"chat","status":"suspended"}']) {
    const raw = new RawApi(createClient('token', {
      fetch: async () => new Response(response, { status: 200 }),
    }));
    await assert.rejects(
      response.includes('chat_id')
        ? raw.chats.getById({ chat_id: '1' })
        : raw.bots.getMyInfo(),
      (error) => error instanceof MaxError && error.kind === MaxErrorKind.Protocol,
    );
  }

  const malformedMessage = '{"recipient":{"chat_id":1,"chat_type":"chat","user_id":null},'
    + '"timestamp":2,"body":{"mid":"m","seq":3,"text":null,'
    + '"attachments":[{"type":"future_attachment"}]}}';
  const raw = new RawApi(createClient('token', {
    fetch: async () => new Response(malformedMessage, { status: 200 }),
  }));
  await assert.rejects(raw.messages.getById({ message_id: 'm' }), (error) => {
    return error instanceof MaxError && error.kind === MaxErrorKind.Protocol;
  });
});

test('default long polling omits the empty types query', async () => {
  let requestUrl = '';
  const api = new Api(createClient('token', {
    fetch: async (input) => {
      requestUrl = String(input);
      return new Response('{"updates":[],"marker":null}', { status: 200 });
    },
  }));
  await api.getUpdates();
  assert.equal(new URL(requestUrl).searchParams.has('types'), false);
});

test('friendly API positional arguments win over widened extras', async (context) => {
  const extra = {
    chat_id: '2' as const,
    user_id: '3' as const,
    text: 'attacker',
    message_id: 'wrong',
    callback_id: 'wrong',
    types: ['bot_started' as const],
    notify: false,
    title: 'Title',
    count: 1,
    limit: 1,
    notification: 'ok',
  };
  const friendlyCases = [
    {
      name: 'chat send',
      invoke: (api: Api) => api.sendMessageToChat('1', 'trusted', extra),
      response: `{"message":${message}}`,
      query: { chat_id: '1' },
      body: { text: 'trusted', notify: false },
    },
    {
      name: 'user send',
      invoke: (api: Api) => api.sendMessageToUser('1', 'trusted', extra),
      response: `{"message":${message}}`,
      query: { user_id: '1' },
      body: { text: 'trusted', notify: false },
    },
    {
      name: 'edit chat',
      invoke: (api: Api) => api.editChatInfo('1', extra),
      response: chat,
      path: '/chats/1',
      body: { title: 'Title' },
    },
    {
      name: 'get messages',
      invoke: (api: Api) => api.getMessages('1', extra),
      response: '{"messages":[]}',
      query: { chat_id: '1' },
    },
    {
      name: 'edit message',
      invoke: (api: Api) => api.editMessage('trusted', extra),
      response: action,
      query: { message_id: 'trusted' },
      body: { text: 'attacker', notify: false },
    },
    {
      name: 'delete message',
      invoke: (api: Api) => api.deleteMessage('trusted', extra),
      response: action,
      query: { message_id: 'trusted' },
    },
    {
      name: 'callback',
      invoke: (api: Api) => api.answerOnCallback('trusted', extra),
      response: action,
      query: { callback_id: 'trusted' },
      body: { notification: 'ok' },
    },
    {
      name: 'members',
      invoke: (api: Api) => api.getChatMembers('1', extra),
      response: '{"members":[],"marker":null}',
      path: '/chats/1/members',
    },
    {
      name: 'updates',
      invoke: (api: Api) => api.getUpdates('message_created', extra),
      response: '{"updates":[],"marker":null}',
      query: { types: 'message_created' },
    },
    {
      name: 'pin',
      invoke: (api: Api) => api.pinMessage('1', 'trusted', extra),
      response: action,
      path: '/chats/1/pin',
      body: { message_id: 'trusted', notify: false },
    },
  ];
  for (const item of friendlyCases) {
    await context.test(item.name, async () => {
      let calls = 0;
      const api = new Api(createClient('token', {
        fetch: async (input, init) => {
          calls += 1;
          const url = new URL(String(input));
          if (item.path) assert.equal(url.pathname, item.path);
          for (const [key, value] of Object.entries(item.query ?? {})) {
            assert.equal(url.searchParams.get(key), value);
          }
          if (item.name === 'chat send') assert.equal(url.searchParams.has('user_id'), false);
          if (item.name === 'user send') assert.equal(url.searchParams.has('chat_id'), false);
          const body = JSON.parse(String(init?.body ?? '{}')) as URec;
          for (const [key, value] of Object.entries(item.body ?? {})) {
            assert.equal(body[key], value);
          }
          return new Response(item.response);
        },
      }));
      await item.invoke(api);
      assert.equal(calls, 1);
    });
  }
});

test('release version input is validated as data without shell execution', () => {
  const workflow = readFileSync('.github/workflows/release.yml', 'utf8');
  const validation = workflow.match(/name: Validate requested version\n {8}run: \|\n((?: {10}.*\n)+)/)?.[1]
    .replace(/^ {10}/gm, '');
  assert.ok(validation);
  const directory = mkdtempSync(join(tmpdir(), 'max-sdk-release-'));
  const marker = join(directory, 'executed');
  const { version } = (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string });
  try {
    for (const input of [version, `$(touch ${marker})`, `x"; touch ${marker}; #`, '1.2.3', 'v1.2.3', `${version}\n`]) {
      const result: SpawnSyncReturns<string> = spawnSync('bash', ['-e', '-c', validation], {
        env: { ...process.env, RELEASE_VERSION: input }, encoding: 'utf8',
      });
      assert.equal(existsSync(marker), false, 'version must not execute shell syntax');
      assert.equal(result.status === 0, input === version, result.stderr);
    }
    for (const run of workflow.matchAll(/run: (?:\|\n(?: {10}.*\n)+|.*)/g)) {
      assert.doesNotMatch(run[0], /\$\{\{/);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('release approval policy fails closed without required environment reviewers', () => {
  const workflow = readFileSync('.github/workflows/release.yml', 'utf8');
  const script = workflow.match(/name: Verify release approval policy[\s\S]*?run: \|\n((?: {10}.*\n)+)/)?.[1]
    .replace(/^ {10}/gm, '');
  assert.ok(script);
  assert.match(workflow, /release:\n {4}needs: approval-policy/);
  const directory = mkdtempSync(join(tmpdir(), 'max-sdk-approval-'));
  try {
    for (const rules of [[], [{ type: 'required_reviewers', reviewers: [] }],
      [{ type: 'required_reviewers', reviewers: [{ type: 'User', reviewer: { id: 1 } }] }]]) {
      const result: SpawnSyncReturns<string> = spawnSync('bash', ['-e', '-c', `gh() { printf '%s' "$RULES"; }\n${script}`], {
        cwd: directory, env: { ...process.env, RULES: JSON.stringify(rules) }, encoding: 'utf8',
      });
      assert.equal(result.status === 0, (rules[0]?.reviewers.length ?? 0) > 0, result.stderr);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
