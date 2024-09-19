import type { NangoSync, Invoice } from '../../models';
import type { QuickBooksInvoice } from '../types';
import { paginate } from '../helpers/paginate.js';
import { toInvoice } from '../mappers/toInvoice.js';
import type { PaginationParams } from '../helpers/paginate';

/**
 * Fetches invoice data from QuickBooks API and saves it in batch.
 * Handles both active and voided invoices, saving or deleting them based on their status.
 * For detailed endpoint documentation, refer to:
 * https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/invoice#query-an-invoice
 *
 * @param nango The NangoSync instance used for making API calls and saving data.
 * @returns A promise that resolves when the data has been successfully fetched and saved.
 */
export default async function fetchData(nango: NangoSync): Promise<void> {
    const config: PaginationParams = {
        model: 'Invoice'
    };

    let allPayments: QuickBooksInvoice[] = [];

    // Fetch all invoices with pagination
    for await (const invoices of paginate<QuickBooksInvoice>(nango, config)) {
        allPayments = [...allPayments, ...invoices];
    }

    // Filter and process invoices that are not voided (i.e., active invoices)
    const activeInvoices = allPayments.filter((invoice) => !invoice.PrivateNote?.includes('Voided'));
    const mappedActiveInvoices = activeInvoices.map(toInvoice);
    await nango.batchSave<Invoice>(mappedActiveInvoices, 'Invoice');

    // Handle voided invoices only if it's an incremental refresh
    if (nango.lastSyncDate) {
        const voidedPayments = allPayments.filter((invoice) => invoice.PrivateNote?.includes('Voided'));
        const mappedVoidedPayments = voidedPayments.map(toInvoice);
        await nango.batchDelete<Invoice>(mappedVoidedPayments, 'Invoice');
    }
}
