import db from '@nangohq/database';
import { createOAuthProvider } from '@nangohq/oauth-server';

import { getOAuthServerConfig } from './config.js';
import { revokeProductBinding } from './grants.js';
import { OAuthConsentService } from './service.js';

import type { OAuthProvider } from '@nangohq/oauth-server';

const config = getOAuthServerConfig();
export const oauthServer = createNangoOAuthServer();
export const oauthConsent = oauthServer && config ? new OAuthConsentService(oauthServer, config) : null;

function createNangoOAuthServer(): OAuthProvider | null {
    if (!config) return null;

    return createOAuthProvider({ knex: db.knex, ...config, beforeGrantRevoked: revokeProductBinding });
}
