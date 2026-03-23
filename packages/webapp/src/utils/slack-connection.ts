import Nango from '@nangohq/frontend';

import { APIError, apiFetch } from './api.js';

export const connectSlack = async ({
    accountUUID,
    envId,
    env,
    hostUrl,
    onFinish,
    onFailure
}: {
    accountUUID: string;
    envId: number;
    env: string;
    hostUrl: string;
    onFinish: () => void;
    onFailure: () => void;
}) => {
    const connectionId = `account-${accountUUID}-${envId}`;

    const res = await apiFetch(`/api/v1/environment/admin-auth?connection_id=${connectionId}&env=${env}`, {
        method: 'GET'
    });

    if (res.status !== 200) {
        onFailure();
        return;
    }

    const authResponse = await res.json();
    const { hmac_digest: hmacDigest, public_key: publicKey, integration_key: integrationKey } = authResponse;

    const nango = new Nango({ host: hostUrl, publicKey });
    nango
        .auth(integrationKey, connectionId, {
            user_scope: [],
            params: {},
            hmac: hmacDigest,
            detectClosedAuthWindow: true
        })
        .then(async () => {
            const res = await apiFetch(`/api/v1/environments?env=${env}`, { method: 'PATCH', body: JSON.stringify({ slack_notifications: true }) });
            if (!res.ok) {
                throw new APIError({ res, json: res.json() });
            }
            onFinish();
        })
        .catch((err: unknown) => {
            console.error(err);
            onFailure();
        });
};
