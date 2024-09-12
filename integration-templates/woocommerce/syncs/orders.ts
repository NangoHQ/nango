import type { NangoSync, Order, ProxyConfiguration } from '../../models';
import type { WooCommerceOrder } from '../types';
import { toOrder } from '../mappers/to-order.js';

/**
 * Retrieves WooCommerce orders from the API, transforms the data into a suitable format,
 * and saves the processed orders using NangoSync. This function handles pagination to ensure
 * that all orders are fetched, converted, and stored correctly.
 *
 * For detailed endpoint documentation, refer to:
 * https://woocommerce.github.io/woocommerce-rest-api-docs/#list-all-orders
 *
 * @param nango - An instance of NangoSync for managing API interactions and processing.
 * @returns A Promise that resolves when all orders have been successfully fetched and saved.
 */
export default async function fetchData(nango: NangoSync): Promise<void> {
    const config: ProxyConfiguration = {
        endpoint: '/wp-json/wc/v3/orders',
        retries: 10,
        params: nango.lastSyncDate
            ? {
                  modified_after: nango.lastSyncDate.toISOString(),
                  dates_are_gmt: 'true'
              }
            : { dates_are_gmt: 'true' },
        paginate: {
            type: 'offset',
            limit: 100,
            offset_name_in_request: 'offset',
            limit_name_in_request: 'per_page'
        }
    };

    for await (const orders of nango.paginate<WooCommerceOrder>(config)) {
        await nango.batchSave<Order>(orders.map(toOrder), 'Order');
    }
}
