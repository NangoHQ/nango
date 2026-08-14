// Runtime configuration snapshot. window._env is set by /env.js before the app bundle runs.
// See packages/webapp/src/utils/loadRuntimeEnv.ts and packages/server/lib/controllers/v1/getEnvJs.ts.

/** `/` means same-origin: use whichever host served the dashboard. */
function resolveDashboardApiUrl(value: string, origin: string): string {
    return value === '/' ? origin : value;
}

export const globalEnv = {
    ...window._env,
    dashboardApiUrl: resolveDashboardApiUrl(window._env.dashboardApiUrl, window.location.origin)
};
