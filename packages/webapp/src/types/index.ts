export type SyncResult = Record<string, Result>;

export interface Result {
    added: number;
    updated: number;
    deleted: number;
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
