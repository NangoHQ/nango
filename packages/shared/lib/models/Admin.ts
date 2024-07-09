import type { Timestamps } from './Generic.js';

export interface User extends Timestamps {
    id: number;
    email: string;
    name: string;
    hashed_password: string;
    salt: string;
    account_id: number;
    reset_password_token: string | undefined;
    suspended: boolean;
    suspended_at: Date;
    currentUser?: boolean;
    email_verified: boolean;
    email_verification_token: string | null;
    email_verification_token_expires_at: Date | null;
    uuid: string;
}
