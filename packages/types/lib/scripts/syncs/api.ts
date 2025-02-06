export interface SyncResult {
    added: number;
    updated: number;
    deleted: number;
}

export type SyncOperationType = 'INCREMENTAL' | 'FULL' | 'WEBHOOK';
