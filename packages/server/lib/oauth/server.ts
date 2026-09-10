import db from '@nangohq/database';
import { createOAuthProvider } from '@nangohq/oauth-server';
import { basePublicUrl } from '@nangohq/utils';

import { recordOAuthGrantRevocation } from '../middleware/audit/oauthGrant.middleware.js';
import { getOAuthServerConfig } from './config.js';
import { revokeProductGrantByProviderId } from './product-grant.service.js';

import type { OAuthProvider } from '@nangohq/oauth-server';

export const oauthServerConfig = getOAuthServerConfig();
export const oauthServer = createNangoOAuthServer();

function createNangoOAuthServer(): OAuthProvider | null {
    if (!oauthServerConfig) return null;

    return createOAuthProvider({
        knex: db.knex,
        ...oauthServerConfig,
        interactionUrl: (uid) => new URL(`/oauth/consent/${encodeURIComponent(uid)}`, basePublicUrl).href,
        beforeGrantRevocation: async (grantId, request) => {
            const revoked = await revokeProductGrantByProviderId(grantId, oauthServerConfig.config.encryptionKey, 'token_revocation');
            if (revoked) await recordOAuthGrantRevocation(revoked, request);
        }
    });
}
