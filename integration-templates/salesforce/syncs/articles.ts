import type { NangoSync, SalesforceArticle } from '../../models';

interface Metadata {
    customFields: string[];
}

export default async function fetchData(nango: NangoSync) {
    const customFields = (await nango.getMetadata<Metadata>()).customFields;

    const query = buildQuery(customFields, nango.lastSyncDate);

    await fetchAndSaveRecords(nango, query, customFields);
}

function buildQuery(customFields: string[], lastSyncDate?: Date): string {
    let baseQuery = `
        SELECT Id, Title, ${customFields.join(' ,')}, LastModifiedDate
        FROM Knowledge__kav
        WHERE IsLatestVersion = true
    `;

    if (lastSyncDate) {
        baseQuery += ` AND LastModifiedDate > ${lastSyncDate.toISOString()}`;
    }

    return baseQuery;
}

async function fetchAndSaveRecords(nango: NangoSync, query: string, customFields: string[]) {
    let endpoint = '/services/data/v53.0/query';

    while (true) {
        const response = await nango.get({
            endpoint: endpoint,
            params: endpoint === '/services/data/v53.0/query' ? { q: query } : {}
        });

        const mappedRecords = mapRecords(response.data.records, customFields);

        await nango.batchSave(mappedRecords, 'SalesforceArticle');

        if (response.data.done) {
            break;
        }

        endpoint = response.data.nextRecordsUrl;
    }
}

function mapRecords(records: any[], customFields: string[]): SalesforceArticle[] {
    return records.map((record: any) => {
        return {
            id: record.Id as string,
            title: record.Name,
            content: customFields.map((field: string) => `Field: ${field}\n${record[field]}`).join('\n'),
            last_modified_date: record.LastModifiedDate
        };
    });
}
