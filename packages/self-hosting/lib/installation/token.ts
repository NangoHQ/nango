import { createHash, createPrivateKey, createPublicKey } from 'node:crypto';

import { calculateJwkThumbprint, exportJWK, SignJWT } from 'jose';

import type { KeyObject } from 'node:crypto';

export const INSTALLATION_TOKEN_TYPE = 'nango-installation+jwt';
export const INSTALLATION_TOKEN_VERSION = 1;
export const INSTALLATION_TOKEN_LIFETIME = '5m';
export const INSTALLATION_TOKEN_CLOCK_TOLERANCE = '15m';

export function digestBody(body: Uint8Array): string {
    return createHash('sha256').update(body).digest('base64url');
}

/** The key an installation signs with, and the id Nango knows its public half by. */
export async function signingKey(privateKeyPem: string): Promise<{ key: KeyObject; kid: string }> {
    const key = createPrivateKey(privateKeyPem);
    return { key, kid: await calculateJwkThumbprint(await exportJWK(createPublicKey(key))) };
}

/** The token is only good for the request that carries exactly this body. */
export async function mintInstallationToken(privateKeyPem: string, { body }: { body: Uint8Array }): Promise<string> {
    const { key, kid } = await signingKey(privateKeyPem);
    return new SignJWT({ ver: INSTALLATION_TOKEN_VERSION, body_sha256: digestBody(body) })
        .setProtectedHeader({ alg: 'EdDSA', typ: INSTALLATION_TOKEN_TYPE, kid })
        .setIssuedAt()
        .setExpirationTime(INSTALLATION_TOKEN_LIFETIME)
        .sign(key);
}
