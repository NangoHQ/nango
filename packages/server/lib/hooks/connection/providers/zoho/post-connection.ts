import type { InternalNango as Nango } from '../../internal-nango.js';
import type { OAuth2Credentials } from '@nangohq/types';

function extractExtensionFromApiDomain(apiDomain: string): string | null {
    try {
        const marker = 'zohoapis';
        const index = apiDomain.indexOf(marker);

        if (index === -1) {
            return null;
        }

        // Get everything after "zohoapis" as this is returned as https://www.zohoapis.{extension}
        const afterMarker = apiDomain.substring(index + marker.length);

        const extension = afterMarker.replace(/^\./, '').split('/')[0];

        return extension || null;
    } catch (_err) {
        return null;
    }
}

export default async function execute(nango: Nango) {
    const connection = await nango.getConnection();
    const connectionConfig = connection.connection_config || {};

    //if extension is already present, don't override user input
    const existingExtension = connectionConfig['extension'];
    if (typeof existingExtension === 'string' && existingExtension.trim() !== '') {
        return;
    }

    let apiDomain = connectionConfig['api_domain'];

    const credentials = connection.credentials as OAuth2Credentials;
    if (!apiDomain && typeof credentials?.raw?.['api_domain'] === 'string') {
        apiDomain = credentials.raw['api_domain'];
    }

    if (!apiDomain) {
        return;
    }

    const extension = extractExtensionFromApiDomain(apiDomain);

    if (extension) {
        await nango.updateConnectionConfig({ extension });
    }
}
