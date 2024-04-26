import type { Timestamps } from '../db';

export interface DBOnboarding extends Timestamps {
    id: number;
    user_id: number;
    progress: number;
    complete: boolean;
}
