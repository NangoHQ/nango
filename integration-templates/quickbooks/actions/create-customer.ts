import type { NangoAction, CreateCustomer, Customer, ProxyConfiguration } from '../../models';
import { getCompany } from '../utils/getCompany.js';
import { toQuickBooksCustomer, toCustomer } from '../mappers/toCustomer.js';

/**
 * This function handles the creation of a customer in QuickBooks via the Nango action.
 * It validates the input customer data, maps it to the appropriate QuickBooks customer structure,
 * and sends a request to create the customer in the QuickBooks API.
 * For detailed endpoint documentation, refer to:
 * https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/customer#create-a-customer
 *
 * @param {NangoAction} nango - The Nango action instance to handle API requests.
 * @param {CreateCustomer} input - The customer data input that will be sent to QuickBooks.
 * @throws {nango.ActionError} - Throws an error if the input is missing or lacks required fields.
 * @returns {Promise<Customer>} - Returns the created customer object from QuickBooks.
 */
export default async function runAction(nango: NangoAction, input: CreateCustomer): Promise<Customer> {
    // Validate if input is present
    if (!input) {
        throw new nango.ActionError({
            message: `Input customer object is required. Received: ${JSON.stringify(input)}`
        });
    }

    // Ensure that required fields are present for QuickBooks
    if (!input.title && !input.given_name && !input.display_name && !input.suffix) {
        throw new nango.ActionError({
            message: `Please provide at least one of the following fields: title, given_name, display_name, or suffix. Received: ${JSON.stringify(input)}`
        });
    }

    const companyId = await getCompany(nango);
    // Map the customer input to the QuickBooks customer structure
    const quickBooksCustomer = toQuickBooksCustomer(input);

    const config: ProxyConfiguration = {
        endpoint: `/v3/company/${companyId}/customer`,
        data: quickBooksCustomer
    };

    const response = await nango.post(config);

    return toCustomer(response.data['Customer']);
}
