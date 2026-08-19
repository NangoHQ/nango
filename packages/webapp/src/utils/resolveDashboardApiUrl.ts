/**
 * `/` means same-origin: use whichever host served the dashboard.
 * Stale cached /env.js from before this field existed has no dashboardApiUrl.
 */
export function resolveDashboardApiUrl(value: string | undefined, origin: string, apiUrl: string): string {
    if (value === '/') {
        return origin;
    }
    return value || apiUrl;
}
