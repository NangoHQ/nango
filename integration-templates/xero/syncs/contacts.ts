import type { NangoSync } from '../../models';
import { getTenantId } from '../helpers/get-tenant-id.js';
import { toContact } from '../mappers/to-contact.js';

export default async function fetchData(nango: NangoSync): Promise<void> {
    const tenant_id = await getTenantId(nango);

    const config = {
        endpoint: 'api.xro/2.0/Contacts',
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

    // If it is an incremential sync, only fetch the changed contacts
    if (nango.lastSyncDate) {
        config.params.includeArchived = 'true';
        config.headers['If-Modified-Since'] = nango.lastSyncDate.toISOString().replace(/\.\d{3}Z$/, ''); // Returns yyyy-mm-ddThh:mm:ss
    }

    let page = 1;
    do {
        config.params.page = page;
        const res = await nango.get(config);
        const contacts = res.data.Contacts;

        // Save active contacts
        const activeContacts = contacts.filter((x: any) => x.ContactStatus === 'ACTIVE');
        const mappedActiveContacts = activeContacts.map(toContact);
        await nango.batchSave(mappedActiveContacts, 'Contact');

        // If it is an incremental refresh, mark archived contacts as deleted
        if (nango.lastSyncDate) {
            const archivedContacts = contacts.filter((x: any) => x.ContactStatus === 'ARCHIVED');
            const mappedArchivedContacts = archivedContacts.map(toContact);
            await nango.batchDelete(mappedArchivedContacts, 'Contact');
        }

        // Should we still fetch the next page?
        page = contacts.length < 100 ? -1 : page + 1;
    } while (page != -1);
}
