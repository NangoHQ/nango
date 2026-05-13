import jwt from 'jsonwebtoken';
import * as z from 'zod';

import { getLogger } from '@nangohq/utils';

import type { InternalNango as Nango } from '../../internal-nango.js';
import type { OAuth2ClientCredentials, OAuth2Credentials } from '@nangohq/types';

const logger = getLogger('post-connection:sellsy');

const SellsyJWTPayloadSchema = z.object({
    corpId: z.number()
});

export default async function execute(nango: Nango) {
    const connection = await nango.getConnection();
    const credentials: OAuth2Credentials | OAuth2ClientCredentials = connection.credentials as OAuth2Credentials | OAuth2ClientCredentials;

    const token = credentials.type === 'OAUTH2' ? credentials.access_token : credentials.token;

    const decoded = jwt.decode(token);
    const parsed = SellsyJWTPayloadSchema.safeParse(decoded);
    if (!parsed.success) {
        logger.info('Failed to parse decoded JWT payload. Skipping corpid update.');
        return;
    }

    const corpId = parsed.data.corpId;

    if (corpId) {
        await nango.updateConnectionConfig({ corpid: corpId });
    }
}
