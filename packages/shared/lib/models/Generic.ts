import type { NangoError } from '../utils/error.js';

export type HTTP_VERB = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface DBConfig {
    encryption_key_hash?: string | null;
    encryption_complete: boolean;
}

export interface Timestamps {
    created_at?: Date;
    updated_at?: Date;
}

export interface Deleted {
    deleted_at?: Date | null;
    deleted?: boolean;
}

export interface TimestampsAndDeleted extends Timestamps, Deleted {}

export interface ServiceResponse<T = any> {
    success: boolean;
    error: NangoError | null;
    response: T | null;
}
