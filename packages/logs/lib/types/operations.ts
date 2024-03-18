import type { LogLevel } from './global';

export type OperationType = 'success';
export type OperationCode = 'success';

export type OperationState = 'waiting' | 'running' | 'success' | 'failed' | 'timeout' | 'cancelled';

export type OperationTable = { id?: string | undefined } & Omit<OperationRow, 'id'>;
export interface OperationRow {
    id: string;

    account_id: string;
    account_name: string;

    environment_id: string | null;
    environment_name: string | null;

    config_id: string | null;
    config_name: string | null;

    connection_id: string | null;
    connection_name: string | null;

    sync_id: string | null;
    sync_name: string | null;

    job_id: string | null;

    user_id: string | null;

    type: OperationType;
    title: string;
    level: LogLevel;
    state: OperationState;
    code: OperationCode;

    created_at: string;
    updated_at: string;
    started_at: string;
    ended_at: string;
}

export type OperationRequired = 'account_id' | 'account_name';
export type OperationCtx = Pick<OperationRow, OperationRequired> & Partial<Exclude<OperationRow, OperationRequired>>;
