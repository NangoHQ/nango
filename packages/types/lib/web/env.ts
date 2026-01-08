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
    };
}
