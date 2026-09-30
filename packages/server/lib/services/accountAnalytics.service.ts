import { isInternalAccount, productTracking, userService } from '@nangohq/shared';
import { report } from '@nangohq/utils';

/** Reads the account's users from the database, so call it only once the joining user is saved. */
export async function identifyAccountMembership(accountId: number): Promise<void> {
    try {
        const users = await userService.getUsersByAccountId(accountId);
        productTracking.identifyAccountGroup(accountId, { is_internal: isInternalAccount(users) });
    } catch (err) {
        report(err);
    }
}
