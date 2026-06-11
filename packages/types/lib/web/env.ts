export interface WindowEnv {
    apiUrl: string;
    /** In local dev, apiUrl gets rewritten to the Vite dev server origin so the
     * webapp's private API calls (/api/v1/...) stay same-origin; private routes
     * only allow baseUrl/basePublicUrl origins, not wildcard.
     *
     * ConnectUI must bypass the proxy and hit the backend directly: its routes
     * are on the public API (origin:'*'), and its OAuth WebSocket connects to
     * path '/' — which Vite also uses for HMR, making WS proxying impossible
     * without breaking hot-reload.
     *
     * In production, connectApiUrl equals apiUrl, so this is a no-op.
     * */
    connectApiUrl: string;
    publicUrl: string;
    connectUrl: string;
    gitHash: string | undefined;
    publicSentryKey: string;
    publicPosthogKey: string;
    publicPosthogHost: string;
    publicLogoDevKey: string;
    publicStripeKey: string;
    isCloud: boolean;
    isHosted: boolean;
    isEnterprise: boolean;
    features: {
        logs: boolean;
        scripts: boolean;
        auth: boolean;
        allowSignup: boolean;
        managedAuth: boolean;
        gettingStarted: boolean;
        slack: boolean;
        plan: boolean;
        authRoles: boolean;
    };
}
