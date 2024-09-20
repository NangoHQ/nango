import type { NangoAction, UpdateInvoice, Invoice, ProxyConfiguration } from '../../models';
import { getCompany } from '../utils/getCompany.js';
import { toQuickBooksInvoice, toInvoice } from '../mappers/toInvoice.js';

/**
 * This function handles the partial update of a invoice in QuickBooks via the Nango action.
 * It validates the input invoice data, maps it to the appropriate QuickBooks invoice structure,
 * and sends a request to sparse update the invoice in the QuickBooks API.
 * For detailed endpoint documentation, refer to:
 * https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/invoice#sparse-update-an-invoice
 *
 * @param {NangoAction} nango - The Nango action instance to handle API requests.
 * @param {UpdateInvoice} input - The invoice data input that will be sent to QuickBooks.
 * @throws {nango.ActionError} - Throws an error if the input is missing or lacks required fields.
 * @returns {Promise<Invoice>} - Returns the created invoice object from QuickBooks.
 */
export default async function runAction(nango: NangoAction, input: UpdateInvoice): Promise<Invoice> {
    // Validate if input is present
    if (!input) {
        throw new nango.ActionError({
            message: `Input invoice object is required. Received: ${JSON.stringify(input)}`
        });
    }

    // Ensure that required fields are present for QuickBooks
    if (!input.id || !input.sync_token) {
        throw new nango.ActionError({
            message: `No id or sync_token is provided.`
        });
    }

    const companyId = await getCompany(nango);
    // Map the invoice input to the QuickBooks invoice structure
    const quickBooksInvoice = toQuickBooksInvoice(input);

    const config: ProxyConfiguration = {
        endpoint: `/v3/company/${companyId}/invoice`,
        data: quickBooksInvoice
    };

    const response = await nango.post(config);

    return toInvoice(response.data['Invoice']);
}
