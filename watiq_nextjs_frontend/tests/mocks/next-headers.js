/**
 * A stand-in for the per-request scope Next.js provides through `next/headers`.
 *
 * The real `cookies()` and `headers()` read from async local storage populated
 * by the server on each request, and throw outside one. Tests need the same
 * shape without a server, so this module holds one request scope at a time and
 * `resetRequestScope()` starts a new one.
 *
 * Cookie attributes are recorded rather than dropped, because several of them
 * (httpOnly, sameSite, secure) are the actual subject of the session tests.
 */

let jar = new Map();
let requestHeaders = new Headers();

/** Start a fresh request scope. Called from tests/setup.js before each test. */
export function resetRequestScope({ headers: h = {}, cookies: c = {} } = {}) {
  jar = new Map();
  for (const [name, value] of Object.entries(c)) {
    jar.set(name, { name, value, httpOnly: true, sameSite: 'lax', path: '/' });
  }
  requestHeaders = new Headers(h);
}

/** Everything set on the jar, attributes included, for assertions. */
export function cookieJar() {
  return jar;
}

const cookieStore = {
  get: (name) => jar.get(name),
  getAll: () => [...jar.values()],
  has: (name) => jar.has(name),
  set: (...args) => {
    // Next accepts both set(name, value, opts) and set({name, value, ...opts}).
    const entry =
      typeof args[0] === 'object'
        ? { ...args[0] }
        : { name: args[0], value: args[1], ...(args[2] || {}) };
    jar.set(entry.name, entry);
  },
  delete: (name) => {
    jar.delete(typeof name === 'object' ? name.name : name);
  },
};

// Async in Next 15, and awaited at every call site, so these match.
export async function cookies() {
  return cookieStore;
}

export async function headers() {
  return requestHeaders;
}
