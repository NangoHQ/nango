import type { Timestamps } from '../db.js';

export interface DBTeam extends Timestamps {
    id: number;
    name: string;
    uuid: string;
}
