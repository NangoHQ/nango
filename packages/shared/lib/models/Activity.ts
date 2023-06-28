import type { HTTP_VERB } from './Generic.js';

export type LogLevel = 'info' | 'debug' | 'error' | 'warn' | 'http' | 'verbose' | 'silly';
export type LogAction = 'oauth' | 'proxy' | 'token' | 'sync';
interface Message {
    [index: string]: unknown | undefined | string | number | boolean | Record<string, string | boolean | number | unknown>;
}

export interface ActivityLog {
    id?: number;
    account_id: number;
    level: LogLevel;
    action: LogAction;
    success: boolean | null;
    timestamp: number;
    start: number;
    end?: number;
    connection_id: string | null;
    provider_config_key: string | null;
    provider?: string | null;
    method?: HTTP_VERB;
    endpoint?: string;
    session_id?: string;
    messages?: ActivityLogMessage[];
    operation_name?: string;
}

export interface ActivityLogMessage {
    id?: number;
    level: LogLevel;
    activity_log_id?: number;
    content: string;
    timestamp: number;
    auth_mode?: string;
    url?: string;
    state?: string;
    params?: Message;
}
