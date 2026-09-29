import { stringTimingSafeEqual } from '@nangohq/utils';

import { trimOrNull } from './credential.js';
import { verify as verifyUnifiedToken } from './jwt.js';
import { jwtHeaderAlg, verifyInternalServiceToken, verifyRunnerDispatchToken } from './token.js';

import type { InternalServiceAuth } from './constants.js';
import type { KeyRegistry } from './jwt.js';

export async function verifyInternalServiceCredential(
    token: string,
    audience: string,
    creds: { signingKey?: string | undefined; staticToken?: string | undefined; runnerPublicKey?: string | undefined; registry?: KeyRegistry | undefined }
): Promise<InternalServiceAuth | null> {
    const alg = jwtHeaderAlg(token);
    if (alg === 'EdDSA') {
        const unified = await verifyUnifiedToken(token, audience, creds.registry ?? {});
        if (unified.auth) {
            return unified.auth;
        }
        // A kid selects one registry key. The legacy dispatch verifier ignores kid, so only kid-less tokens may use it.
        if (unified.kidBound) {
            return null;
        }
        const eddsa = verifyRunnerDispatchToken(token, audience, creds.runnerPublicKey);
        return eddsa.ok ? eddsa : null;
    }

    const hmac = verifyInternalServiceToken(token, audience, creds.signingKey);
    if (hmac.ok) {
        return hmac;
    }
    if (hmac.reason !== 'not_jwt') {
        return null;
    }

    const expected = trimOrNull(creds.staticToken);
    if (expected && stringTimingSafeEqual(token, expected)) {
        return { kind: 'static', subject: 'static', audience };
    }

    return null;
}
