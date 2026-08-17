// `server-only` throws by design when a module graph reaches it from the
// client. Vitest is neither, so it is aliased to this no-op. The guard still
// does its job in the real build, which is where it matters.
export {};
