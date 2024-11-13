import type { SyncTypeLiteral, ActiveLog } from '@nangohq/types';

export type SyncResult = Record<string, Result>;

export interface Result {
    added: number;
    updated: number;
    deleted: number;
}

export interface SyncResponse {
    id: string;
    created_at: string;
    nango_connection_id: number;
    name: string;
    frequency: string;
    frequency_override: string | null;
    futureActionTimes: number[];
    offset: number;
    schedule_status: 'STARTED' | 'PAUSED' | 'DELETED';
    models: string | string[];
    schedule_id: string;
    status: 'SUCCESS' | 'RUNNING' | 'STOPPED' | 'PAUSED' | 'ERROR';
    sync_type: SyncTypeLiteral;
    latest_sync?: {
        created_at: string;
        updated_at: string;
        type: 'INITIAL' | 'INCREMENTAL';
        status: 'SUCCESS' | 'STOPPED' | 'RUNNING' | 'PAUSED';
        result: SyncResult;
        job_id: string;
        sync_config_id: number;
        version: string;
        models: string[];
    };
    active_logs: Pick<ActiveLog, 'log_id'> | null;
    record_count: Record<string, number>;
}

export type RunSyncCommand = 'PAUSE' | 'UNPAUSE' | 'RUN' | 'RUN_FULL' | 'CANCEL';

export const UserFacingSyncCommand = {
    PAUSE: 'paused',
    UNPAUSE: 'resumed',
    RUN: 'triggered',
    RUN_FULL: 'run full',
    CANCEL: 'cancelled'
};

interface NangoSyncModelField {
    name: string;
    type: string;
    description?: string;
}

export interface NangoSyncModel {
    name: string;
    description?: string;
    fields: NangoSyncModelField[];
}
