import { createPrivateKey, createPublicKey } from 'node:crypto';

import { calculateJwkThumbprint, exportJWK, SignJWT } from 'jose';

export const INSTALLATION_TOKEN_TTL_SECONDS = 60;

export async function mintInstallationToken(
    privateKeyPem: string,
    { ttlSeconds = INSTALLATION_TOKEN_TTL_SECONDS }: { ttlSeconds?: number } = {}
): Promise<string> {
    const key = createPrivateKey(privateKeyPem);
    const kid = await calculateJwkThumbprint(await exportJWK(createPublicKey(key)));
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({})
        .setProtectedHeader({ alg: 'EdDSA', kid })
        .setIssuedAt(now)
        .setExpirationTime(now + ttlSeconds)
        .sign(key);
}
