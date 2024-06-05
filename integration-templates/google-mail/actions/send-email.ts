import type { NangoAction, GmailEmailSentOutput, GmailEmailInput } from '../../models';

export default async function runAction(nango: NangoAction, input: GmailEmailInput): Promise<GmailEmailSentOutput> {
    try {
        // generate a base64 representation of input
        const email = `From: ${input.from}\nTo: ${input.to}\nSubject: ${input.subject}\n\n${input.body}`;

        const base64EncodedEmail = Buffer.from(email).toString('base64');

        // send the email using nango proxy
        const sentEmailResponse = await nango.proxy({
            method: 'POST',
            endpoint: '/gmail/v1/users/me/messages/send',
            data: {
                raw: base64EncodedEmail
            }
        });

        return mapEmail(sentEmailResponse.data);
    } catch (error: any) {
        throw new nango.ActionError({
            message: 'Failed to send email in the gmail-send action script.',
            details: {
                message: error?.message,
                method: error?.config?.method,
                url: error?.config?.url,
                code: error?.code
            }
        });
    }
}

function mapEmail(record: any): GmailEmailSentOutput {
    return {
        id: record.id,
        threadId: record.threadId
    };
}
