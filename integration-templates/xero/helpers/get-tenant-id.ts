import type { NangoSync, NangoAction } from '../../models';

export async function getTenantId(nango: NangoAction | NangoSync) {
    const connection = await nango.getConnection();

    if (connection.connection_config['tenant_id']) {
        return connection.connection_config['tenant_id'];
    }

    const connections = await nango.get({
        endpoint: 'connections'
    });

    if (connections.data.length === 1) {
        return connections.data[0]['tenantId'];
    } else {
        throw new Error('Multiple tenants found. Please reauthenticate to set the tenant id.');
    }
}
