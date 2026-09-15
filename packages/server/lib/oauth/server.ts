import db from '@nangohq/database';
import { createOAuthProvider } from '@nangohq/oauth-server';
import { basePublicUrl } from '@nangohq/utils';

import { getOAuthServerConfig } from './config.js';

import type { OAuthProvider } from '@nangohq/oauth-server';

export const oauthServerConfig = getOAuthServerConfig();
export const oauthServer = createNangoOAuthServer();

function createNangoOAuthServer(): OAuthProvider | null {
    if (!oauthServerConfig) return null;

    return createOAuthProvider({
        knex: db.knex,
        ...oauthServerConfig,
        userExists,
        interactionUrl: (uid) => new URL(`/oauth/consent/${encodeURIComponent(uid)}`, basePublicUrl).href
    });
}

async function userExists(userId: string): Promise<boolean> {
    const id = Number(userId);
    if (!Number.isSafeInteger(id) || id <= 0 || userId !== String(id)) return false;
    const user = await db
        .knex('_nango_users as users')
        .innerJoin('_nango_accounts as accounts', 'accounts.id', 'users.account_id')
        .where({ 'users.id': id, 'users.suspended': false })
        .first('users.id');
    return user !== undefined;
}
