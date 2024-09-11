import type { NangoSync, Customer, ProxyConfiguration } from '../../models';
import type { WooCommerceCustomer } from '../types';
import { toCustomer } from '../mappers/to-customer.js';

/**
 * Retrieves WooCommerce customers from the API, transforms the data into a suitable format,
 * and saves the processed customers using NangoSync. This function handles pagination to ensure
 * that all customers are fetched, converted, and stored correctly.
 *
 * For detailed endpoint documentation, refer to:
 * https://woocommerce.github.io/woocommerce-rest-api-docs/#list-all-customers
 *
 * @param nango - An instance of NangoSync for managing API interactions and processing.
 * @returns A Promise that resolves when all customers have been successfully fetched and saved.
 */
export default async function fetchData(nango: NangoSync): Promise<void> {
    const config: ProxyConfiguration = {
        endpoint: '/wp-json/wc/v3/customers',
        retries: 10,
        paginate: {
            type: 'offset',
            limit: 100,
            offset_name_in_request: 'offset',
            limit_name_in_request: 'per_page'
        }
    };

    for await (const customers of nango.paginate<WooCommerceCustomer>(config)) {
        await nango.batchSave<Customer>(customers.map(toCustomer), 'Customer');
    }
}
