import assert from 'node:assert/strict';
import test from 'node:test';

import { Api } from '../src/api';
import { createClient } from '../src/core/network/api/client';
import { MaxError, MaxErrorKind } from '../src/core/network/api/error';
import { RawApi } from '../src/core/network/api/raw-api';
import type { ApiTransformer } from '../src/core/network/api/transformer-types';

test('transformer errors preserve identity and final request ambiguity', async () => {
  for (const method of ['POST', 'GET'] as const) {
    for (const outcome of ['before', 'success', 'network', '400', '500'] as const) {
      for (const original of [new Error('transformer'), new MaxError('transformer', { kind: MaxErrorKind.Protocol })]) {
        let requests = 0;
        const client = createClient('token', {
          fetch: async () => {
            requests += 1;
            if (outcome === 'network') throw new Error('network');
            return new Response('{}', { status: Number(outcome) || 200 });
          },
        });
        client.use(async (next) => {
          if (outcome !== 'before') {
            try { await next(); } catch { /* replace the downstream failure */ }
          }
          throw original;
        });
        await assert.rejects(client.call({ path: 'custom', options: { method } }), (error) => {
          assert.equal(error, original);
          assert.equal(Reflect.get(original, 'method'), method);
          assert.equal(Reflect.get(original, 'path'), 'custom');
          assert.equal(
            Reflect.get(original, 'ambiguousOutcome'),
            method === 'POST' && outcome !== 'before' && outcome !== '400',
          );
          return true;
        });
        assert.equal(requests, outcome === 'before' ? 0 : 1);
      }
    }
  }
});

test('primitive and frozen transformer failures retain identity when metadata cannot be attached', async () => {
  for (const original of [undefined, null, 'failure', 42, Object.freeze(new Error('frozen'))]) {
    const client = createClient('token', { fetch: async () => new Response('{}') });
    client.use(async (next) => {
      await next();
      // eslint-disable-next-line @typescript-eslint/no-throw-literal -- Test primitive throws.
      throw original;
    });
    await assert.rejects(
      client.call({ path: 'custom', options: { method: 'POST' } }),
      (error) => error === original,
    );
  }
});

test('transformers preserve onion order, own-property replacements, and trusted parsing', async () => {
  const order: string[] = [];
  let requests = 0;
  const controller = new AbortController();
  const client = createClient('token', {
    baseUrl: 'https://api.test',
    fetch: async (input, init) => {
      requests += 1;
      assert.equal(String(input), 'https://api.test/custom/?zero=0&disabled=false&empty=');
      assert.equal(init?.body, undefined);
      assert.equal(new Headers(init?.headers).has('content-type'), false);
      return new Response('{"object_id":116328147937082782}');
    },
  });

  client.use(
    async (next, call) => {
      order.push('A before');
      assert.deepEqual(Object.keys(call), ['method', 'route', 'request']);
      assert.equal(Object.isFrozen(call), true);
      assert.equal(Object.isFrozen(call.request), true);
      assert.equal(call.method, 'POST');
      assert.equal(call.route, 'custom/{id}');
      assert.equal(call.request.signal, controller.signal);
      const response = await next({
        path: { id: '' },
        query: {
          zero: 0,
          disabled: false,
          empty: '',
          nil: null,
        },
        body: null,
      });
      assert.deepEqual(response.data, { object_id: '116328147937082782' });
      order.push('A after');
    },
    async (next, call) => {
      order.push('B before');
      assert.deepEqual(call.request.path, { id: '' });
      assert.deepEqual(call.request.query, {
        zero: 0,
        disabled: false,
        empty: '',
        nil: null,
      });
      assert.equal(call.request.body, null);
      assert.equal(call.request.signal, controller.signal);
      assert.equal(call.request.timeoutMs, 200);
      await next({ body: undefined, signal: undefined, timeoutMs: undefined });
      order.push('B after');
    },
  );

  const result = await client.call({
    path: 'custom/{id}',
    options: {
      method: 'POST',
      path: { id: 'original' },
      query: { old: 1 },
      body: { old: true },
      signal: controller.signal,
      timeoutMs: 200,
      responseDescriptor: { object_id: true },
    },
  });

  assert.deepEqual(result.data, { object_id: '116328147937082782' });
  assert.deepEqual(order, [
    'A before', 'B before', 'B after', 'A after',
  ]);
  assert.equal(requests, 1);
});

