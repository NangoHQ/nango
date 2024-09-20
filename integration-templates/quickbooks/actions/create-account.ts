import type { NangoAction, CreateAccount, Account, ProxyConfiguration } from '../../models';
import { getCompany } from '../utils/getCompany.js';
import { toQuickBooksAccount, toAccount } from '../mappers/toAccount.js';

/**
 * This function handles the creation of a account in QuickBooks via the Nango action.
 * It validates the input account data, maps it to the appropriate QuickBooks account structure,
 * and sends a request to create the account in the QuickBooks API.
 * For detailed endpoint documentation, refer to:
 * https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/account#create-an-account
 *
 * @param {NangoAction} nango - The Nango action instance to handle API requests.
 * @param {CreateAccount} input - The account data input that will be sent to QuickBooks.
 * @throws {nango.ActionError} - Throws an error if the input is missing or lacks required fields.
 * @returns {Promise<Account>} - Returns the created account object from QuickBooks.
 */
export default async function runAction(nango: NangoAction, input: CreateAccount): Promise<Account> {
    // Validate if input is present
    if (!input) {
        throw new nango.ActionError({
            message: `Input account object is required. Received: ${JSON.stringify(input)}`
        });
    }

    // Ensure that required fields are present for QuickBooks
    if (!input.name || (!input.account_type && !input.account_sub_type)) {
        throw new nango.ActionError({
            message: `Please provide a 'name' and at least one of the following: account_type or account_sub_type. Received: ${JSON.stringify(input)}`
        });
    }

    const companyId = await getCompany(nango);
    // Map the account input to the QuickBooks account structure
    const quickBooksAccount = toQuickBooksAccount(input);

    const config: ProxyConfiguration = {
        endpoint: `/v3/company/${companyId}/account`,
        data: quickBooksAccount
    };

    const response = await nango.post(config);

    return toAccount(response.data['Account']);
}
