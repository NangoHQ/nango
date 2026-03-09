import Nango from '@nangohq/frontend';

import { apiFetch } from './api';
import { apiPatchEnvironment } from '../hooks/useEnvironment';

export const connectSlack = async ({
    accountUUID,
    env,
    hostUrl,
    onFinish,
    onFailure
}: {
    accountUUID: string;
    env: string;
    hostUrl: string;
    onFinish: () => void;
    onFailure: () => void;
}) => {
    const connectionId = `account-${accountUUID}-${env}`;

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
            await apiPatchEnvironment(env, { slack_notifications: true });
            onFinish();
        })
        .catch((err: unknown) => {
            console.error(err);
            onFailure();
        });
};
