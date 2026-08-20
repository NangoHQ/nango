import { stringTimingSafeEqual } from '../string.js';
import { getInternalServiceCredential } from './credential.js';
import { isJwtShape, verifyInternalServiceToken } from './token.js';

import type { InternalServiceAuth } from './constants.js';
import type { EnvRecord } from './credential.js';

export function verifyInternalServiceCredential(token: string, audience: string, env: EnvRecord = process.env): InternalServiceAuth | null {
    if (isJwtShape(token)) {
        const hmac = verifyInternalServiceToken(token, audience, env);
        if (hmac) {
            return hmac;
        }
    }

    const expected = getInternalServiceCredential(env);
    if (expected && stringTimingSafeEqual(token, expected)) {
        return { kind: 'static', subject: 'static', audience };
    }

    return null;
}
