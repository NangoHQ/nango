import { getLogger } from '@nangohq/utils';

import type { InternalNango as Nango } from '../../internal-nango.js';
import type { OAuth2Credentials } from '@nangohq/types';

const logger = getLogger('post-connection:zoho');

function extractExtensionFromApiDomain(apiDomain: string): string | null {
    try {
        const url = new URL(apiDomain);
        const hostname = url.hostname;

        const parts = hostname.split('.');
        if (parts.length >= 2) {
            const extension = parts[parts.length - 1];
            return extension || null;
        }
        return null;
    } catch (err) {
        logger.info('Failed to parse api_domain URL', { apiDomain, error: err });
        return null;
    }
}

export default async function execute(nango: Nango) {
    const connection = await nango.getConnection();
    const connectionConfig = connection.connection_config || {};

    //if extension is already present, don't override user input
    const existingExtension = connectionConfig['extension'];
    if (existingExtension && typeof existingExtension === 'string' && existingExtension.trim() !== '') {
        return;
    }

    let apiDomain = connectionConfig['api_domain'];

    //if not in connection_config, try to get it from credentials metadata
    if (!apiDomain) {
        const credentials = connection.credentials as OAuth2Credentials;
        if (credentials?.raw && typeof credentials.raw === 'object' && 'api_domain' in credentials.raw) {
            const rawApiDomain = credentials.raw['api_domain'];
            if (typeof rawApiDomain === 'string') {
                apiDomain = rawApiDomain;
            }
        }
    }

    if (!apiDomain) {
        logger.info('no api_domain found in connection config or credentials.');
        return;
    }

    const extension = extractExtensionFromApiDomain(apiDomain);

    if (extension) {
        await nango.updateConnectionConfig({ extension });
    }
}
