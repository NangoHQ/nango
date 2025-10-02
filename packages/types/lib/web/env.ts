export interface WindowEnv {
    apiUrl: string;
    apiDownWatchPublicKey: string;
    publicUrl: string;
    connectUrl: string;
    gitHash: string | undefined;
    publicSentryKey: string;
    publicPosthogKey: string;
    publicPosthogHost: string;
    publicLogoDevKey: string;
    publicStripeKey: string;
    isCloud: boolean;
    features: {
        logs: boolean;
        scripts: boolean;
        auth: boolean;
        managedAuth: boolean;
        gettingStarted: boolean;
        slack: boolean;
        plan: boolean;
    };
}
