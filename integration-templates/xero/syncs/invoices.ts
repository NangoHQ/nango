import type { NangoSync } from '../../models';
import { getTenantId } from '../helpers/get-tenant-id.js';
import { toInvoice } from '../mappers/to-invoice.js';

export default async function fetchData(nango: NangoSync): Promise<void> {
    const tenant_id = await getTenantId(nango);

    const config = {
        endpoint: 'api.xro/2.0/Invoices',
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
        const invoices = res.data.Invoices;

        const activeInvoices = invoices.filter((x: any) => x.Status !== 'DELETED' && x.Status !== 'VOIDED');
        const mappedActiveInvoices = activeInvoices.map(toInvoice);
        await nango.batchSave(mappedActiveInvoices, 'Invoice');

        if (nango.lastSyncDate) {
            const archivedInvoices = invoices.filter((x: any) => x.Status === 'DELETED' || x.Status === 'VOIDED');
            const mappedArchivedInvoices = archivedInvoices.map(toInvoice);
            await nango.batchDelete(mappedArchivedInvoices, 'Invoice');
        }

        // Should we still fetch the next page?
        page = invoices.length < 100 ? -1 : page + 1;
    } while (page != -1);
}
