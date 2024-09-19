import type { Account, CreateAccount, UpdateAccount } from '../../models';
import type { QuickBooksAccount } from '../types';

/**
 * Converts a QuickBooksAccount object to an Account object.
 * Only includes essential properties mapped from QuickBooksAccount.
 * @param account The QuickBooksAccount object to convert.
 * @returns Account object representing QuickBooks account information.
 */
export function toAccount(account: QuickBooksAccount): Account {
    return {
        id: account.Id,
        fully_qualified_name: account.FullyQualifiedName,
        name: account.Name,
        account_type: account.AccountType,
        account_sub_type: account.AccountSubType,
        classification: account.Classification,
        current_balance_cents: account.CurrentBalance * 100,
        active: account.Active,
        sub_account: account.SubAccount,
        description: account.Description ?? null,
        acct_num: account.AcctNum ?? null,
        created_at: new Date(account.MetaData.CreateTime).toISOString(),
        updated_at: new Date(account.MetaData.LastUpdatedTime).toISOString()
    };
}

/**
 * Maps the account data from the input format to the QuickBooks account structure.
 * This function checks for the presence of various fields in the account object and maps them
 * to the corresponding fields expected by QuickBooks.
 *
 * @param {CreateAccount | UpdateAccount} account - The account data input object that needs to be mapped.
 * @returns {QuickBooksAccount} - The mapped QuickBooks account object.
 */
export function toQuickBooksAccount(account: CreateAccount | UpdateAccount): QuickBooksAccount {
    const quickBooksAccount: Partial<QuickBooksAccount> = {};

    if ('id' in account && 'sync_token' in account) {
        const updateItem = account as UpdateAccount;
        quickBooksAccount.Id = updateItem.id;
        quickBooksAccount.SyncToken = updateItem.sync_token;
        quickBooksAccount.sparse = true;
    }

    if (account.name) {
        quickBooksAccount.Name = account.name;
    }

    if (account.account_type) {
        quickBooksAccount.AccountType = account.account_type;
    }

    if (account.account_sub_type) {
        quickBooksAccount.AccountSubType = account.account_sub_type;
    }

    if (account.acct_num) {
        quickBooksAccount.AcctNum = account.acct_num;
    }

    if (account.description) {
        quickBooksAccount.Description = account.description;
    }

    return quickBooksAccount as QuickBooksAccount;
}
