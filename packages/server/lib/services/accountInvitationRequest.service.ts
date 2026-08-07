import db from '@nangohq/database';
import { accountService, userService } from '@nangohq/shared';
import { Err, getLogger, Ok } from '@nangohq/utils';

import { sendAccountInvitationRequestEmail } from '../helpers/email.js';

import type { DBUser } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

const logger = getLogger('Server.AccountInvitationRequest');

export type AccountInvitationRequestErrorCode = 'account_not_found' | 'no_administrators' | 'email_delivery_failed';

export class AccountInvitationRequestError extends Error {
    public code: AccountInvitationRequestErrorCode;
    public context?: Record<string, unknown>;
    constructor({ code, message, context }: { code: AccountInvitationRequestErrorCode; message: string; context?: Record<string, unknown> }) {
        super(message);
        this.code = code;
        this.context = context || {};
    }
}

/**
 * Asks the administrators of an account to invite a user.
 *
 * At most one request is ever sent per user: the "invitation requested" slot is claimed with an atomic
 * conditional update, so a repeat call is a no-op instead of a second round of emails.
 */
export async function requestAccountInvitation({ user, accountId }: { user: DBUser; accountId: number }): Promise<Result<void, AccountInvitationRequestError>> {
    const account = await accountService.getAccountById(db.knex, accountId);
    if (!account) {
        return Err(new AccountInvitationRequestError({ code: 'account_not_found', message: 'Recommended account not found.', context: { accountId } }));
    }

    const administrators = await userService.getVerifiedActiveAdministratorsByAccountId(account.id);
    if (administrators.length === 0) {
        return Err(
            new AccountInvitationRequestError({
                code: 'no_administrators',
                message: 'No administrators found for recommended account.',
                context: { accountId }
            })
        );
    }

    const requestedAt = await userService.markAccountInvitationRequestSent(user.id);
    if (!requestedAt) {
        // Already requested previously, nothing to re-send.
        logger.info('Account invitation already requested, skipping emails', { requesterId: user.id, accountId: account.id });
        return Ok(undefined);
    }

    const emailResults = await Promise.allSettled(
        administrators.map((administrator) => sendAccountInvitationRequestEmail({ email: administrator.email, account, requester: user }))
    );

    const failedEmailCount = emailResults.filter((result) => result.status === 'rejected').length;
    if (failedEmailCount === emailResults.length) {
        const unmarked = await userService.unmarkAccountInvitationRequest(user.id, requestedAt);
        return Err(
            new AccountInvitationRequestError({
                code: 'email_delivery_failed',
                message: 'Failed to send all account invitation request emails',
                // `unmarked` tells whether the claim was released, i.e. whether the user can retry.
                context: { accountId: account.id, requesterId: user.id, failedEmailCount, unmarked }
            })
        );
    }

    if (failedEmailCount > 0) {
        logger.warning('Failed to send some account invitation request emails', {
            totalEmailsCount: emailResults.length,
            failedEmailCount,
            requesterId: user.id,
            accountId: account.id
        });
    }

    return Ok(undefined);
}
