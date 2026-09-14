import { stringTimingSafeEqual } from '@nangohq/utils';

import { trimOrNull } from './credential.js';
import { jwtHeaderAlg, verifyInternalServiceToken, verifyRunnerDispatchToken } from './token.js';

import type { InternalServiceAuth } from './constants.js';

export function verifyInternalServiceCredential(
    token: string,
    audience: string,
    creds: { signingKey?: string | undefined; staticToken?: string | undefined; runnerPublicKey?: string | undefined }
): InternalServiceAuth | null {
    const alg = jwtHeaderAlg(token);
    if (alg === 'EdDSA') {
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
