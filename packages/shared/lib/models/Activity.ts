import type { HTTP_VERB } from './Generic.js';

export type LogLevel = 'info' | 'debug' | 'error' | 'warn' | 'http' | 'verbose' | 'silly';
export type LogAction =
    | 'database'
    | 'internal authorization'
    | 'file'
    | 'analytics'
    | 'auth'
    | 'proxy'
    | 'token'
    | 'sync'
    | 'sync client'
    | 'sync deploy'
    | 'pause sync'
    | 'restart sync'
    | 'trigger sync'
    | 'full sync';
export enum LogActionEnum {
    ANALYTICS = 'analytics',
    INTERNAL_AUTHORIZATION = 'internal authorization',
    FILE = 'file',
    DATABASE = 'database',
    AUTH = 'auth',
    PROXY = 'proxy',
    TOKEN = 'token',
    SYNC = 'sync',
    SYNC_CLIENT = 'sync client',
    SYNC_DEPLOY = 'sync deploy',
    PAUSE_SYNC = 'pause sync',
    RESTART_SYNC = 'restart sync',
    TRIGGER_SYNC = 'trigger sync',
    FULL_SYNC = 'full sync'
}
interface Message {
    [index: string]: unknown | undefined | string | number | boolean | Record<string, string | boolean | number | unknown>;
}

export interface ActivityLog {
    id?: number;
    environment_id: number;
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
