import type { Timestamps } from '../db.js';

/**
 * Onboarding row in database
 */
export interface DBOnboarding extends Timestamps {
    id: number;
    user_id: number;
    progress: number;
    complete: boolean;
}
