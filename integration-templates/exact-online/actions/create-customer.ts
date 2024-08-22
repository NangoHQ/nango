import type { NangoAction, ExactCustomerCreateInput, ExactCustomerCreateOutput } from '../../models';
import type { EO_Account, ResponsePostBody } from '../types';
import { getUser } from '../helpers/get-user.js';
import { exactCustomerCreateInputSchema } from '../schema.zod.js';

export default async function runAction(nango: NangoAction, input: ExactCustomerCreateInput): Promise<ExactCustomerCreateOutput> {
    const parsedInput = exactCustomerCreateInputSchema.safeParse(input);
    if (!parsedInput.success) {
        throw new nango.ActionError({
            message: 'Invalid input',
            errors: parsedInput.error
        });
    }

    const { division } = await getUser(nango);

    const body: Partial<EO_Account> = {
        Name: input.name,
        Email: input.email || null,
        AddressLine1: input.addressLine1 || null,
        AddressLine2: input.addressLine2 || null,
        City: input.city || null,
        CountryName: input.country || null,
        Postcode: input.zip || null,
        StateName: input.state || null,
        Phone: input.phone || null,
        VATNumber: input.taxNumber || null,
        Status: 'C' //  A=None, S=Suspect, P=Prospect, C=Customer
    };

    const create = await nango.post<ResponsePostBody<EO_Account>>({
        endpoint: `/api/v1/${division}/crm/Accounts`,
        data: body
    });

    return {
        id: create.data.d.ID
    };
}
