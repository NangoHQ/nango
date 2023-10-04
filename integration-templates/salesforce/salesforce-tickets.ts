import type { NangoSync, SalesforceTicket } from './models';

export default async function fetchData(nango: NangoSync) {
    const query = buildQuery(nango.lastSyncDate);

    await fetchAndSaveTickets(nango, query);
}

function buildQuery(lastSyncDate?: Date): string {
    let baseQuery = `
        SELECT
        Id,
        CaseNumber,
        Subject,
        AccountId,
        ContactId,
        OwnerId,
        Priority,
        Status,
        Description,
        Type,
        CreatedDate,
        ClosedDate,
        Origin,
        IsClosed,
        IsEscalated,
        LastModifiedDate
        FROM Case
    `;

    if (lastSyncDate) {
        baseQuery += ` WHERE LastModifiedDate > ${lastSyncDate.toISOString()}`;
    }

    return baseQuery;
}

async function fetchAndSaveTickets(nango: NangoSync, query: string) {
    let endpoint = '/services/data/v53.0/query';

    while (true) {
        const response = await nango.get({
            endpoint: endpoint,
            params: endpoint === '/services/data/v53.0/query' ? { q: query } : {}
        });

        const mappedRecords = mapDeals(response.data.records);

        await nango.batchSave(mappedRecords, 'SalesforceTicket');

        if (response.data.done) {
            break;
        }

        endpoint = response.data.nextRecordsUrl;
    }
}

function mapDeals(records: any[]): SalesforceTicket[] {
    return records.map((record: any) => {
        const salesforceTicket: SalesforceTicket = {
            id: record.Id as string,
            case_number: record.CaseNumber,
            subject: record.Subject,
            account_id: record.AccountId,
            contact_id: record.ContactId,
            owner_id: record.OwnerId,
            priority: record.Priority,
            status: record.Status,
            description: record.Description,
            type: record.Type,
            created_date: record.CreatedDate,
            closed_date: record.ClosedDate,
            origin: record.Origin,
            is_closed: record.IsClosed,
            is_escalated: record.IsEscalated,
            last_modified_date: record.LastModifiedDate
        };

        return salesforceTicket;
    });
}
