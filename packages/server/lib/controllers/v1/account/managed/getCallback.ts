import { z } from 'zod';
import { asyncWrapper } from '../../../../utils/asyncWrapper.js';
import { basePublicUrl, getLogger, isCloud, nanoid } from '@nangohq/utils';
import type { DBInvitation, GetManagedCallback } from '@nangohq/types';
import { getWorkOSClient } from '../../../../clients/workos.client.js';
import { AnalyticsTypes, acceptInvitation, accountService, analytics, expirePreviousInvitations, getInvitation, userService } from '@nangohq/shared';
import type { InviteAccountState } from './postSignup.js';
import db from '@nangohq/database';

const logger = getLogger('Server.AuthManaged');

const validation = z
    .object({
        code: z.string().min(1).max(255),
        state: z.string().optional()
    })
    .strict();

function parseState(state: string): InviteAccountState | null {
    try {
        const res = JSON.parse(Buffer.from(state, 'base64').toString('ascii'));
        if (!res || !(typeof res === 'object') || !('token' in res)) {
            return null;
        }
        return res as InviteAccountState;
    } catch {
        return null;
    }
}

export const getManagedCallback = asyncWrapper<GetManagedCallback>(async (req, res) => {
    const val = validation.safeParse(req.query);
    if (!val.success) {
        logger.error('Invalid payload received from WorkOS');
        res.redirect(`${basePublicUrl}/signup`);
        return;
    }

    const query: GetManagedCallback['Querystring'] = val.data;
    const workos = getWorkOSClient();

    // Check the request against WorkOS
    const { user: authorizedUser, organizationId } = await workos.userManagement.authenticateWithCode({
        clientId: process.env['WORKOS_CLIENT_ID'] || '',
        code: query.code
    });

    // Parse optional state that can contains invitation
    const state = parseState(query.state || '');
    let invitation: DBInvitation | null = null;
    if (state?.token) {
        // Joined from an invitation
        invitation = await getInvitation(state.token);
        if (!invitation || invitation.email !== authorizedUser.email) {
            res.status(400).send({ error: { code: 'not_found', message: 'Invitation does not exist or is expired' } });
            return;
        }
    }

    let user = await userService.getUserByEmail(authorizedUser.email);
    if (!user) {
        // Create organization and user name
        let name =
            authorizedUser.firstName || authorizedUser.lastName
                ? `${authorizedUser.firstName || ''} ${authorizedUser.lastName || ''}`
                : authorizedUser.email.split('@')[0];
        if (!name) {
            name = nanoid();
        }

        let accountId: number | null = null;

        if (organizationId) {
            // in this case we have a pre registered organization with WorkOS
            // let's make sure it exists in our system
            const organization = await workos.organizations.getOrganization(organizationId);

            const account = await accountService.getOrCreateAccount(organization.name);
            if (!account) {
                res.status(500).send({ error: { code: 'error_creating_account', message: 'Failed to create account' } });
                return;
            }
            accountId = account.id;

            if (!invitation) {
                // We are not coming from an invitation but we could have one anyway
                await expirePreviousInvitations({ accountId, email: authorizedUser.email, trx: db.knex });
            }
        } else if (invitation) {
            // Invited but not in a custom WorkOS org
            accountId = invitation.account_id;
        } else {
            // Regular signup
            const account = await accountService.createAccount(`${name}'s Team`);
            if (!account) {
                res.status(500).send({ error: { code: 'error_creating_account', message: 'Failed to create account' } });
                return;
            }
            accountId = account.id;
        }

        // Create a user
        user = await userService.createUser({
            email: authorizedUser.email,
            name,
            account_id: accountId,
            email_verified: true
        });
        if (!user) {
            res.status(500).send({ error: { code: 'error_creating_user', message: 'There was a problem creating the user. Please reach out to support.' } });
            return;
        }
    }

    // Finally, we login the user
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    req.login(user, async function (err) {
        if (err) {
            res.status(500).send({ error: { code: 'server_error', message: 'Failed to login' } });
            return;
        }

        if (invitation) {
            // If we came from an invitation we need to accept it and transfer the team
            await acceptInvitation(invitation.token);
            const updated = await userService.update({ id: user.id, account_id: invitation.account_id });
            if (!updated) {
                res.status(500).send({ error: { code: 'server_error', message: 'failed to update user team' } });
                return;
            }

            void analytics.track(AnalyticsTypes.ACCOUNT_JOINED, invitation.account_id, {}, isCloud ? { email: invitation.email } : {});
            // @ts-expect-error you got to love passport
            req.session.passport.user.account_id = invitation.account_id;
        }
        res.redirect(`${basePublicUrl}/`);
    });
});
