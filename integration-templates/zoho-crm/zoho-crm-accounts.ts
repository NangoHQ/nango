import type { ZohoCRMAccount, NangoSync } from './models';

export default async function fetchData(nango: NangoSync) {
    let totalRecords = 0;
    const fields = ''; // Define your fields to retrieve specific field values

    try {
        const endpoint = '/crm/v2/Accounts';
        const config = {
            headers: {
                'If-Modified-Since': nango.lastSyncDate?.toUTCString() || ''
            },
            paginate: {
                limit: 100
            },
            ...(fields ? { params: { fields } } : {})
        };
        for await (const account of nango.paginate({ ...config, endpoint })) {
            const mappedAccounts: ZohoCRMAccount[] = account.map(mapAccounts) || [];
            // Save Accounts
            const batchSize: number = mappedAccounts.length;
            totalRecords += batchSize;

            await nango.log(`Saving batch of ${batchSize} accounts (total accounts: ${totalRecords})`);
            await nango.batchSave(mappedAccounts, 'ZohoCRMAccount');
        }
    } catch (error: any) {
        if (error.status = 304) {
            await nango.log('No Accounts found.');
        }
        else{
            throw new Error(`Error in fetchData: ${error.message}`);
        }
    }
}

function mapAccounts(account: any): ZohoCRMAccount {
    return {
        Owner: account.Owner,
        $currency_symbol: account.$currency_symbol,
        $field_states: account.$field_states,
        Account_Type: account.Account_Type,
        SIC_Code: account.SIC_Code,
        Last_Activity_Time: account.Last_Activity_Time,
        Industry: account.Industry,
        Account_Site: account.Account_Site,
        $state: account.$state,
        $process_flow: account.$process_flow,
        Billing_Country: account.Billing_Country,
        $locked_for_me: account.$locked_for_me,
        id: account.id as string,
        $approved: account.$approved,
        $approval: account.$approval,
        Billing_Street: account.Billing_Street,
        Created_Time: account.Created_Time,
        $editable: account.$editable,
        Billing_Code: account.Billing_Code,
        Shipping_City: account.Shipping_City,
        Shipping_Country: account.Shipping_Country,
        Shipping_Code: account.Shipping_Code,
        Billing_City: account.Billing_City,
        Created_By: account.Created_By,
        $zia_owner_assignment: account.$zia_owner_assignment,
        Annual_Revenue: account.Annual_Revenue,
        Shipping_Street: account.Shipping_Street,
        Ownership: account.Ownership,
        Description: account.Description,
        Rating: account.Rating,
        Shipping_State: account.Shipping_State,
        $review_process: account.$review_process,
        Website: account.Website,
        Employees: account.Employees,
        Record_Image: account.Record_Image,
        Modified_By: account.Modified_By,
        $review: account.$review,
        Phone: account.Phone,
        Account_Name: account.Account_Name,
        Account_Number: account.Account_Number,
        Ticker_Symbol: account.Ticker_Symbol,
        Modified_Time: account.Modified_Time,
        $orchestration: account.$orchestration,
        Parent_Account: account.Parent_Account,
        $in_merge: account.$in_merge,
        Locked__s: account.Locked__s,
        Billing_State: account.Billing_State,
        Tag: account.Tag,
        Fax: account.Fax,
        $approval_state: account.$approval_state
    };
}