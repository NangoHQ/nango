import type { NangoAction, CreatePayment, Payment, ProxyConfiguration } from '../../models';
import { getCompany } from '../utils/getCompany.js';
import { toQuickBooksPayment, toPayment } from '../mappers/toPayment.js';

/**
 * This function handles the creation of an invoice in QuickBooks via the Nango action.
 * It validates the input invoice data, maps it to the appropriate QuickBooks invoice structure,
 * and sends a request to create the invoice in the QuickBooks API.
 * For detailed endpoint documentation, refer to:
 * https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/payment#create-a-payment
 *
 * @param {NangoAction} nango - The Nango action instance to handle API requests.
 * @param {CreatePayment} input - The invoice data input that will be sent to QuickBooks.
 * @throws {nango.ActionError} - Throws an error if the input is missing or lacks required fields.
 * @returns {Promise<Payment>} - Returns the created invoice object from QuickBooks.
 */
export default async function runAction(nango: NangoAction, input: CreatePayment): Promise<Payment> {
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

    if (!input.total_amount_cents) {
        throw new nango.ActionError({
            message: `Amount_cents is required for the payment is required. Received: ${JSON.stringify(input)}`
        });
    }

    const companyId = await getCompany(nango);
    // Map the invoice input to the QuickBooks invoice structure
    const quickBooksPayment = toQuickBooksPayment(input);

    const config: ProxyConfiguration = {
        endpoint: `/v3/company/${companyId}/payment`,
        data: quickBooksPayment
    };

    const response = await nango.post(config);

    return toPayment(response.data['Payment']);
}
