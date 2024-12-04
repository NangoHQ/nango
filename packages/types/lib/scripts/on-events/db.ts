import type { Timestamps } from '../../db.js';

export interface DBOnEventScript extends Timestamps {
    id: number;
    config_id: number;
    name: string;
    file_location: string;
    version: string;
    active: boolean;
    event: 'POST_CONNECTION_CREATION' | 'PRE_CONNECTION_DELETION';
}
