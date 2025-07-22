import { envs } from '@nangohq/logs';
import { basePublicUrl, baseUrl, connectUrl, flagHasAuth, flagHasManagedAuth, flagHasPlan, flagHasScripts, flagHasSlack, isCloud } from '@nangohq/utils';

import { asyncWrapper } from '../../utils/asyncWrapper.js';

import type { WindowEnv } from '@nangohq/types';

export const getEnvJs = asyncWrapper<any, any>((_, res) => {
    const configObject: WindowEnv = {
        apiUrl: baseUrl,
        publicUrl: basePublicUrl,
        connectUrl: connectUrl,
        gitHash: envs.GIT_HASH,
        publicSentryKey: envs.PUBLIC_SENTRY_KEY || '',
        publicPosthogKey: envs.PUBLIC_POSTHOG_KEY || '',
        publicPosthogHost: envs.PUBLIC_POSTHOG_HOST || '',
        publicLogoDevKey: envs.PUBLIC_LOGODEV_KEY || '',
        publicKoalaApiUrl: envs.PUBLIC_KOALA_API_URL || '',
        publicKoalaCdnUrl: envs.PUBLIC_KOALA_CDN_URL || '',
        publicStripeKey: envs.PUBLIC_STRIPE_KEY || '',
        isCloud,
        features: {
            logs: envs.NANGO_LOGS_ENABLED,
            scripts: flagHasScripts,
            auth: flagHasAuth,
            managedAuth: flagHasManagedAuth,
            gettingStarted: true,
            slack: flagHasSlack,
            plan: flagHasPlan
        }
    };
    res.setHeader('content-type', 'text/javascript');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(`window._env = ${JSON.stringify(configObject, null, 2)};`);
});
