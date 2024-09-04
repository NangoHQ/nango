import type { NangoSync, NetsuiteCustomer, ProxyConfiguration } from '../../models';
import type { NS_Customer, NSAPI_GetResponse } from '../types';
import { paginate } from '../helpers/pagination.js';

const retries = 3;

export default async function fetchData(nango: NangoSync): Promise<void> {
    const proxyConfig: ProxyConfiguration = {
        endpoint: '/customer',
        retries
    };
    for await (const customers of paginate<{ id: string }>({ nango, proxyConfig })) {
        await nango.log('Listed Customers', { total: customers.length });

        const mappedCustomers: NetsuiteCustomer[] = [];
        for (const customerLink of customers) {
            const customer: NSAPI_GetResponse<NS_Customer> = await nango.get({
                endpoint: `/customer/${customerLink.id}?expandSubResources=true`,
                retries
            });
            if (!customer.data) {
                await nango.log('Customer not found', { id: customerLink.id });
                continue;
            }
            const address = customer.data.addressBook?.items[0]?.addressBookAddress;
            mappedCustomers.push({
                id: customer.data.id,
                externalId: customer.data.externalId || null,
                name: customer.data.companyName,
                email: customer.data.email || null,
                taxNumber: customer.data.defaultTaxReg || null,
                phone: customer.data.phone || null,
                addressLine1: address?.addr1 || null,
                addressLine2: address?.addr2 || null,
                city: address?.city || null,
                zip: address?.zip || null,
                country: address?.country?.id || null,
                state: address?.state?.id || null
            });
        }

        await nango.batchSave<NetsuiteCustomer>(mappedCustomers, 'NetsuiteCustomer');
    }
}