test('transformers cannot replace trusted method, descriptors, or parser', async () => {
  let requests = 0;
  const client = createClient('token', {
    baseUrl: 'https://api.test',
    fetch: async (input, init) => {
      requests += 1;
      assert.equal(String(input), 'https://api.test/custom');
      assert.equal(init?.method, 'POST');
      assert.equal(init?.body, '{"object_id":116328147937082782}');
      return new Response('trusted response');
    },
  });
  client.use(async (next) => {
    const attemptedReplacement = {
      method: 'GET',
      route: 'other',
      requestDescriptor: undefined,
      responseDescriptor: undefined,
      parseResponse: () => ({ replaced: true }),
      body: { object_id: '116328147937082782' },
    };
    await next(attemptedReplacement);
  });

  const result = await client.call({
    path: 'custom',
    options: {
      method: 'POST',
      body: { object_id: '1' },
      requestDescriptor: { object_id: true },
      parseResponse(text) {
        return { text };
      },
    },
  });

  assert.deepEqual(result.data, { text: 'trusted response' });
  assert.equal(requests, 1);
});

test('exact-once frames handle detached, delayed, sequential, and parallel next calls', async () => {
  const unhandled: unknown[] = [];
  function captureUnhandled(reason: unknown): void {
    unhandled.push(reason);
  }
  process.on('unhandledRejection', captureUnhandled);

  try {
    let detachedCalls = 0;
    const detached = createClient('token', {
      fetch: async () => {
        detachedCalls += 1;
        return new Response('{}');
      },
    });
    detached.use((next) => {
      next();
    });
    await detached.call({ path: 'custom', options: {} });
    assert.equal(detachedCalls, 1);

    let zeroCalls = 0;
    const zero = createClient('token', {
      fetch: async () => {
        zeroCalls += 1;
        return new Response('{}');
      },
    });
    zero.use(() => {});
    await assert.rejects(
      zero.call({ path: 'custom', options: { method: 'POST' } }),
      protocolErrorWithAmbiguity(false),
    );
    assert.equal(zeroCalls, 0);

    let delayedCalls = 0;
    let delayedNext: Promise<unknown> | undefined;
    const delayed = createClient('token', {
      fetch: async () => {
        delayedCalls += 1;
        return new Response('{}');
      },
    });
    delayed.use((next) => {
      setTimeout(() => {
        delayedNext = next();
      }, 0);
    });
    await assert.rejects(
      delayed.call({ path: 'custom', options: { method: 'POST' } }),
      protocolErrorWithAmbiguity(false),
    );
    await waitForTimers();
    await assert.rejects(
      delayedNext ?? Promise.resolve(),
      protocolErrorWithAmbiguity(false),
    );
    assert.equal(delayedCalls, 0);

    let lateDuplicate: Promise<unknown> | undefined;
    const lateDuplicateClient = createClient('token', {
      fetch: async () => new Response('{}'),
    });
    lateDuplicateClient.use(async (next) => {
      await next();
      setTimeout(() => {
        lateDuplicate = next();
      }, 0);
    });
    await lateDuplicateClient.call({ path: 'custom', options: { method: 'POST' } });
    await waitForTimers();
    await assert.rejects(
      lateDuplicate ?? Promise.resolve(),
      protocolErrorWithAmbiguity(true),
    );

    let sequentialCalls = 0;
    const sequential = createClient('token', {
      fetch: async () => {
        sequentialCalls += 1;
        return new Response('{}');
      },
    });
    sequential.use(async (next) => {
      await next();
      await next();
    });
    await assert.rejects(
      sequential.call({ path: 'custom', options: { method: 'POST' } }),
      protocolErrorWithAmbiguity(true),
    );
    assert.equal(sequentialCalls, 1);

    let parallelCalls = 0;
    const parallel = createClient('token', {
      fetch: async () => {
        parallelCalls += 1;
        return new Response('{}');
      },
    });
    parallel.use(async (next) => {
      await Promise.all([next(), next()]);
    });
    await assert.rejects(
      parallel.call({ path: 'custom', options: { method: 'POST' } }),
      protocolErrorWithAmbiguity(true),
    );
    assert.equal(parallelCalls, 1);

    for (const [method, ambiguous] of [['POST', true], ['GET', false]] as const) {
      let rejectingCalls = 0;
      const rejecting = createClient('token', {
        fetch: async () => {
          rejectingCalls += 1;
          throw new Error('network failure');
        },
      });
      rejecting.use(async (next) => {
        await Promise.all([next(), next()]);
      });
      await assert.rejects(
        rejecting.call({ path: 'custom', options: { method } }),
        protocolErrorWithAmbiguity(ambiguous),
      );
      assert.equal(rejectingCalls, 1);
    }

    const authoredError = new Error('authored duplicate failure');
    let authoredCalls = 0;
    const authored = createClient('token', {
      fetch: async () => {
        authoredCalls += 1;
        return new Response('{}');
      },
    });
    authored.use((next) => {
      next();
      next();
      throw authoredError;
    });
    await assert.rejects(
      authored.call({ path: 'custom', options: { method: 'POST' } }),
      (error) => error === authoredError,
    );
    assert.equal(authoredCalls, 1);

    let detachedDuplicateCalls = 0;
    const detachedDuplicate = createClient('token', {
      fetch: async () => {
        detachedDuplicateCalls += 1;
        return new Response('{}');
      },
    });
    detachedDuplicate.use((next) => {
      next();
      next();
    });
    await assert.rejects(
      detachedDuplicate.call({ path: 'custom', options: { method: 'POST' } }),
      protocolErrorWithAmbiguity(true),
    );

    let getCalls = 0;
    const get = createClient('token', {
      fetch: async () => {
        getCalls += 1;
        return new Response('{}');
      },
    });
    get.use(async (next) => {
      await next();
      await next();
    });
    await assert.rejects(
      get.call({ path: 'custom', options: {} }),
      protocolErrorWithAmbiguity(false),
    );

    let invalidCalls = 0;
    const invalid = createClient('token', {
      fetch: async () => {
        invalidCalls += 1;
        return new Response('{}');
      },
    });
    invalid.use(async (next) => {
      await next({ path: { chat_id: Number.MAX_SAFE_INTEGER + 1 } }).catch(() => undefined);
      await next();
    });
    await assert.rejects(
      invalid.call({
        path: 'chats/{chat_id}/members',
        options: { method: 'POST', path: { chat_id: '1' }, body: { user_ids: ['2'] } },
      }),
      protocolErrorWithAmbiguity(false),
    );

    await waitForTimers();
    assert.equal(detachedDuplicateCalls, 1);
    assert.equal(getCalls, 1);
    assert.equal(invalidCalls, 0);
    assert.deepEqual(unhandled, []);
  } finally {
    process.removeListener('unhandledRejection', captureUnhandled);
  }
});

