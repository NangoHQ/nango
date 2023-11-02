import type { Timestamps } from './Generic';

export interface Onboarding extends Timestamps {
    id?: number;
    user_id: number;
    progress: number;
    sync_data_ready: boolean;
    complete: boolean;
}
