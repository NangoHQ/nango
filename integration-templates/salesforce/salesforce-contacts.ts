import { SalesforceContact, NangoSync } from './models';

export default async function fetchData(nango: NangoSync): Promise<void> {
    const { lastSyncDate } = nango;

    let query = `
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
        query += ` WHERE LastModifiedDate > ${lastSyncDate?.toISOString()}`;
    }

    const response = await nango.get({
        endpoint: '/services/data/v53.0/query',
        params: {
            q: query
        }
    });

    const { records, done } = response.data;
    let nextRecordsUrl = response.data.nextRecordsUrl;

    const accounts = mapContacts(records);
    await nango.batchSave(accounts, 'SalesforceContact');

    if (!done) {
        let allResults = false;
        while (!allResults) {
            const nextResponse = await nango.get({
                endpoint: nextRecordsUrl
            });

            const { records: nextRecords, done: nextDone, nextRecordsUrl: nextNextRecordsUrl } = nextResponse.data;

            const firstAccounts = mapContacts(nextRecords);
            await nango.batchSave(firstAccounts, 'SalesforceContact');

            if (nextDone) {
                allResults = true;
            } else {
                nextRecordsUrl = nextNextRecordsUrl;
            }
        }
    }
}

function mapContacts(records: any[]): SalesforceContact[] {
    const accounts: SalesforceContact[] = records.map((record: any) => {
        const account: SalesforceContact = {
            id: record.Id as string,
            first_name: record.FirstName,
            last_name: record.LastName,
            email: record.Email,
            account_id: record.AccountId,
            last_modified_date: record.LastModifiedDate
        };
        return account;
    });

    return accounts;
}
