// Runtime configuration snapshot. window._env is set by /env.js before the app bundle runs.
// See packages/webapp/src/utils/loadRuntimeEnv.ts and packages/server/lib/controllers/v1/getEnvJs.ts.

import { resolveDashboardApiUrl } from './resolveDashboardApiUrl';

export const globalEnv = {
    ...window._env,
    dashboardApiUrl: resolveDashboardApiUrl(window._env.dashboardApiUrl, window.location.origin, window._env.apiUrl)
};
