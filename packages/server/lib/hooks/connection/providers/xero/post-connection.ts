import type { InternalNango as Nango } from '../../post-connection.js';
import type { OAuth2Credentials } from '@nangohq/types';
import jwt from 'jsonwebtoken';
import { isAxiosError } from 'axios';
import { getLogger } from '@nangohq/utils';
import { z } from 'zod';

const logger = getLogger('post-connection:xero');

interface XeroConnection {
    id: string;
    authEventId: string;
    tenantType: string;
    tenantName: string;
    createdDateUtc: string;
    updatedDateUtc: string;
}

const XeroJWTPayloadSchema = z.object({
    payload: z.object({
        nbf: z.number().optional(),
        exp: z.number().optional(),
        iss: z.string().optional(),
        aud: z.string().optional(),
        client_id: z.string().optional(),
        sub: z.string().optional(),
        auth_time: z.number().optional(),
        xero_userid: z.string().optional(),
        global_session_id: z.string().optional(),
        sid: z.string().optional(),
        jti: z.string().optional(),
        authentication_event_id: z.string(),
        scope: z.array(z.string()).optional(),
        amr: z.array(z.string()).optional()
    })
});

export default async function execute(nango: Nango) {
    const connection = await nango.getConnection();

    const response = await nango.proxy({
        endpoint: 'connections',
        providerConfigKey: connection.provider_config_key
    });

    if (isAxiosError(response) || !response || !response.data || response.data.length === 0) {
        return;
    }

    let tenant_id = '';

    if (response.data.length === 1) {
        tenant_id = response.data[0]['tenantId'];
    } else {
        // decode the jwt to find the corresponding tenant if there are multiple
        const credentials = connection.credentials as OAuth2Credentials;
        const token = credentials.access_token;
        const decoded = jwt.decode(token, { complete: true });
        if (!decoded || typeof decoded.payload === 'string') {
            logger.info('Failed to decode JWT token or payload is a string. Skipping tenant_id update.');
            return;
        }
        const decodedToken = XeroJWTPayloadSchema.safeParse(decoded);
        if (decodedToken.success) {
            const authentication_event_id = decodedToken.data.payload.authentication_event_id;
            const foundConnection = response.data.find((connection: XeroConnection) => connection.authEventId === authentication_event_id);

            if (foundConnection) {
                tenant_id = foundConnection['tenantId'];
            }
        } else {
            logger.info('Failed to parse decoded JWT payload. Skipping tenant_id update.');
        }
    }

    if (tenant_id) {
        await nango.updateConnectionConfig({ tenant_id });
    } else {
        logger.info('No tenant_id found in response. Skipping tenant_id update.');
    }
}
