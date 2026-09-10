/** Never use a full authorization URL or an interaction identifier as a telemetry label. */
export function oauthTelemetryPath(url: string): string | undefined {
    const path = url.split('?')[0]!;
    if (!/^\/(?:oauth\/(?:authorize|interaction|handoff|token|revoke|jwks)(?:\/|$)|api\/v1\/oauth\/handoff$)/.test(path)) return undefined;
    return path.replace(/^(\/oauth\/(?:authorize|interaction))\/[^/]+/, '$1/:uid');
}
