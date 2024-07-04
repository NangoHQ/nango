import type { NangoSync } from '../../models';
import { getTenantId } from '../helpers/get-tenant-id.js';
import { toPayment } from '../mappers/to-payment.js';

export default async function fetchData(nango: NangoSync): Promise<void> {
    const tenant_id = await getTenantId(nango);

    const config = {
        endpoint: 'api.xro/2.0/Payments',
        headers: {
            'xero-tenant-id': tenant_id,
            'If-Modified-Since': ''
        },
        params: {
            page: 1,
            includeArchived: 'false'
        }
    };

    await nango.log(`Last sync date - type: ${typeof nango.lastSyncDate} JSON value: ${JSON.stringify(nango.lastSyncDate)}`);

    if (nango.lastSyncDate) {
        config.params.includeArchived = 'true';
        config.headers['If-Modified-Since'] = nango.lastSyncDate.toISOString().replace(/\.\d{3}Z$/, ''); // Returns yyyy-mm-ddThh:mm:ss
    }

    let page = 1;
    do {
        config.params.page = page;
        const res = await nango.get(config);
        const payments = res.data.Payments;

        const activePayments = payments.filter((x: any) => x.Status !== 'DELETED');
        const mappedActivePayments = activePayments.map(toPayment);
        await nango.batchSave(mappedActivePayments, 'Payment');

        if (nango.lastSyncDate) {
            const archivedPayments = payments.filter((x: any) => x.Status === 'DELETED');
            const mappedArchivedPayments = archivedPayments.map(toPayment);
            await nango.batchDelete(mappedArchivedPayments, 'Payment');
        }

        // Should we still fetch the next page?
        page = payments.length < 100 ? -1 : page + 1;
    } while (page != -1);
}
