import type { NangoSync, Item } from '../../models';

async function getTenantId(nango: NangoSync) {
    const tenants = await nango.get({
        endpoint: 'connections'
    });
    return tenants.data[0]['tenantId'];
}

export default async function fetchData(nango: NangoSync): Promise<void> {
    const tenant_id = await getTenantId(nango);

    const config = {
        endpoint: 'api.xro/2.0/Items',
        headers: {
            'xero-tenant-id': tenant_id,
            'If-Modified-Since': ''
        }
    };

    // If it is an incremential sync, only fetch the changed payments
    if (nango.lastSyncDate) {
        config.headers['If-Modified-Since'] = nango.lastSyncDate.toISOString().replace(/\.\d{3}Z$/, ''); // Returns yyyy-mm-ddThh:mm:ss
    }

    // This endpoint does not support pagination.
    const res = await nango.get(config);
    const items = res.data.Items;

    const mappedItems = items.map(mapXeroItem);
    await nango.batchSave(mappedItems, 'Item');
}

function mapXeroItem(xeroItem: any): Item {
    return {
        id: xeroItem.ItemID,
        item_code: xeroItem.Code,
        name: xeroItem.Name,
        description: xeroItem.Description,
        account_code: xeroItem.SalesDetails ? xeroItem.SalesDetails.AccountCode : null
    } as Item;
}
