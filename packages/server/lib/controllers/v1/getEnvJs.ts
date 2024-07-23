import { basePublicUrl, baseUrl, flagHasAuth, flagHasManagedAuth, flagHasScripts, isCloud, isLocal } from '@nangohq/utils';
import { asyncWrapper } from '../../utils/asyncWrapper.js';
import type { WindowEnv } from '@nangohq/types';
import { envs } from '@nangohq/logs';

export const getEnvJs = asyncWrapper<any, any>((_, res) => {
    const configObject: WindowEnv = {
        apiUrl: baseUrl,
        publicUrl: basePublicUrl,
        publicSentryKey: process.env['PUBLIC_SENTRY_KEY'] || '',
        publicPosthogKey: process.env['PUBLIC_POSTHOG_KEY'] || '',
        publicPosthogPost: process.env['PUBLIC_POSTHOG_HOST'] || '',
        isCloud,
        features: {
            logs: envs.NANGO_LOGS_ENABLED,
            scripts: flagHasScripts,
            auth: flagHasAuth,
            managedAuth: flagHasManagedAuth,
            interactiveDemo: isCloud || isLocal
        }
    };
    res.setHeader('content-type', 'text/javascript');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(`window._env = ${JSON.stringify(configObject, null, 2)};`);
});
