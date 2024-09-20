import type { NangoAction, UpdateCreditMemo, CreditMemo, ProxyConfiguration } from '../../models';
import { getCompany } from '../utils/getCompany.js';
import { toQuickBooksCreditMemo, toCreditMemo } from '../mappers/toCreditMemo.js';

/**
 * This function handles the partial update of a credit memo in QuickBooks via the Nango action.
 * It validates the input credit memo data, maps it to the appropriate QuickBooks credit memo structure,
 * and sends a request to sparse update the credit memo in the QuickBooks API.
 * For detailed endpoint documentation, refer to:
 * https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/creditmemo#full-update-a-credit-memo
 *
 * @param {NangoAction} nango - The Nango action instance to handle API requests.
 * @param {UpdateCreditMemo} input - The credit memo data input that will be sent to QuickBooks.
 * @throws {nango.ActionError} - Throws an error if the input is missing or lacks required fields.
 * @returns {Promise<CreditMemo>} - Returns the created credit memo object from QuickBooks.
 */
export default async function runAction(nango: NangoAction, input: UpdateCreditMemo): Promise<CreditMemo> {
    // Validate if input is present
    if (!input) {
        throw new nango.ActionError({
            message: `Input credit memo object is required. Received: ${JSON.stringify(input)}`
        });
    }

    // Ensure that required fields are present for QuickBooks
    if (!input.id || !input.sync_token) {
        throw new nango.ActionError({
            message: `No id or sync_token is provided.`
        });
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
