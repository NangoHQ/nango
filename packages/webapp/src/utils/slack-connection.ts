import Nango from '@nangohq/frontend';

export interface SlackAdminAuth {
    hmac_digest: string;
    public_key: string;
    integration_key: string;
}

export const connectSlack = async ({
    accountUUID,
    envId,
    hostUrl,
    getAdminAuth,
    enableNotifications,
    onFinish,
    onFailure
}: {
    accountUUID: string;
    envId: number;
    hostUrl: string;
    getAdminAuth: (connectionId: string) => Promise<SlackAdminAuth>;
    enableNotifications: () => Promise<unknown>;
    onFinish: () => void;
    onFailure: () => void;
}) => {
    const connectionId = `account-${accountUUID}-${envId}`;

    let adminAuth: SlackAdminAuth;
    try {
        adminAuth = await getAdminAuth(connectionId);
    } catch {
        onFailure();
        return;
    }
    const { hmac_digest: hmacDigest, public_key: publicKey, integration_key: integrationKey } = adminAuth;

    const nango = new Nango({
        host: hostUrl,
        publicKey,
        // `Nango` resolves `websocketsPath` as an absolute path from the origin, which would
        // silently drop any base path configured in `hostUrl` (e.g. a self-hosted reverse-proxy
        // prefix). Deriving it from hostUrl's own path here keeps that prefix intact.
        websocketsPath: `${new URL(hostUrl).pathname.replace(/\/+$/, '')}/`
    });
    nango
        .auth(integrationKey, connectionId, {
            user_scope: [],
            params: {},
            hmac: hmacDigest,
            detectClosedAuthWindow: true
        })
        .then(async () => {
            await enableNotifications();
            onFinish();
        })
        .catch((err: unknown) => {
            console.error(err);
            onFailure();
        });
};
