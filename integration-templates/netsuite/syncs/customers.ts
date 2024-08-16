import type { NangoSync, NetsuiteCustomer, NetsuiteAddress, ProxyConfiguration } from '../../models';
import type { NS_Customer, NS_Address, NSAPI_GetResponse, NSAPI_GetResponses } from '../types';
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

function getAddress(customerId: string, nango: NangoSync): Promise<NetsuiteAddress> {
    return nango
        .get({
            endpoint: `/customer/${customerId}/addressbook`,
            retries
        })
        .then((res: NSAPI_GetResponses<any>) => {
            const addressBookIds = res.data.items.map((addressLink) => {
                return addressLink.links?.find((link: any) => link.rel === 'self')?.href.match(/\/addressBook\/(\d+)/)?.[1];
            });
            // NOTE: only first address is being used
            if (addressBookIds.length > 0) {
                return nango
                    .get({
                        endpoint: `/customer/${customerId}/addressBook/${addressBookIds[0]}/addressBookAddress`,
                        retries
                    })
                    .then((res: NSAPI_GetResponse<NS_Address>) => {
                        return {
                            addressLine1: res.data.addr1 || null,
                            addressLine2: res.data.addr2 || null,
                            city: res.data.city || null,
                            zip: res.data.zip || null,
                            country: res.data.country?.id || null,
                            state: res.data.state?.id || null
                        };
                    });
            }
            return {
                addressLine1: null,
                addressLine2: null,
                city: null,
                zip: null,
                country: null,
                state: null
            };
        });
}
