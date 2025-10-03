import type { ScriptTypeLiteral, SyncResultByModel, Timestamps, TimestampsAndDeleted } from '@nangohq/types';

export enum SyncStatus {
    RUNNING = 'RUNNING',
    PAUSED = 'PAUSED',
    STOPPED = 'STOPPED',
    SUCCESS = 'SUCCESS',
    ERROR = 'ERROR'
}

export enum SyncJobsType {
    INCREMENTAL = 'INCREMENTAL',
    FULL = 'FULL',
    WEBHOOK = 'WEBHOOK',
    ON_EVENT_SCRIPT = 'ON_EVENT_SCRIPT',
    ACTION = 'ACTION'
}

export type SyncWithConnectionId = Sync & { connection_id: string };

export interface Sync extends TimestampsAndDeleted {
    id: string;
    nango_connection_id: number;
    name: string;
    variant: string;
    last_sync_date: Date | null;
    futureActionTimes?: {
        seconds?: number;
        nanos?: number;
    };
    frequency: string | null;
    last_fetched_at: Date | null;
    sync_config_id: number;
}

export interface Action extends TimestampsAndDeleted {
    name: string;
}

export interface Job extends Timestamps {
    id: number;
    status: SyncStatus;
    type: SyncJobsType;
    sync_id: string;
    job_id: string;
    run_id?: string | null;
    log_id?: string | null;
    result?: SyncResultByModel;
    sync_config_id?: number;
}

export enum SyncCommand {
    PAUSE = 'PAUSE',
    UNPAUSE = 'UNPAUSE',
    RUN = 'RUN',
    RUN_FULL = 'RUN_FULL',
    CANCEL = 'CANCEL'
}

export interface SyncConfigWithProvider {
    id: number;
    sync_name: string;
    runs: string;
    models: string[];
    updated_at: string;
    provider_config_key: string;
    unique_key: string;
    type: ScriptTypeLiteral;
}
