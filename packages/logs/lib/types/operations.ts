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

    accountId: string;
    accountName: string;

    environmentId: string | null;
    environmentName: string | null;

    configId: string | null;
    configName: string | null;

    connectionId: string | null;
    connectionName: string | null;

    syncId: string | null;
    syncName: string | null;

    jobId: string | null;

    userId: string | null;

    type: OperationType;
    title: string | null;
    level: LogLevel;
    state: OperationState;
    code: OperationCode | null;

    createdAt: string;
    updatedAt: string;
    startedAt: string | null;
    endedAt: string | null;
}

type OperationRequiredField = 'accountId' | 'accountName' | 'environmentId' | 'environmentName' | 'type';

/**
 * Representation of what is required to insert an Operation
 */
export type OperationRequired = Pick<OperationRow, OperationRequiredField> & Partial<Exclude<OperationRow, OperationRequiredField>>;
