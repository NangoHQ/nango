import type { HTTP_VERB, Timestamps } from './Generic.js';

export type LogLevel = 'info' | 'debug' | 'error' | 'warn' | 'http' | 'verbose' | 'silly';
export type LogAction =
    | 'account'
    | 'action'
    | 'analytics'
    | 'auth'
    | 'database'
    | 'file'
    | 'full sync'
    | 'internal authorization'
    | 'pause sync'
    | 'proxy'
    | 'restart sync'
    | 'sync'
    | 'sync client'
    | 'sync deploy'
    | 'token'
    | 'trigger sync'
    | 'webhook';

export enum LogActionEnum {
    ACCOUNT = 'account',
    ACTION = 'action',
    ANALYTICS = 'analytics',
    AUTH = 'auth',
    DATABASE = 'database',
    FILE = 'file',
    FULL_SYNC = 'full sync',
    INTERNAL_AUTHORIZATION = 'internal authorization',
    PAUSE_SYNC = 'pause sync',
    PROXY = 'proxy',
    RESTART_SYNC = 'restart sync',
    SYNC = 'sync',
    SYNC_CLIENT = 'sync client',
    SYNC_DEPLOY = 'sync deploy',
    TOKEN = 'token',
    TRIGGER_SYNC = 'trigger sync',
    WEBHOOK = 'webhook'
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

export interface ActivityLogMessage extends Timestamps {
    id?: number;
    environment_id: number;
    level: LogLevel;
    activity_log_id?: number;
    content: string;
    timestamp: number;
    auth_mode?: string;
    url?: string;
    state?: string;
    params?: Message;
}
