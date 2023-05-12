import type { Template as ProviderTemplate, HTTP_VERB } from '@nangohq/shared';

export interface User {
    id: number;
    email: string;
    name: string;
    hashed_password: string;
    salt: string;
    account_id: number;
    reset_password_token: string | undefined;
}

export interface DBConfig {
    encryption_key_hash?: string | null;
    encryption_complete: boolean;
}

export interface ProxyBodyConfiguration {
    endpoint: string;
    provider: string;
    providerConfigKey: string;
    connectionId: string;
    token: string;
    method: HTTP_VERB;
    template: ProviderTemplate;

    retries?: number;
    data?: unknown;
    headers?: Record<string, string>;
    params?: string | Record<string, string>;
    paramsSerializer?: {
        encode?: (param: string) => string;
        serialize?: (params: Record<string, any>, options?: ParamsSerializerOptions) => void;
        indexes?: boolean;
    };
}

interface ParamsSerializerOptions {
    encode?: ParamEncoder;
    serialize?: CustomParamsSerializer;
}

interface ParamEncoder {
    (value: any, defaultEncoder: (value: any) => any): any;
}

interface CustomParamsSerializer {
    (params: Record<string, any>, options?: ParamsSerializerOptions): string;
}

export type LogLevel = 'info' | 'debug' | 'error';
export type LogAction = 'oauth' | 'proxy' | 'token' | 'sync';
interface Message {
    [index: string]: unknown | undefined | string | number | boolean | Record<string, string | boolean | number | unknown>;
}

export interface ActivityLog {
    id?: number;
    account_id: number;
    level: LogLevel;
    action: LogAction;
    success: boolean;
    timestamp: number;
    start: number;
    end?: number;
    connection_id: string;
    provider_config_key: string;
    provider?: string;
    method?: HTTP_VERB;
    endpoint?: string;
    session_id?: string;
    messages?: ActivityLogMessage[];
}

export interface ActivityLogMessage {
    id?: number;
    level: LogLevel;
    activity_log_id: number;
    content: string;
    timestamp: number;
    auth_mode?: string;
    url?: string;
    state?: string;
    params?: Message;
}
