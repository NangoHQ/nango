import type { NangoAction, BamboohrCreateEmployee, BamboohrCreateEmployeeResponse } from '../../models';

export default async function runAction(nango: NangoAction, input: BamboohrCreateEmployee): Promise<BamboohrCreateEmployeeResponse> {
    // Input validation on only required fields
    if (!input.firstName && !input.lastName) {
        throw new nango.ActionError({
            message: 'firstName and lastName are required fields'
        });
    } else if (!input.firstName) {
        throw new nango.ActionError({
            message: 'firstName is a required field'
        });
    } else if (!input.lastName) {
        throw new nango.ActionError({
            message: 'lastName is a required field'
        });
    }

    try {
        const { firstName, lastName, ...rest } = input;
        const postData = {
            firstName,
            lastName,
            ...rest
        };

        const response = await nango.post({
            endpoint: `/v1/employees`,
            data: postData
        });

        const location = response.headers['location'];

        const id = location.split('/').pop();

        return {
            id,
            status: response.statusText
        };
    } catch (error: any) {
        const messageHeader = error.response?.headers['x-bamboohr-error-message'];
        const errorMessage = messageHeader || error.response?.data || error.message;

        throw new nango.ActionError({
            message: `Failed to create employee`,
            status: error.response.status,
            error: errorMessage || undefined
        });
    }
}
