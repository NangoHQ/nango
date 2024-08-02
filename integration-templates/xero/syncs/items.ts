import type { NangoSync } from '../../models';
import { getTenantId } from '../helpers/get-tenant-id.js';
import { toItem } from '../mappers/to-item.js';

export default async function fetchData(nango: NangoSync): Promise<void> {
    const tenant_id = await getTenantId(nango);

    const config = {
        endpoint: 'api.xro/2.0/Items',
        headers: {
            'xero-tenant-id': tenant_id,
            'If-Modified-Since': ''
        }
    };

    // If it is an incremental sync, only fetch the changed payments
    if (nango.lastSyncDate) {
        config.headers['If-Modified-Since'] = nango.lastSyncDate.toISOString().replace(/\.\d{3}Z$/, ''); // Returns yyyy-mm-ddThh:mm:ss
    }

    // This endpoint does not support pagination.
    const res = await nango.get(config);
    const items = res.data.Items;

    const mappedItems = items.map(toItem);
    await nango.batchSave(mappedItems, 'Item');
}
