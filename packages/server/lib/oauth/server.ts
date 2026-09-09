import db from '@nangohq/database';
import { createOAuthProvider } from '@nangohq/oauth-server';

import { getOAuthServerConfig } from './config.js';

import type { OAuthProvider } from '@nangohq/oauth-server';

export const oauthServer = createNangoOAuthServer();

function createNangoOAuthServer(): OAuthProvider | null {
    const config = getOAuthServerConfig();
    if (!config) return null;

    return createOAuthProvider({ knex: db.knex, ...config });
}
