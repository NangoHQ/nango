import type { NangoSync, ZohoMailEmail } from './models';

const LIMIT = 100;

export default async function fetchData(nango: NangoSync) {
    let totalRecords = 0;
    let offset = 1;

    const metadata = (await nango.getMetadata()) || {};
    const accountId = metadata['accountId'] ? String(metadata['accountId']) : '';

    if (!accountId || typeof accountId !== 'string') {
        throw new Error(`Please set a custom metadata accountId for the connection`);
    }

    try {
        let moreEmails = true;
        while (moreEmails) {
            const response = await nango.get({
                endpoint: `/api/accounts/${accountId}/messages/view`,
                params: {
                    limit: LIMIT,
                    start: offset
                }
            });

            if (response.data && response.data.data.length > 0) {
                const mappedEmail: ZohoMailEmail[] = response.data.data.map(mapEmail) || [];
                // Save Email
                const batchSize: number = mappedEmail.length;
                totalRecords += batchSize;
                await nango.log(`Saving batch of ${batchSize} email(s) (total email(s): ${totalRecords})`);
                await nango.batchSave(mappedEmail, 'ZohoMailEmail');

                if (response.data.data.length < LIMIT) {
                    break;
                }

                offset += LIMIT;
            } else {
                moreEmails = false;
            }
        }
    } catch (error) {
        throw new Error(`Error in fetchData: ${error}`);
    }
}

function mapEmail(email: any): ZohoMailEmail {
    return {
        summary: email.summary,
        sentDateInGMT: email.sentDateInGMT,
        calendarType: email.calendarType,
        subject: email.subject,
        messageId: email.messageId,
        flagid: email.flagid,
        status2: email.status2,
        priority: email.priority,
        hasInline: email.hasInline,
        toAddress: email.toAddress,
        folderId: email.folderId,
        ccAddress: email.ccAddress,
        hasAttachment: email.hasAttachment,
        size: email.size,
        sender: email.sender,
        receivedTime: email.receivedTime,
        fromAddress: email.fromAddress,
        status: email.status
    };
}
