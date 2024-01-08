import type { NangoSync, HubspotContact } from './models';

export default async function fetchData(nango: NangoSync) {
    const query = `properties=firstname,lastname,email`;

    for await (const records of nango.paginate({ endpoint: '/crm/v3/objects/contacts', params: { query } })) {
        const mappedRecords = mapHubspotContacts(records);

        await nango.batchSave(mappedRecords, 'HubspotContact');
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
