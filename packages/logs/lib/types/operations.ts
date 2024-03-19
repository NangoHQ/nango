import type { LogLevel } from './global';

export type OperationType = 'sync';
export type OperationCode = 'success';

export type OperationState = 'waiting' | 'running' | 'success' | 'failed' | 'timeout' | 'cancelled';

/**
 * Representation of the Operation table
 */
export type OperationTable = { id?: string | undefined } & Omit<OperationRow, 'id'>;

/**
 * Representation of an Operation row from the DB
 */
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
    title: string | null;
    level: LogLevel;
    state: OperationState;
    code: OperationCode | null;

    created_at: string;
    updated_at: string;
    started_at: string | null;
    ended_at: string | null;
}

type OperationRequiredField = 'account_id' | 'account_name' | 'environment_id' | 'environment_name' | 'type';

/**
 * Representation of what is required to insert an Operation
 */
export type OperationRequired = Pick<OperationRow, OperationRequiredField> & Partial<Exclude<OperationRow, OperationRequiredField>>;
