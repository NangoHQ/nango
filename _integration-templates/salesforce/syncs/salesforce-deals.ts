import type { NangoSync, SalesforceDeal } from '../../models';

export default async function fetchData(nango: NangoSync) {
    const query = buildQuery(nango.lastSyncDate);

    await fetchAndSaveRecords(nango, query);
}

function buildQuery(lastSyncDate?: Date): string {
    let baseQuery = `
        SELECT
        Id,
        Name,
        Amount,
        StageName,
        AccountId,
        LastModifiedDate
        FROM Opportunity
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

        const mappedRecords = mapDeals(response.data.records);

        await nango.batchSave(mappedRecords, 'SalesforceDeal');

        if (response.data.done) {
            break;
        }

        endpoint = response.data.nextRecordsUrl;
    }
}

function mapDeals(records: any[]): SalesforceDeal[] {
    return records.map((record: any) => {
        return {
            id: record.Id as string,
            name: record.Name,
            amount: record.Amount,
            stage: record.StageName,
            account_id: record.AccountId,
            last_modified_date: record.LastModifiedDate
        };
    });
}
