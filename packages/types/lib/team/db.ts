import type { Timestamps } from '../db';

export interface DBTeam extends Timestamps {
    id: number;
    name: string;
    uuid: string;
    is_capped: boolean;
}
