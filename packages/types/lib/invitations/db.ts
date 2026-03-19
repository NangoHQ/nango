import type { Timestamps } from '../db.js';
import type { Role } from '../user/db.js';

export interface DBInvitation extends Timestamps {
    id: number;
    name: string;
    email: string;
    account_id: number;
    invited_by: number;
    token: string;
    expires_at: Date;
    accepted: boolean;
    role: Role;
}
