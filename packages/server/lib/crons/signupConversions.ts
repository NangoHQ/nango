import * as cron from 'node-cron';

import { getLogger } from '@nangohq/utils';

import { envs } from '../env.js';
import { createConversionAdapters } from '../services/signupConversions/adapters.js';
import { deliverNextConversion, enqueueConversions } from '../services/signupConversions/worker.js';

const logger = getLogger('cron.signupConversions');
export const signupConversionsEnabled = (): boolean =>
    envs.NANGO_CLOUD && envs.NODE_ENV === 'production' && envs.ADVERTISING_CONSENT_ENABLED && envs.SIGNUP_AD_CONVERSIONS_ENABLED;

export function signupConversionsCron(): void {
    if (!signupConversionsEnabled()) return;
    let adapters;
    try {
        adapters = createConversionAdapters(envs.SIGNUP_AD_CONVERSIONS_CONFIG);
    } catch {
        logger.error('Signup conversion delivery disabled: invalid configuration');
        return;
    }
    cron.schedule(
        '* * * * *',
        async () => {
            for (const adapter of adapters) {
                if (!signupConversionsEnabled()) return;
                let stage = 'enqueue';
                try {
                    await enqueueConversions(adapter);
                    stage = 'delivery';
                    for (let count = 0; count < 20 && signupConversionsEnabled(); count++) {
                        if (!(await deliverNextConversion(adapter, signupConversionsEnabled))) break;
                    }
                } catch (err) {
                    // Driver messages can contain query values. Log only known diagnostic codes.
                    const code = err instanceof Error && 'code' in err ? err.code : undefined;
                    const errorCode =
                        typeof code === 'string' && ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', '57014', '40P01', '40001'].includes(code) ? code : 'unknown';
                    logger.error('Signup conversion worker failed', { platform: adapter.platform, stage, errorCode });
                }
            }
        },
        { noOverlap: true }
    );
}
