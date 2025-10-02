import type { HighLevelAuthResponse } from './types.js';
import type { InternalNango as Nango } from '../../internal-nango.js';

export default async function execute(nango: Nango) {
    const connection = await nango.getConnection();

    if (connection.credentials.type !== 'OAUTH2') {
        throw new Error('Expected OAuth2 credentials for HighLevel');
    }

    const authResponse = connection.credentials.raw as HighLevelAuthResponse;

    if (!authResponse) {
        throw new Error('Missing raw authentication response from HighLevel');
    }

    const { companyId, locationId } = authResponse;

    const config: { companyId?: string; locationId?: string } = {};

    if (companyId?.trim()) {
        config.companyId = companyId.trim();
    }

    if (locationId?.trim()) {
        config.locationId = locationId.trim();
    }

    if (Object.keys(config).length > 0) {
        await nango.updateConnectionConfig(config);
    }
}
