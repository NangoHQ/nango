import jwt from 'jsonwebtoken';

import type { SellsyDecodedToken } from './types.js';
import type { InternalNango as Nango } from '../../internal-nango.js';
import type { OAuth2ClientCredentials, OAuth2Credentials } from '@nangohq/types';

export default async function execute(nango: Nango) {
    const connection = await nango.getConnection();
    const credentials: OAuth2Credentials | OAuth2ClientCredentials = connection.credentials as OAuth2Credentials | OAuth2ClientCredentials;

    const token = credentials.type === 'OAUTH2' ? credentials.access_token : credentials.token;

    const decoded = jwt.decode(token) as SellsyDecodedToken;

    if (!decoded || typeof decoded !== 'object') {
        return;
    }

    const corpId = decoded.corpId;

    if (corpId) {
        await nango.updateConnectionConfig({ corpid: corpId });
    }
}
