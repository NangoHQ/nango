import type { NangoSync, Customer } from '../../models';
import type { QuickBooksCustomer } from '../types';
import { paginate } from '../helpers/paginate.js';
import { toCustomer } from '../mappers/toCustomer.js';
import type { PaginationParams } from '../helpers/paginate';

/**
 * Fetches customer data from QuickBooks API and saves it in batch.
 * Handles both active and archived customers, saving or deleting them based on their status.
 * For detailed endpoint documentation, refer to:
 * https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/customer#query-a-customer
 *
 * @param nango The NangoSync instance used for making API calls and saving data.
 * @returns A promise that resolves when the data has been successfully fetched and saved.
 */
export default async function fetchData(nango: NangoSync): Promise<void> {
    const config: PaginationParams = {
        model: 'Customer',
        additionalFilter: 'Active IN (true, false)'
    };

    let allCustomers: QuickBooksCustomer[] = [];

    // Fetch all customers with pagination
    for await (const customers of paginate<QuickBooksCustomer>(nango, config)) {
        allCustomers = [...allCustomers, ...customers];
    }

    // Filter and process active customers
    const activeCustomers = allCustomers.filter((customer) => customer.Active);
    const mappedActiveCustomers = activeCustomers.map(toCustomer);
    await nango.batchSave<Customer>(mappedActiveCustomers, 'Customer');

    // Handle archived customers only if it's an incremental refresh
    if (nango.lastSyncDate) {
        const archivedCustomers = allCustomers.filter((customer) => !customer.Active);
        const mappedArchivedCustomers = archivedCustomers.map(toCustomer);
        await nango.batchDelete<Customer>(mappedArchivedCustomers, 'Customer');
    }
}
