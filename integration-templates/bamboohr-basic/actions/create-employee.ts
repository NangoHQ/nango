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
        throw new nango.ActionError({
            message: `Error in runAction: ${error.message}`
        });
    }
}
