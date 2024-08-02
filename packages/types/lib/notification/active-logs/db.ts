import type { Timestamps } from '../../db.js';

export interface ActiveLog extends Timestamps {
    id: number;
    type: string;
    action: string;
    connection_id: number;
    log_id: string;
    active: boolean;
    sync_id: string | null;
}

export type ActiveLogIds = Pick<ActiveLog, 'log_id'>;
