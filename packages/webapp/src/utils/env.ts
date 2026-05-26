// Snapshot of window._env, which is injected by the server via /env.js before the app boots.
// See packages/server/lib/controllers/v1/getEnvJs.ts for how it's constructed.
export const globalEnv = { ...window._env };
