export interface WindowEnv {
    apiUrl: string;
    publicUrl: string;
    publicSentryKey: string;
    publicPosthogKey: string;
    publicPosthogPost: string;
    features: {
        logs: boolean;
    };
}
