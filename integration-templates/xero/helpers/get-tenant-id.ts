import type { NangoAction } from '../../models';

export async function getTenantId(nango: NangoAction) {
    const connection = await nango.getConnection();

    if (connection.connection_config['tenant_id']) {
        return connection.connection_config['tenant_id'];
    }

    const tenants = await nango.get({
        endpoint: 'connections'
    });
    return tenants.data[0]['tenantId'];
}
