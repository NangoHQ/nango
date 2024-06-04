const env = { ...(window._env || {}), ...process.env };

export const PUBLIC_POSTHOG_KEY = env['PUBLIC_POSTHOG_KEY'];
export const PUBLIC_POSTHOG_HOST = env['PUBLIC_POSTHOG_HOST'];
export const PUBLIC_SENTRY_KEY = env['PUBLIC_SENTRY_KEY'];
export const API_URL = env['API_URL'];
export const WEB_BASE_URL = env['WEB_BASE_URL'];
export const WEB_BASE_PATH = env['WEB_BASE_PATH'];

export const REACT_APP_ENV = process.env['REACT_APP_ENV'];
