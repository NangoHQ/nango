import type { Order } from '../../models';
import type { WooCommerceOrder } from '../types';

/**
 * Converts a WooCommerceOrder object to a slim Order object.
 * Only includes essential properties mapped from WooCommerceOrder.
 * @param order The WooCommerceOrder object to convert.
 * @returns Order object representing WooCommerce order information.
 */
export function toOrder(order: WooCommerceOrder): Order {
    return {
        id: order.id.toString(),
        status: order.status,
        total_amount: parseFloat(order.total),
        currency: order.currency,
        created_at: new Date(order.date_created_gmt).toISOString(),
        modified_at: new Date(order.date_modified_gmt).toISOString()
    };
}
