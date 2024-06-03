import type { HTTP_VERB, Timestamps } from './Generic.js';

export const logLevelValues = ['info', 'debug', 'error', 'warn', 'http', 'verbose', 'silly'] as const;
export type LogLevel = (typeof logLevelValues)[number];
export type LogAction =
    | 'account'
    | 'action'
    | 'analytics'
    | 'auth'
    | 'database'
    | 'file'
    | 'full sync'
    | 'internal authorization'
    | 'infrastructure'
    | 'pause sync'
    | 'cancel sync'
    | 'proxy'
    | 'restart sync'
    | 'sync'
    | 'sync init'
    | 'sync client'
    | 'sync deploy'
    | 'post connection script'
    | 'token'
    | 'trigger sync'
    | 'trigger full sync'
    | 'webhook';

export enum LogActionEnum {
    ACCOUNT = 'account',
    ACTION = 'action',
    ANALYTICS = 'analytics',
    AUTH = 'auth',
    DATABASE = 'database',
    FILE = 'file',
    FULL_SYNC = 'full sync',
    INFRASTRUCTURE = 'infrastructure',
    INTERNAL_AUTHORIZATION = 'internal authorization',
    PAUSE_SYNC = 'pause sync',
    PROXY = 'proxy',
    RESTART_SYNC = 'restart sync',
    CANCEL_SYNC = 'cancel sync',
    SYNC = 'sync',
    SYNC_INIT = 'sync init',
    SYNC_CLIENT = 'sync client',
    SYNC_DEPLOY = 'sync deploy',
    POST_CONNECTION_SCRIPT = 'post connection script',
    TOKEN = 'token',
    TRIGGER_SYNC = 'trigger sync',
    TRIGGER_FULL_SYNC = 'trigger full sync',
    WEBHOOK = 'webhook'
}

type Message = Record<string, unknown>;

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
