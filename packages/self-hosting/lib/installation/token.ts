import { createPrivateKey, createPublicKey } from 'node:crypto';

import { calculateJwkThumbprint, exportJWK, SignJWT } from 'jose';

export async function mintInstallationToken(privateKeyPem: string): Promise<string> {
    const key = createPrivateKey(privateKeyPem);
    const kid = await calculateJwkThumbprint(await exportJWK(createPublicKey(key)));
    return new SignJWT({}).setProtectedHeader({ alg: 'EdDSA', kid }).setIssuedAt().setExpirationTime('60s').sign(key);
}
