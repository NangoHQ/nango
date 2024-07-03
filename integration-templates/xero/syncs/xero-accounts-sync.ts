import type { NangoSync, Account } from '../../models';

async function getTenantId(nango: NangoSync) {
    const tenants = await nango.get({
        endpoint: 'connections'
    });
    return tenants.data[0]['tenantId'];
}

export default async function fetchData(nango: NangoSync): Promise<void> {
    const tenant_id = await getTenantId(nango);

    const config = {
        endpoint: 'api.xro/2.0/Accounts',
        headers: {
            'xero-tenant-id': tenant_id,
            'If-Modified-Since': ''
        },
        params: {
            order: 'UpdatedDateUTC DESC'
        }
    };

    // If it is an incremential sync, only fetch the changed accounts
    if (nango.lastSyncDate) {
        config.headers['If-Modified-Since'] = nango.lastSyncDate.toISOString().replace(/\.\d{3}Z$/, ''); // Returns yyyy-mm-ddThh:mm:ss
    }

    const res = await nango.get(config);
    const accounts = res.data.Accounts;

    // Save active accounts
    const activeAccounts = accounts.filter((x: any) => x.Status === 'ACTIVE');
    const mappedActiveContacts = activeAccounts.map(mapXeroAccount);
    await nango.batchSave(mappedActiveContacts, 'Account');

    // If it is an incremential refresh, mark archived contacts as deleted
    if (nango.lastSyncDate) {
        const archivedAccounts = accounts.filter((x: any) => x.Status === 'ARCHIVED');
        const mappedArchivedAccounts = archivedAccounts.map(mapXeroAccount);
        await nango.batchDelete(mappedArchivedAccounts, 'Account');
    }
}

function mapXeroAccount(xeroAccount: any): Account {
    return {
        id: xeroAccount.AccountID,
        code: xeroAccount.Code,
        name: xeroAccount.Name,
        type: xeroAccount.Type,
        tax_type: xeroAccount.TaxType,
        description: xeroAccount.Description,
        class: xeroAccount.Class,
        bank_account_type: xeroAccount.BankAccountType,
        reporting_code: xeroAccount.ReportingCode,
        reporting_code_name: xeroAccount.ReportingCodeName
    } as Account;
}
