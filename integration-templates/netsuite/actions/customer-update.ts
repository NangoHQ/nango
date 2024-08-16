import type { NangoAction, NetsuiteCustomerUpdateInput, NetsuiteCustomerUpdateOutput } from '../../models';
import type { NS_Customer, NS_Address } from '../types';
import { netsuiteCustomerUpdateInputSchema } from '../schema.zod.js';

export default async function runAction(nango: NangoAction, input: NetsuiteCustomerUpdateInput): Promise<NetsuiteCustomerUpdateOutput> {
    const parsedInput = netsuiteCustomerUpdateInputSchema.safeParse(input);
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
        id: input.id,
        ...(input.externalId && { externalId: input.externalId }),
        ...(input.name && { companyName: input.name }),
        ...(input.email && { email: input.email }),
        ...(input.phone && { phone: input.phone }),
        ...(input.taxNumber && { taxNumber: input.taxNumber }),
        ...(Object.keys(address).length > 0 && { addressBook: { items: [address] } })
    };

    await nango.patch({
        endpoint: `/customer/${input.id}?replace=addressBook`,
        data: body
    });

    return { success: true };
}
