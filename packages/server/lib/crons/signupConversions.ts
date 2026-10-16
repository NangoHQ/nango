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
                try {
                    await enqueueConversions(adapter);
                    for (let count = 0; count < 20 && signupConversionsEnabled(); count++) {
                        if (!(await deliverNextConversion(adapter, signupConversionsEnabled))) break;
                    }
                } catch {
                    logger.error('Signup conversion worker failed', { platform: adapter.platform });
                }
            }
        },
        { noOverlap: true }
    );
}
