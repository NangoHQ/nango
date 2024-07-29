import type { NangoAction, BamboohrResponseStatus, BamboohrUpdateEmployee } from '../../models';

export default async function runAction(nango: NangoAction, input: BamboohrUpdateEmployee): Promise<BamboohrResponseStatus> {
    try {
        if (!input.id) {
            throw new nango.ActionError({
                message: 'id is a required field'
            });
        }
        const { id, ...postData } = input;

        const response = await nango.post({
            endpoint: `/v1/employees/${input.id}`,
            data: postData
        });

        return {
            status: response.statusText
        };
    } catch (error: any) {
        const messageHeader = error.response.headers['x-bamboohr-error-message'];

        throw new nango.ActionError({
            message: `Failed to update employee`,
            status: error.response.status,
            error: messageHeader || error.response.data || error.message
        });
    }
}
