import type { NangoSync, SalesforceContact } from '../../models';

export default async function fetchData(nango: NangoSync) {
    const query = buildQuery(nango.lastSyncDate);

    await fetchAndSaveRecords(nango, query);
}

function buildQuery(lastSyncDate?: Date): string {
    let baseQuery = `
    SELECT
    Id,
    FirstName,
    LastName,
    Email,
    AccountId,
    LastModifiedDate
    FROM Contact
    `;

    if (lastSyncDate) {
        baseQuery += ` WHERE LastModifiedDate > ${lastSyncDate.toISOString()}`;
    }

    return baseQuery;
}

async function fetchAndSaveRecords(nango: NangoSync, query: string) {
    let endpoint = '/services/data/v53.0/query';

    while (true) {
        const response = await nango.get({
            endpoint: endpoint,
            params: endpoint === '/services/data/v53.0/query' ? { q: query } : {}
        });

        const mappedRecords = mapContacts(response.data.records);

        await nango.batchSave(mappedRecords, 'SalesforceContact');

        if (response.data.done) {
            break;
        }

        endpoint = response.data.nextRecordsUrl;
    }
}

function mapContacts(records: any[]): SalesforceContact[] {
    return records.map((record: any) => {
        return {
            id: record.Id as string,
            first_name: record.FirstName,
            last_name: record.LastName,
            email: record.Email,
            account_id: record.AccountId,
            last_modified_date: record.LastModifiedDate
        };
    });
}
