export interface SyncResult {
    added: number;
    updated: number;
    deleted: number;
    unchanged: number;
}

export type SyncOperationType = 'INCREMENTAL' | 'FULL' | 'WEBHOOK';
