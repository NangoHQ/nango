import type { NangoSync, HubspotContact } from './models';

export default async function fetchData(nango: NangoSync) {
    const properties = ['firstname', 'lastname', 'email'];

    let totalRecords = 0;

    try {
        const endpoint = '/crm/v3/objects/contacts';
        const config = {
            params: {
                properties: properties.join(',')
            },
            paginate: {
                type: 'cursor',
                cursor_path_in_response: 'paging.next.after',
                limit_name_in_request: 'limit',
                cursor_name_in_request: 'after',
                response_path: 'results',
                limit: 100
            }
        };
        for await (const contact of nango.paginate({ ...config, endpoint })) {
            const mappedContact = mapHubspotContacts(contact);

            const batchSize: number = mappedContact.length;
            totalRecords += batchSize;
            await nango.log(`Saving batch of ${batchSize} owners (total owners: ${totalRecords})`);
            await nango.batchSave(mappedContact, 'HubspotContact');
        }
    } catch (error: any) {
        throw new Error(`Error in fetchData: ${error.message}`);
    }
}

function mapHubspotContacts(records: any[]): HubspotContact[] {
    return records.map((record: any) => {
        return {
            id: record.id as string,
            created_at: record.createdAt,
            updated_at: record.updatedAt,
            first_name: record.properties.firstname,
            last_name: record.properties.lastname,
            email: record.properties.email,
            active: record.archived !== true
        };
    });
}
