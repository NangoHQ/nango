import type { Timestamps } from '../../db.js';

export interface PostConnectionScript extends Timestamps {
    id: number;
    config_id: number;
    name: string;
    file_location: string;
    version: string;
    active: boolean;
}
