import { stringTimingSafeEqual } from '@nangohq/utils';

import { getInternalServiceCredential } from './credential.js';
import { verifyInternalServiceToken } from './token.js';

import type { InternalServiceAuth } from './constants.js';
import type { EnvRecord } from './credential.js';

export function verifyInternalServiceCredential(token: string, audience: string, env: EnvRecord = process.env): InternalServiceAuth | null {
    const hmac = verifyInternalServiceToken(token, audience, env);
    if (hmac.ok) {
        return hmac;
    }
    if (hmac.reason !== 'not_jwt') {
        return null;
    }

    const expected = getInternalServiceCredential(env);
    if (expected && stringTimingSafeEqual(token, expected)) {
        return { kind: 'static', subject: 'static', audience };
    }

    return null;
}
