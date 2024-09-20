import type { NangoAction, UpdateItem, Item, ProxyConfiguration } from '../../models';
import { getCompany } from '../utils/getCompany.js';
import { toQuickBooksItem, toItem } from '../mappers/toItem.js';

/**
 * This function handles the partial update of a customer in QuickBooks via the Nango action.
 * It validates the input customer data, maps it to the appropriate QuickBooks customer structure,
 * and sends a request to sparse update the customer in the QuickBooks API.
 * For detailed endpoint documentation, refer to:
 * https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/customer#sparse-update-a-customer
 *
 * @param {NangoAction} nango - The Nango action instance to handle API requests.
 * @param {UpdateItem} input - The customer data input that will be sent to QuickBooks.
 * @throws {nango.ActionError} - Throws an error if the input is missing or lacks required fields.
 * @returns {Promise<Item>} - Returns the created customer object from QuickBooks.
 */
export default async function runAction(nango: NangoAction, input: UpdateItem): Promise<Item> {
    // Validate if input is present
    if (!input) {
        throw new nango.ActionError({
            message: `Input customer object is required. Received: ${JSON.stringify(input)}`
        });
    }

    // Ensure that required fields are present for QuickBooks
    if (!input.id || !input.sync_token) {
        throw new nango.ActionError({
            message: `Both 'id' and 'sync_token' must be provided. Received: ${JSON.stringify(input)}`
        });
    }

    const companyId = await getCompany(nango);
    // Map the customer input to the QuickBooks customer structure
    const quickBooksItem = toQuickBooksItem(input);

    const config: ProxyConfiguration = {
        endpoint: `/v3/company/${companyId}/item`,
        data: quickBooksItem
    };

    const response = await nango.post(config);

    return toItem(response.data['Item']);
}
