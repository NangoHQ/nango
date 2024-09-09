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
        externalId: input.externalId,
        companyName: input.name
    };
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
        body.addressBook = { items: [{ addressBookAddress: address }] };
    }
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
