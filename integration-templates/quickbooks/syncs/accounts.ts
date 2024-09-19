import type { NangoSync, Account } from '../../models';
import type { QuickBooksAccount } from '../types';
import { paginate } from '../helpers/paginate.js';
import { toAccount } from '../mappers/toAccount.js';
import type { PaginationParams } from '../helpers/paginate';

/**
 * Fetches account data from QuickBooks API and saves it in batch.
 * Handles both active and archived accounts, saving or deleting them based on their status.
 * For detailed endpoint documentation, refer to:
 * https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/account#query-an-account
 *
 * @param nango The NangoSync instance used for making API calls and saving data.
 * @returns A promise that resolves when the data has been successfully fetched and saved.
 */
export default async function fetchData(nango: NangoSync): Promise<void> {
    const config: PaginationParams = {
        model: 'Account',
        additionalFilter: 'Active IN (true, false)'
    };

    let allAccounts: QuickBooksAccount[] = [];

    // Fetch all accounts with pagination
    for await (const accounts of paginate<QuickBooksAccount>(nango, config)) {
        allAccounts = [...allAccounts, ...accounts];
    }

    // Filter and process active accounts
    const activeAccounts = allAccounts.filter((account) => account.Active);
    const mappedActiveAccounts = activeAccounts.map(toAccount);
    await nango.batchSave<Account>(mappedActiveAccounts, 'Account');

    // Handle archived accounts only if it's an incremental refresh
    if (nango.lastSyncDate) {
        const archivedAccounts = allAccounts.filter((account) => !account.Active);
        const mappedArchivedAccounts = archivedAccounts.map(toAccount);
        await nango.batchDelete<Account>(mappedArchivedAccounts, 'Account');
    }
}
