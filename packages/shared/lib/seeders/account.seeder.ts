import { v4 as uuid } from 'uuid';
import accountService from '../services/account.service.js';
import type { DBTeam } from '@nangohq/types';

export async function createAccount(): Promise<DBTeam> {
    const acc = await accountService.getOrCreateAccount(uuid());
    if (!acc) {
        throw new Error('failed_to_create_account');
    }
    return acc;
}
