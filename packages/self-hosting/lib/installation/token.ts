import { createPrivateKey, createPublicKey } from 'node:crypto';

import { calculateJwkThumbprint, exportJWK, SignJWT } from 'jose';

export const INSTALLATION_TOKEN_LIFETIME = '5m';
export const INSTALLATION_TOKEN_CLOCK_TOLERANCE = '15m';

export async function mintInstallationToken(privateKeyPem: string): Promise<string> {
    const key = createPrivateKey(privateKeyPem);
    const kid = await calculateJwkThumbprint(await exportJWK(createPublicKey(key)));
    return new SignJWT({}).setProtectedHeader({ alg: 'EdDSA', kid }).setIssuedAt().setExpirationTime(INSTALLATION_TOKEN_LIFETIME).sign(key);
}
