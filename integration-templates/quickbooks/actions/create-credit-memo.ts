import type { NangoAction, CreateCreditMemo, CreditMemo, ProxyConfiguration } from '../../models';
import { getCompany } from '../utils/getCompany.js';
import { toQuickBooksCreditMemo, toCreditMemo } from '../mappers/toCreditMemo.js';

/**
 * This function handles the creation of a credit memo in QuickBooks via the Nango action.
 * It validates the input credit memo data, maps it to the appropriate QuickBooks credit memo structure,
 * and sends a request to create the credit memo in the QuickBooks API.
 * For detailed endpoint documentation, refer to:
 * https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/creditmemo#create-a-credit-memo
 *
 * @param {NangoAction} nango - The Nango action instance to handle API requests.
 * @param {CreateCreditMemo} input - The credit memo data input that will be sent to QuickBooks.
 * @throws {nango.ActionError} - Throws an error if the input is missing or lacks required fields.
 * @returns {Promise<CreditMemo>} - Returns the created credit memo object from QuickBooks.
 */
export default async function runAction(nango: NangoAction, input: CreateCreditMemo): Promise<CreditMemo> {
    // Validate if input is present
    if (!input) {
        throw new nango.ActionError({
            message: `Input credit memo object is required. Received: ${JSON.stringify(input)}`
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
                message: `amount_cents is required for each line item. Received: ${JSON.stringify(line)}`
            });
        }

        if (!line.sales_item_line_detail || !line.sales_item_line_detail.item_ref) {
            throw new nango.ActionError({
                message: `SalesItemLineDetail with item_ref is required for each line item. Received: ${JSON.stringify(line.sales_item_line_detail)}`
            });
        }
    }

    const companyId = await getCompany(nango);
    // Map the credit memo input to the QuickBooks credit memo structure
    const quickBooksInvoice = toQuickBooksCreditMemo(input);

    const config: ProxyConfiguration = {
        endpoint: `/v3/company/${companyId}/creditmemo`,
        data: quickBooksInvoice
    };

    const response = await nango.post(config);

    return toCreditMemo(response.data['CreditMemo']);
}
