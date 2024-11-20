export interface WindowEnv {
    apiUrl: string;
    publicUrl: string;
    connectUrl: string;
    publicSentryKey: string;
    publicPosthogKey: string;
    publicPosthogPost: string;
    publicLogoDevKey: string;
    isCloud: boolean;
    features: {
        logs: boolean;
        scripts: boolean;
        auth: boolean;
        managedAuth: boolean;
        gettingStarted: boolean;
    };
}
