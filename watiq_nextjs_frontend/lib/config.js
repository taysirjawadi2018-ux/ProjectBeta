import 'server-only';
import fs from 'node:fs';

/**
 * Port of frontend_flask/config.py:15-20.
 *
 * Prefer <NAME>_FILE over <NAME>. Secrets belong on disk, not in the
 * environment, where `docker inspect` on any container exposes them to anyone
 * who can reach the daemon (Security.md §12.4). Production mounts them under
 * /run/secrets and sets only the _FILE pointer.
 */
export function fromEnvOrFile(name, fallback = undefined) {
  const path = process.env[`${name}_FILE`];
  if (path) return fs.readFileSync(path, 'utf8').trim();
  return process.env[name] ?? fallback;
}

export const ENV = process.env.ENV || 'dev';
export const IS_DEV = ENV === 'dev';

export const REDIS_DSN = () => fromEnvOrFile('REDIS_DSN', 'redis://127.0.0.1:6379/1');

export const API_URL = () =>
  (process.env.WATIQ_API_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');

export const API_TIMEOUT_MS = () => Number(process.env.WATIQ_API_TIMEOUT || 10) * 1000;

/**
 * Mirrors the API's BodySizeMiddleware and nginx's client_max_body_size, so an
 * oversized upload is refused here instead of being streamed to the API only
 * to be rejected there.
 */
export const MAX_CONTENT_LENGTH = 12 * 1024 * 1024;
