import type { Timestamps } from '../db.js';

export interface DBGettingStartedProgress extends Timestamps {
    id: number;
    user_id: number;
    integration_id: number;
    demo_connection_id: number | null;
    step: number;
    complete: boolean;
}
