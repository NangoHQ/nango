import type { NangoAction, NetsuiteCustomerCreateInput, NetsuiteCustomerCreateOutput } from '../../models';
import type { NS_Customer, NS_Address } from '../types';
import { netsuiteCustomerCreateInputSchema } from '../schema.zod.js';

export default async function runAction(nango: NangoAction, input: NetsuiteCustomerCreateInput): Promise<NetsuiteCustomerCreateOutput> {
    const parsedInput = netsuiteCustomerCreateInputSchema.safeParse(input);
    if (!parsedInput.success) {
        throw new nango.ActionError({
            message: 'invalid customer input',
            errors: parsedInput.error
        });
    }

    const address: Partial<NS_Address> = {
        ...(input.addressLine1 && { addr1: input.addressLine1 }),
        ...(input.addressLine2 && { addr2: input.addressLine2 }),
        ...(input.city && { city: input.city }),
        ...(input.zip && { zip: input.zip }),
        ...(input.country && { country: { id: input.country } }),
        ...(input.state && { state: { id: input.state } })
    };

    const body: Partial<NS_Customer> = {
        externalId: input.externalId,
        companyName: input.name,
        ...(input.email && { email: input.email }),
        ...(input.phone && { phone: input.phone }),
        ...(input.taxNumber && { taxNumber: input.taxNumber }),
        ...(Object.keys(address).length > 0 && { addressBook: { items: [address] } })
    };
    const res = await nango.post({
        endpoint: '/customer',
        data: body
    });
    const id = res.headers.location?.split('/').pop();
    if (!id) {
        throw new nango.ActionError({
            message: "Error creating customer: could not parse 'id' from Netsuite API response"
        });
    }
    return { id };
}
