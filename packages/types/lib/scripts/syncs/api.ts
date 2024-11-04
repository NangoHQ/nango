export interface SyncResult {
    added: number;
    updated: number;
    deleted: number;
}

export type SyncType = 'INCREMENTAL' | 'FULL' | 'WEBHOOK';
