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

    const address: Partial<NS_Address> = {};
    if (input.addressLine1) {
        address.addr1 = input.addressLine1;
    }
    if (input.addressLine2) {
        address.addr2 = input.addressLine2;
    }
    if (input.city) {
        address.city = input.city;
    }
    if (input.zip) {
        address.zip = input.zip;
    }
    if (input.country) {
        address.country = { id: input.country };
    }
    if (input.state) {
        address.state = { id: input.state };
    }

    const body: Partial<NS_Customer> = {
        id: input.id
    };
    if (input.externalId) {
        body.externalId = input.externalId;
    }
    if (input.name) {
        body.companyName = input.name;
    }
    if (input.email) {
        body.email = input.email;
    }
    if (input.phone) {
        body.phone = input.phone;
    }
    if (input.taxNumber) {
        body.defaultTaxReg = input.taxNumber;
    }
    if (Object.keys(address).length > 0) {
        body.addressBook = { items: [address] };
    }

    await nango.patch({
        endpoint: `/customer/${input.id}?replace=addressBook`,
        data: body
    });

    return { success: true };
}
