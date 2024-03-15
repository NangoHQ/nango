import type { NangoAction, ZohoMailSendEmailOutput, ZohoMailSendEmailInput } from './models';

export default async function runAction(nango: NangoAction, input: ZohoMailSendEmailInput): Promise<ZohoMailSendEmailOutput> {
    //we need to enforce accountId to be of type string since accountId contains bigint values 6984040000000000000
    if (!input.accountId || typeof input.accountId !== 'string') {
        throw new nango.ActionError({
            message: 'accountId is a required parameter and needs to be of a non-empty string'
        });
    } else if (!input.fromAddress || typeof input.accountId !== 'string') {
        throw new nango.ActionError({
            message: 'fromAddress is a required body field and must be of a non-empty string'
        });
    } else if (!input.toAddress || typeof input.accountId !== 'string') {
        throw new nango.ActionError({
            message: 'toAddress is a required body field and must be of a non-empty string'
        });
    }

    try {
        const endpoint = `/api/accounts/${input.accountId}/messages`;

        const postData = {
            fromAddress: input.fromAddress,
            toAddress: input.toAddress,
            ccAddress: input.ccAddress,
            bccAddress: input.bccAddress,
            subject: input.subject,
            encoding: input.encoding,
            mailFormat: input.mailFormat,
            askReceipt: input.askReceipt
        };

        const resp = await nango.post({
            endpoint: endpoint,
            data: postData
        });

        return {
            status: resp.data.status,
            data: resp.data.data
        };
    } catch (error) {
        throw new nango.ActionError({
            message: `Error in runAction: ${error}`
        });
    }
}
