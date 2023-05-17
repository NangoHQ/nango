import type { HTTP_VERB } from './Generic.js';

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
