import type { NangoAction, CreateInvoice, Invoice, ProxyConfiguration } from '../../models';
import { getCompany } from '../utils/getCompany.js';
import { toQuickBooksInvoice, toInvoice } from '../mappers/toInvoice.js';

/**
 * This function handles the creation of an invoice in QuickBooks via the Nango action.
 * It validates the input invoice data, maps it to the appropriate QuickBooks invoice structure,
 * and sends a request to create the invoice in the QuickBooks API.
 * For detailed endpoint documentation, refer to:
 * https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/invoice#create-an-invoice
 *
 * @param {NangoAction} nango - The Nango action instance to handle API requests.
 * @param {CreateInvoice} input - The invoice data input that will be sent to QuickBooks.
 * @throws {nango.ActionError} - Throws an error if the input is missing or lacks required fields.
 * @returns {Promise<Invoice>} - Returns the created invoice object from QuickBooks.
 */
export default async function runAction(nango: NangoAction, input: CreateInvoice): Promise<Invoice> {
    // Validate if input is present
    if (!input) {
        throw new nango.ActionError({
            message: `Input invoice object is required. Received: ${JSON.stringify(input)}`
        });
    }

    // Validate required fields
    if (!input.customer_ref || !input.customer_ref.value) {
        throw new nango.ActionError({
            message: `CustomerRef is required and must include a value. Received: ${JSON.stringify(input.customer_ref)}`
        });
    }

    if (!input.line || input.line.length === 0) {
        throw new nango.ActionError({
            message: `At least one line item is required. Received: ${JSON.stringify(input.line)}`
        });
    }

    // Validate each line item
    for (const line of input.line) {
        if (!line.detail_type) {
            throw new nango.ActionError({
                message: `DetailType is required for each line item. Received: ${JSON.stringify(line)}`
            });
        }

        if (line.amount_cents === undefined) {
            throw new nango.ActionError({
                message: `Amount_cents is required for each line item. Received: ${JSON.stringify(line)}`
            });
        }

        if (!line.sales_item_line_detail || !line.sales_item_line_detail.item_ref) {
            throw new nango.ActionError({
                message: `SalesItemLineDetail with item_ref is required for each line item. Received: ${JSON.stringify(line.sales_item_line_detail)}`
            });
        }
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
