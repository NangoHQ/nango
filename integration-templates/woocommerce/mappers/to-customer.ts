import type { Customer } from '../../models';
import type { WooCommerceCustomer } from '../types';

/**
 * Converts a WooCommerceOrder object to a slim Order object.
 * Only includes essential properties mapped from WooCommerceOrder.
 * @param customer The WooCommerceOrder object to convert.
 * @returns Order object representing WooCommerce order information.
 */
export function toCustomer(customer: WooCommerceCustomer): Customer {
    return {
        id: customer.id.toString(),
        name: `${customer.first_name ?? ''} ${customer.last_name ?? ''}`.trim(),
        email: customer.email,
        is_paying_customer: customer.is_paying_customer,
        created_at: new Date(customer.date_created_gmt).toISOString(),
        modified_at: new Date(customer.date_modified_gmt).toISOString()
    };
}