test('transformer throws retain identity before and after next', async () => {
  const beforeError = new Error('before');
  let beforeCalls = 0;
  const before = createClient('token', {
    fetch: async () => {
      beforeCalls += 1;
      return new Response('{}');
    },
  });
  before.use(() => {
    throw beforeError;
  });
  await assert.rejects(before.call({
    path: 'custom',
    options: { method: 'POST' },
  }), (error) => {
    return error === beforeError;
  });
  assert.equal(beforeCalls, 0);

  const afterError = new Error('after');
  let afterCalls = 0;
  const after = createClient('token', {
    fetch: async () => {
      afterCalls += 1;
      return new Response('{}');
    },
  });
  after.use(async (next) => {
    await next();
    throw afterError;
  });
  await assert.rejects(after.call({
    path: 'custom',
    options: { method: 'POST' },
  }), (error) => {
    return error === afterError;
  });
  assert.equal(afterCalls, 1);

  const detachedError = new Error('detached');
  let releaseFetch: (() => void) | undefined;
  const fetchReleased = new Promise<void>((resolve) => { releaseFetch = resolve; });
  let markFetchStarted: (() => void) | undefined;
  const fetchStarted = new Promise<void>((resolve) => { markFetchStarted = resolve; });
  let detachedCalls = 0;
  const detached = createClient('token', {
    fetch: async () => {
      detachedCalls += 1;
      markFetchStarted?.();
      await fetchReleased;
      return new Response('{}');
    },
  });
  detached.use((next) => {
    next();
    throw detachedError;
  });
  const detachedCall = detached.call({
    path: 'custom',
    options: { method: 'POST' },
  });
  await fetchStarted;
  let detachedSettled = false;
  detachedCall.catch(() => { detachedSettled = true; });
  await new Promise((resolve) => { setImmediate(resolve); });
  assert.equal(detachedSettled, false);
  releaseFetch?.();
  await assert.rejects(detachedCall, (error) => error === detachedError);
  assert.equal(detachedCalls, 1);

  const downstreamError = new Error('downstream');
  const primaryError = new Error('primary');
  const unhandled: unknown[] = [];
  function captureUnhandled(reason: unknown): void {
    unhandled.push(reason);
  }
  process.on('unhandledRejection', captureUnhandled);
  try {
    let releaseFailure: (() => void) | undefined;
    const failureReleased = new Promise<void>((resolve) => { releaseFailure = resolve; });
    let markFailureStarted: (() => void) | undefined;
    const failureStarted = new Promise<void>((resolve) => { markFailureStarted = resolve; });
    let failedCalls = 0;
    const failed = createClient('token', {
      fetch: async () => {
        failedCalls += 1;
        markFailureStarted?.();
        await failureReleased;
        throw downstreamError;
      },
    });
    failed.use((next) => {
      next();
      throw primaryError;
    });
    const failedCall = failed.call({
      path: 'custom',
      options: { method: 'POST' },
    });
    await failureStarted;
    let failedSettled = false;
    failedCall.catch(() => { failedSettled = true; });
    await new Promise((resolve) => { setImmediate(resolve); });
    assert.equal(failedSettled, false);
    releaseFailure?.();
    await assert.rejects(failedCall, (error) => error === primaryError);
    await waitForTimers();
    assert.equal(failedCalls, 1);
    assert.deepEqual(unhandled, []);
  } finally {
    process.removeListener('unhandledRejection', captureUnhandled);
  }
});

