export interface WindowEnv {
    /** Public API host: OAuth callbacks, webhooks, and the `apiURL` handed to the SDK / Connect UI. */
    apiUrl: string;
    /** Where the dashboard sends its own API requests. Equals `apiUrl` unless NANGO_DASHBOARD_API_URL is set. */
    dashboardApiUrl: string;
    publicUrl: string;
    connectUrl: string;
    gitHash: string | undefined;
    publicSentryKey: string;
    publicPosthogKey: string;
    publicPosthogHost: string;
    publicLogoDevKey: string;
    publicStripeKey: string;
    publicPlainAppId: string;
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
