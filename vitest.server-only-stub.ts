// Next.js/Turbopack resolves the "server-only" import specifier internally as
// a build-time poison pill; it isn't a real npm package the app depends on.
// Vitest has no equivalent, so this stub satisfies the import for tests.
export {};
