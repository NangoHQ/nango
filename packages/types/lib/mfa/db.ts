import type { Timestamps } from '../db.js';

export type MFAFactorType = 'totp';

export interface DBMFAFactor extends Timestamps {
    id: string;
    user_id: number;
    type: MFAFactorType;
    encrypted_secret: string;
    iv: string;
    auth_tag: string;
    enabled_at: Date | null;
    last_accepted_counter: string | null;
    clock_offset_steps: number;
}

export interface DBMFARecoveryCode {
    id: string;
    user_id: number;
    code_hash: string;
    created_at: Date;
    consumed_at: Date | null;
}