test('transformer snapshots are per-call and Api.use shares the configured client', async () => {
  const order: string[] = [];
  const client = createClient('token', {
    fetch: async () => new Response('{"user_id":1,"first_name":"Bot",'
      + '"username":"bot","is_bot":true,"name":"Bot"}'),
  });
  const late: ApiTransformer = async (next) => {
    order.push('late');
    await next();
  };
  let installed = false;
  client.use(async (next) => {
    order.push('base');
    if (!installed) {
      client.use(late);
      installed = true;
    }
    await next();
  });
  const api = new Api(client);
  assert.equal(api.use(async (next) => {
    order.push('api');
    await next();
  }), api);

  await api.getMyInfo();
  assert.deepEqual(order, ['base', 'api']);
  order.length = 0;
  await api.getMyInfo();
  assert.deepEqual(order, ['base', 'api', 'late']);
});

test('trusted validation remains terminal and raw upload requests bypass transformers', async () => {
  let transformerCalls = 0;
  let fetchCalls = 0;
  const unsafeInteger = Number.MAX_SAFE_INTEGER + 1;
  const client = createClient('token', {
    fetch: async () => {
      fetchCalls += 1;
      return new Response('{}');
    },
  });
  client.use(async (next, call) => {
    transformerCalls += 1;
    if (call.route === 'chats/{chat_id}') {
      await next({ path: { chat_id: unsafeInteger } });
    } else if (call.route === 'updates') {
      await next({ query: { marker: unsafeInteger } });
    } else {
      await next({ body: { admins: [{ user_id: unsafeInteger }] } });
    }
  });
  const raw = new RawApi(client);
  await assert.rejects(raw.chats.getById({ chat_id: '1' }), isProtocolError);
  await assert.rejects(raw.subscriptions.getUpdates({ marker: '1' }), isProtocolError);
  await assert.rejects(raw.chats.setChatAdmins({
    chat_id: '1',
    admins: [{ user_id: '2', permissions: [] }],
  }), isProtocolError);
  assert.equal(transformerCalls, 3);
  assert.equal(fetchCalls, 0);

  const upload = await client.request({
    url: 'https://upload.test/file',
    init: { method: 'POST', body: 'payload' },
  });
  assert.equal(upload.status, 200);
  assert.equal(transformerCalls, 3);
  assert.equal(fetchCalls, 1);
});

function isProtocolError(error: unknown): error is MaxError {
  return error instanceof MaxError && error.kind === MaxErrorKind.Protocol;
}

function protocolErrorWithAmbiguity(expected: boolean): (error: unknown) => boolean {
  return function matchesProtocolError(error: unknown): boolean {
    return isProtocolError(error) && error.ambiguousOutcome === expected;
  };
}

async function waitForTimers(): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 10);
  });
}
