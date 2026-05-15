import { envs } from '@nangohq/logs';
import {
    basePublicUrl,
    baseUrl,
    connectUrl,
    flagHasAuth,
    flagHasManagedAuth,
    flagHasPlan,
    flagHasScripts,
    flagHasSlack,
    flags,
    isCloud,
    isEnterprise,
    isHosted
} from '@nangohq/utils';

import type { WindowEnv } from '@nangohq/types';
import type { RequestHandler } from 'express';

export const getEnvJs: RequestHandler = (_, res) => {
    const configObject: WindowEnv = {
        apiUrl: baseUrl,
        publicUrl: basePublicUrl,
        connectUrl: connectUrl,
        gitHash: envs.GIT_HASH,
        publicSentryKey: envs.PUBLIC_SENTRY_KEY || '',
        publicPosthogKey: envs.PUBLIC_POSTHOG_KEY || '',
        publicPosthogHost: envs.PUBLIC_POSTHOG_HOST || '',
        publicLogoDevKey: envs.PUBLIC_LOGODEV_KEY || '',
        publicStripeKey: envs.PUBLIC_STRIPE_KEY || '',
        isCloud,
        isHosted,
        isEnterprise,
        features: {
            logs: envs.NANGO_LOGS_ENABLED,
            scripts: flagHasScripts,
            auth: flagHasAuth,
            allowSignup: envs.AUTH_ALLOW_SIGNUP,
            managedAuth: flagHasManagedAuth,
            gettingStarted: true,
            slack: flagHasSlack,
            plan: flagHasPlan,
            authRoles: flags.hasAuthRoles
        }
    };
    res.setHeader('content-type', 'text/javascript');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(`window._env = ${JSON.stringify(configObject, null, 2)};`);
};
