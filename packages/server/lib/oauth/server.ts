import db from '@nangohq/database';
import { createOAuthProvider } from '@nangohq/oauth-server';

import { getOAuthServerConfig } from './config.js';

import type { OAuthProvider } from '@nangohq/oauth-server';

export const oauthServer = createNangoOAuthServer();

function createNangoOAuthServer(): OAuthProvider | null {
    const config = getOAuthServerConfig();
    if (!config) return null;

    return createOAuthProvider({ knex: db.knex, accountExists, ...config });
}

async function accountExists(accountId: string): Promise<boolean> {
    const id = Number(accountId);
    if (!Number.isSafeInteger(id) || id <= 0 || accountId !== String(id)) {
        return false;
    }
    const account = await db.knex<{ id: number }>('_nango_accounts').where({ id }).first('id');
    return account !== undefined;
}
