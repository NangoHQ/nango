export interface ActivityResponse {
    level: 'info' | 'debug' | 'error';
    action: 'oauth' | 'proxy' | 'token' | 'sync';
    success: boolean;
    timestamp: number;
    start: number;
    end: number;
    message: string;
    messages: {
        [index: string]: undefined | string | number;
    }[];
    connectionId: string;
    providerConfigKey: string;
    provider: string;
    method: string;
    endpoint?: string;
}
