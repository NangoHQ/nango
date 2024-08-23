import type { NangoSync, NetsuiteCustomer, NetsuiteAddress, ProxyConfiguration } from '../../models';
import type { NS_Customer, NS_Address, NSAPI_GetResponse, NSAPI_GetResponses, NSAPI_Links } from '../types';
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
                endpoint: `/customer/${customerLink.id}`,
                retries
            });
            if (!customer.data) {
                await nango.log('Customer not found', { id: customerLink.id });
                continue;
            }
            const customerWithoutAddress = {
                id: customer.data.id,
                externalId: customer.data.externalId || null,
                name: customer.data.companyName,
                email: customer.data.email || null,
                taxNumber: customer.data.defaultTaxReg || null,
                phone: customer.data.phone || null
            };
            const address = await getAddress(customer.data.id, nango);

            mappedCustomers.push({
                ...customerWithoutAddress,
                ...address
            });
        }

        await nango.batchSave<NetsuiteCustomer>(mappedCustomers, 'NetsuiteCustomer');
    }
}

async function getAddress(customerId: string, nango: NangoSync): Promise<NetsuiteAddress> {
    const emptyAddress = {
        addressLine1: null,
        addressLine2: null,
        city: null,
        zip: null,
        country: null,
        state: null
    };
    try {
        const addressBookRes: NSAPI_GetResponses<any> = await nango.get({
            endpoint: `/customer/${customerId}/addressbook`,
            retries
        });

        const addressBookIds = addressBookRes.data.items.map((addressLink: NSAPI_Links) => {
            return addressLink.links?.find((link) => link.rel === 'self')?.href?.match(/\/addressBook\/(\d+)/)?.[1];
        });

        // NOTE: only first address is being used
        if (addressBookIds.length > 0) {
            const addressResponse: NSAPI_GetResponse<NS_Address> = await nango.get({
                endpoint: `/customer/${customerId}/addressBook/${addressBookIds[0]}/addressBookAddress`,
                retries
            });

            return {
                addressLine1: addressResponse.data.addr1 || null,
                addressLine2: addressResponse.data.addr2 || null,
                city: addressResponse.data.city || null,
                zip: addressResponse.data.zip || null,
                country: addressResponse.data.country?.id || null,
                state: addressResponse.data.state?.id || null
            };
        }
        return emptyAddress;
    } catch (error) {
        // Note: not throwing error on address fetch failure
        // as it is not critical for the customer data
        await nango.log('Error fetching address', { customerId, error });
        return emptyAddress;
    }
}
