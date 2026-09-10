/** Never use a full authorization URL or an interaction identifier as a telemetry label. */
export function oauthTelemetryPath(url: string): string | undefined {
    const path = url.split('?')[0]!;
    if (!/^\/oauth\/(?:authorize|interaction|continue|token|revoke|jwks)(?:\/|$)/.test(path)) return undefined;
    return path.replace(/^(\/oauth\/(?:authorize|interaction|continue))\/[^/]+/, '$1/:uid');
}
