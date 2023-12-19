import type { ZohoCRMDeal, NangoSync } from './models';

export default async function fetchData(nango: NangoSync) {
    try {
        const responses = await getAllDeals(nango, '/crm/v2/Deals');
        if (responses.length > 0) {
            const mappedDeals: ZohoCRMDeal[] = responses.map(mapDeals);
            // Save Deals
            await nango.batchSave(mappedDeals, 'ZohoCRMDeal');
        } else {
            await nango.log('No Deals found.');
        }
    } catch (error: any) {
        await nango.log(`Error in fetchData: ${error.message}`);
    }
}

async function getAllDeals(nango: NangoSync, endpoint: string): Promise<any[]> {
    const deals: any[] = [];
    let page = 1;
    const perPage = 100;
    let response: { data: { data?: any[]; info?: { more_records?: boolean }; nextPage?: string } };

    try {
        do {
            const { params, headers } = generateApiRequestParams(nango, page, perPage);

            response = await nango.get({
                endpoint: endpoint,
                params: params,
                headers: headers
            });

            if (!response.data.data) {
                throw new Error(`Received a ZohoCRMDeals API error (for ${endpoint}): ${JSON.stringify(response.data, null, 2)}`);
            }

            deals.push(...response.data.data);
            page++; // Increment the page for the next request
        } while (response.data.info?.more_records);

        return deals;
    } catch (error: any) {
        // Handle unexpected errors, log them, and possibly retry or take appropriate action
        await nango.log(`Error in getAllDeals: ${error.message}`);
        return [];
    }
}

function generateApiRequestParams(nango: NangoSync, page: number, perPage: number): { params: any; headers: any } {
    const params: any = {
        page: `${page}`,
        per_page: `${perPage}`
    };
    const fields = ''; // Define your fields to retrieve specific field values

    const { lastSyncDate } = nango;

    if (fields) {
        params.fields = fields;
    }

    const headers: any = {};
    if (lastSyncDate) {
        headers['If-Modified-Since'] = lastSyncDate.toUTCString();
    }

    return { params, headers };
}

function mapDeals(deal: any): ZohoCRMDeal {
    return {
        Owner: deal.Owner,
        Description: deal.Description,
        $currency_symbol: deal.$currency_symbol,
        Campaign_Source: deal.Campaign_Source,
        $field_states: deal.$field_states,
        $review_process: deal.$review_process,
        Closing_Date: deal.Closing_Date,
        Reason_For_Loss__s: deal.Reason_For_Loss__s,
        Last_Activity_Time: deal.Last_Activity_Time,
        Modified_By: deal.Modified_By,
        $review: deal.$review,
        Lead_Conversion_Time: deal.Lead_Conversion_Time,
        $state: deal.$state,
        $process_flow: deal.$process_flow,
        Deal_Name: deal.Deal_Name,
        Expected_Revenue: deal.Expected_Revenue,
        Overall_Sales_Duration: deal.Overall_Sales_Duration,
        Stage: deal.Stage,
        $locked_for_me: deal.$locked_for_me,
        Account_Name: deal.Account_Name,
        id: deal.id as string,
        $approved: deal.$approved,
        $approval: deal.$approval,
        Modified_Time: deal.Modified_Time,
        Created_Time: deal.Created_Time,
        Amount: deal.Amount,
        Next_Step: deal.Next_Step,
        Probability: deal.Probability,
        $editable: deal.$editable,
        $orchestration: deal.$orchestration,
        Contact_Name: deal.Contact_Name,
        Sales_Cycle_Duration: deal.Sales_Cycle_Duration,
        Type:deal. Type,
        $in_merge: deal.$in_merge,
        Locked__s: deal.Locked__s,
        Lead_Source: deal.Lead_Source,
        Created_By: deal.Created_By,
        Tag: deal.Tag,
        $zia_owner_assignment: deal.$zia_owner_assignment,
        $approval_state: deal.$approval_state
    };
}