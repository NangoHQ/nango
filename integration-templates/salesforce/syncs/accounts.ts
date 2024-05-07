import type { NangoSync, SalesforceAccount } from '../../models';

export default async function fetchData(nango: NangoSync) {
    const query = buildQuery(nango.lastSyncDate);

    await fetchAndSaveRecords(nango, query);
}

function buildQuery(lastSyncDate?: Date): string {
    let baseQuery = `
    SELECT
        Id,
        Name,
        Website,
        Description,
        NumberOfEmployees,
        LastModifiedDate
        FROM Account
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

        const mappedRecords = mapAccounts(response.data.records);

        await nango.batchSave(mappedRecords, 'SalesforceAccount');

        if (response.data.done) {
            break;
        }

        endpoint = response.data.nextRecordsUrl;
    }
}

function mapAccounts(records: any[]): SalesforceAccount[] {
    return records.map((record: any) => {
        return {
            id: record.Id as string,
            name: record.Name,
            website: record.Website,
            description: record.Description,
            no_employees: record.NumberOfEmployees,
            last_modified_date: record.LastModifiedDate
        };
    });
}
