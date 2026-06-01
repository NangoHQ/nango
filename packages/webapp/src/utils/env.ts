// Runtime configuration snapshot. window._env is set by /env.js, loaded as a blocking <script>
// in index.html before the React bundle runs. It carries API URLs, feature flags, and third-party
// keys (PostHog, Sentry, Stripe, etc.) that vary per deployment.
// See packages/server/lib/controllers/v1/getEnvJs.ts for how it's constructed.
export const globalEnv = { ...window._env };
