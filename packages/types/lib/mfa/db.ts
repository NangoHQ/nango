import type { Timestamps } from '../db.js';

export type MFAFactorType = 'totp';

export interface DBMFAFactor extends Timestamps {
    id: number;
    user_id: number;
    type: MFAFactorType;
    encrypted_secret: string;
    iv: string;
    auth_tag: string;
    enabled_at: Date | null;
    last_used_counter: number | null;
}

export interface DBMFARecoveryCode {
    id: number;
    user_id: number;
    code_hash: string;
    created_at: Date;
    used_at: Date | null;
}
