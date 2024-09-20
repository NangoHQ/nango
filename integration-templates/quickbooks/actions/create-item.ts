import type { NangoAction, CreateItem, Item, ProxyConfiguration } from '../../models';
import { getCompany } from '../utils/getCompany.js';
import { toQuickBooksItem, toItem } from '../mappers/toItem.js';

/**
 * This function handles the creation of an item in QuickBooks via the Nango action.
 * It validates the input item data, maps it to the appropriate QuickBooks item structure,
 * and sends a request to create the item in the QuickBooks API.
 * For detailed endpoint documentation, refer to:
 * https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/item#create-an-item
 *
 * @param {NangoAction} nango - The Nango action instance to handle API requests.
 * @param {CreateItem} input - The item data input that will be sent to QuickBooks.
 * @throws {nango.ActionError} - Throws an error if the input is missing or lacks required fields.
 * @returns {Promise<Item>} - Returns the created item object from QuickBooks.
 */
export default async function runAction(nango: NangoAction, input: CreateItem): Promise<Item> {
    // Validate if input is present
    if (!input) {
        throw new nango.ActionError({
            message: `Input item object is required. Received: ${JSON.stringify(input)}`
        });
    }

    // Ensure that required fields are present for QuickBooks
    if (!input.name || (!input.expense_accountRef && !input.income_accountRef)) {
        throw new nango.ActionError({
            message: `Please provide a 'name' and at least one of the following: 'expense_accountRef' or 'income_accountRef'. Received: ${JSON.stringify(input)}`
        });
    }

    const companyId = await getCompany(nango);
    // Map the item input to the QuickBooks item structure
    const quickBooksItem = toQuickBooksItem(input);

    const config: ProxyConfiguration = {
        endpoint: `/v3/company/${companyId}/item`,
        data: quickBooksItem
    };

    const response = await nango.post(config);

    return toItem(response.data['Item']);
}
