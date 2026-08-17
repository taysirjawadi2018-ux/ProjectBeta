/**
 * An in-memory stand-in for ioredis, covering only what lib/session.js uses.
 *
 * Flask's tests never reached Redis at all: with ENV=dev and no server running,
 * app.py fell back to signed-cookie sessions, so the suite exercised the
 * fallback rather than the store. Mocking at this level means the real session
 * code path — key prefix, TTL, serialisation — is the one under test, while
 * `npm test` still needs nothing running.
 *
 * TTLs are recorded, not enforced on a timer; a test that cares asserts on
 * `ttlOf(key)`.
 */

const store = new Map(); // key -> { value, ttl }

export function resetRedis() {
  store.clear();
}

export function redisStore() {
  return store;
}

export function ttlOf(key) {
  return store.get(key)?.ttl ?? null;
}

/** Make the next command of every kind reject, to test failure handling. */
let failNext = null;
export function failNextCommand(err = new Error('ECONNREFUSED')) {
  failNext = err;
}

function maybeFail() {
  if (failNext) {
    const err = failNext;
    failNext = null;
    throw err;
  }
}

export default class Redis {
  constructor(dsn, options = {}) {
    this.dsn = dsn;
    this.options = options;
  }

  async ping() {
    maybeFail();
    return 'PONG';
  }

  async get(key) {
    maybeFail();
    return store.has(key) ? store.get(key).value : null;
  }

  async set(key, value, ...rest) {
    maybeFail();
    // set(key, value, 'EX', seconds)
    const exIndex = rest.findIndex((a) => String(a).toUpperCase() === 'EX');
    const ttl = exIndex >= 0 ? Number(rest[exIndex + 1]) : null;
    store.set(key, { value, ttl });
    return 'OK';
  }

  async del(key) {
    maybeFail();
    return store.delete(key) ? 1 : 0;
  }

  async quit() {
    return 'OK';
  }
}
