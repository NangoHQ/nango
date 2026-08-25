import jwt from 'jsonwebtoken';
import * as z from 'zod';

import { getLogger } from '@nangohq/utils';

import type { InternalNango as Nango } from '../../internal-nango.js';
import type { OAuth2Credentials } from '@nangohq/types';

const logger = getLogger('post-connection:microsoft-teams');

const MicrosoftTeamsJWTPayloadSchema = z.object({
    tid: z.string()
});

export default async function execute(nango: Nango) {
    const connection = await nango.getConnection();
    const accessToken = (connection.credentials as OAuth2Credentials).access_token;
    const decoded = jwt.decode(accessToken);

    const parsed = MicrosoftTeamsJWTPayloadSchema.safeParse(decoded);
    if (!parsed.success) {
        logger.info('Failed to parse decoded JWT payload. Skipping tenant_id update.');
        return;
    }

    await nango.updateConnectionConfig({ tenantId: parsed.data.tid });
}
