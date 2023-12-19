import type { ZohoCRMContact, NangoSync } from './models';

export default async function fetchData(nango: NangoSync) {
    try {
        const responses = await getAllContacts(nango, '/crm/v2/Contacts');
        if (responses.length > 0) {
            const mappedContacts: ZohoCRMContact[] = responses.map(mapContacts);
            // Save Contacts
            await nango.batchSave(mappedContacts, 'ZohoCRMContact');
        } else {
            await nango.log('No Contacts found.');
        }
    } catch (error: any) {
        await nango.log(`Error in fetchData: ${error.message}`);
    }
}

async function getAllContacts(nango: NangoSync, endpoint: string): Promise<any[]> {
    const contacts: any[] = [];
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
                throw new Error(`Received a ZohoCRMContacts API error (for ${endpoint}): ${JSON.stringify(response.data, null, 2)}`);
            }

            contacts.push(...response.data.data);
            page++; // Increment the page for the next request
        } while (response.data.info?.more_records);

        return contacts;
    } catch (error: any) {
        // Handle unexpected errors, log them, and possibly retry or take appropriate action
        await nango.log(`Error in getAllContacts: ${error.message}`);
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

function mapContacts(contact: any): ZohoCRMContact {
    return {
        Owner: contact.Owner,
        Email: contact.Email,
        $currency_symbol: contact.$currency_symbol,
        $field_states: contact.$field_states,
        Other_Phone: contact.Other_Phone,
        Mailing_State: contact.Mailing_State,
        Other_State: contact.Other_State,
        Other_Country: contact.Other_Country,
        Last_Activity_Time: contact.Last_Activity_Time,
        Department: contact.Department,
        $state: contact.$state,
        Unsubscribed_Mode: contact.Unsubscribed_Mode,
        $process_flow: contact.$process_flow,
        Assistant: contact.Assistant,
        Mailing_Country: contact.Mailing_Country,
        $locked_for_me: contact.locked_for_me,
        id: contact.id as string,
        $approved: contact.$approved,
        Reporting_To: contact.Reporting_To,
        $approval: contact.$approval,
        Other_City: contact.Other_City,
        Created_Time: contact.Created_Time,
        $editable: contact.$editable,
        Home_Phone: contact.Home_Phone,
        Created_By: contact.Created_By,
        $zia_owner_assignment: contact.$zia_owner_assignment,
        Secondary_Email: contact.Secondary_Email,
        Description: contact.Description,
        Vendor_Name: contact.Vendor_Name,
        Mailing_Zip: contact.Mailing_Zip,
        $review_process: contact.$review_process,
        Twitter: contact.Twitter,
        Other_Zip: contact.Other_Zip,
        Mailing_Street: contact.Mailing_Street,
        Salutation: contact.Salutation,
        First_Name: contact.First_Name,
        Full_Name: contact.Full_Name,
        Asst_Phone: contact.Asst_Phone,
        Record_Image: contact.Record_Image,
        Modified_By: contact.Modified_By,
        $review: contact.$review,
        Skype_ID: contact.Skype_ID,
        Phone: contact.Phone,
        Account_Name: contact.Account_Name,
        Email_Opt_Out: contact.Email_Opt_Out,
        Modified_Time: contact.Modified_Time,
        Date_of_Birth: contact.Date_of_Birth,
        Mailing_City: contact.Mailing_City,
        Unsubscribed_Time: contact.Unsubscribed_Time,
        Title: contact.Title,
        Other_Street: contact.Other_Street,
        Mobile: contact.Mobile,
        $orchestration: contact.$orchestration,
        Last_Name: contact.Last_Name,
        $in_merge: contact.$in_merge,
        Locked__s: contact.Locked__s,
        Lead_Source: contact.Lead_Source,
        Tag: contact.Tag,
        Fax: contact.Fax,
        $approval_state: contact.$approval_state
    };
}