import { NangoSync } from 'nango';
import { SalesforceAccount } from './models';

export default async function fetchData(nango: NangoSync): Promise<{SalesforceAccount: SalesforceAccount[]}> {
    const { lastSyncDate } = nango;

    // Use nango.getFieldMapping once you set it in the backend:
    // const fieldMappings = await nango.getFieldMapping();
    const fieldMappings = {
        slack_channel_id: 'Slack_ID__c',
        primary_support_rep: 'Primary_Support_Rep__c',
        secondary_support_rep: 'Secondary_Support_Rep__c'
    };

    if (Object.keys(fieldMappings).length === 0) {
        throw new Error('No field mapping found, aborting the sync!');
    }

    const { slack_channel_id, primary_support_rep, secondary_support_rep } = fieldMappings;

    let query = `
        SELECT
        Id,
        Name,
        Website,
        Description,
        NumberOfEmployees,
        ${slack_channel_id},
        ${primary_support_rep},
        ${secondary_support_rep},
        LastModifiedDate
        FROM Account
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

    const accounts = mapAccounts(records, fieldMappings);
    await nango.batchSend(accounts, 'SalesforceAccount');

    if (!done) {
        let allResults = false;
        while (!allResults) {
            const nextResponse = await nango.get({
                endpoint: nextRecordsUrl
            });

            const { records: nextRecords, done: nextDone, nextRecordsUrl: nextNextRecordsUrl } = nextResponse.data;

            const firstAccounts = mapAccounts(nextRecords, fieldMappings);
            await nango.batchSend(firstAccounts, 'SalesforceAccount')

            if (nextDone) {
                allResults = true;
            } else {
                nextRecordsUrl = nextNextRecordsUrl;
            }
        }
    }

    return { SalesforceAccount: [] };
}

function mapAccounts(records: any[], fieldMappings: any): SalesforceAccount[] {

    const { slack_channel_id, primary_support_rep, secondary_support_rep } = fieldMappings;

    const accounts: SalesforceAccount[] = records.map((record: any) => {
        const account: SalesforceAccount = {
            id: record.Id as string,
            name: record.Name,
            website: record.Website,
            description: record.Description,
            no_employees: record.NumberOfEmployees,
            slack_channel_id: record[slack_channel_id] as string,
            primary_support_rep: record[primary_support_rep],
            secondary_support_rep: record[secondary_support_rep],
            last_modified_date: record.LastModifiedDate,
        };
        return account;
    });

    return accounts;
}
