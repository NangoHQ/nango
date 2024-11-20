import type { Timestamps } from '../db';

export interface DBUser extends Timestamps {
    id: number;
    email: string;
    name: string;
    hashed_password: string;
    salt: string;
    account_id: number;
    reset_password_token: string | null;
    suspended: boolean;
    suspended_at: Date;
    email_verified: boolean;
    email_verification_token: string | null;
    email_verification_token_expires_at: Date | null;
    uuid: string;
}
