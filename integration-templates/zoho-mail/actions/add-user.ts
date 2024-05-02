import type { NangoAction, ZohoMailAddUserOutput, ZohoMailAddUserInput } from '../../models';

export default async function runAction(nango: NangoAction, input: ZohoMailAddUserInput): Promise<ZohoMailAddUserOutput> {
    //zoid is shorter in this 847300000
    if (!input.zoid || typeof input.zoid !== 'number') {
        throw new nango.ActionError({
            message: 'zoid is a required parameter and needs to be of a non-empty number'
        });
    } else if (!input.primaryEmailAddress || typeof input.primaryEmailAddress !== 'string') {
        throw new nango.ActionError({
            message: 'primaryEmailAddress is a required body field and must be of a non-empty string'
        });
    } else if (!input.password || typeof input.password !== 'string') {
        throw new nango.ActionError({
            message: 'toAddress is a required body field and must be of a non-empty string'
        });
    }

    try {
        const endpoint = `/api/organization/${input.zoid}/accounts`;

        const postData = {
            primaryEmailAddress: input.primaryEmailAddress,
            password: input.password,
            displayName: input.displayName,
            role: input.role,
            country: input.country,
            language: input.language,
            timeZone: input.timeZone,
            oneTimePassword: input.oneTimePassword,
            groupMailList: input.groupMailList
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
