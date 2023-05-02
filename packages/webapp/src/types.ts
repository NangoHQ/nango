export interface ActivityResponse {
    level: 'info' | 'debug' | 'error';
    action: 'oauth' | 'proxy';
    success: boolean;
    timestamp: Date;
    message: string;
    connectionId: string;
    providerConfigKey: string;
    provider: string;
    method: string;
}
