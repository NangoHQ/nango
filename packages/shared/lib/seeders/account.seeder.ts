import { v4 as uuid } from 'uuid';

import accountService from '../services/account.service.js';

import type { DBTeam } from '@nangohq/types';

export async function createAccount(): Promise<DBTeam> {
    const acc = await accountService.createAccountWithoutEnvironments(uuid());
    if (!acc) {
        throw new Error('failed_to_create_account');
    }
    return acc;
}

export function getTestTeam(override?: Partial<DBTeam>): DBTeam {
    return {
        id: 1,
        name: 'test',
        uuid: '8d49e079-aa61-44ae-b0cf-823662523527',
        found_us: '',
        created_at: new Date(),
        updated_at: new Date(),
        ...override
    };
}
