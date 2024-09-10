import type { InternalNango as Nango } from './post-connection.js';
import type { OAuth2Credentials } from '@nangohq/types';
import jwt from 'jsonwebtoken';
import { isAxiosError } from 'axios';

interface XeroConnection {
    id: string;
    authEventId: string;
    tenantType: string;
    tenantName: string;
    createdDateUtc: string;
    updatedDateUtc: string;
}

interface XeroJWTPayload {
    nbf: number;
    exp: number;
    iss: string;
    aud: string;
    client_id: string;
    sub: string;
    auth_time: number;
    xero_userid: string;
    global_session_id: string;
    sid: string;
    jti: string;
    authentication_event_id: string;
    scope: string[];
    amr: string[];
}

export default async function execute(nango: Nango) {
    const connection = await nango.getConnection();

    const response = await nango.proxy({
        endpoint: 'connections',
        connectionId: connection.connection_id,
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
        if (!decoded) {
            return;
        }
        const payload = decoded.payload as XeroJWTPayload;
        const authentication_event_id = payload.authentication_event_id;
        const foundConnection = response.data.find((connection: XeroConnection) => connection.authEventId === authentication_event_id);

        if (foundConnection) {
            await nango.updateConnectionConfig({ tenant_id: foundConnection['tenantId'] });
        }
    }

    if (tenant_id) {
        await nango.updateConnectionConfig({ tenant_id });
    }
}
