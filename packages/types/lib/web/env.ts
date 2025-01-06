export interface WindowEnv {
    apiUrl: string;
    publicUrl: string;
    connectUrl: string;
    publicSentryKey: string;
    publicPosthogKey: string;
    publicPosthogHost: string;
    publicLogoDevKey: string;
    publicKoalaKey: string;
    publicKoalaApiUrl: string;
    publicKoalaCdnUrl: string;
    isCloud: boolean;
    features: {
        logs: boolean;
        scripts: boolean;
        auth: boolean;
        managedAuth: boolean;
        gettingStarted: boolean;
    };
}
