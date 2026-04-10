import db from '@nangohq/database';
import { acceptInvitation, accountService, expirePreviousInvitations, getInvitation, userService } from '@nangohq/shared';
import { basePublicUrl, flagHasUsage, nanoid, report } from '@nangohq/utils';

import { envs } from '../../../../env.js';
import { linkBillingCustomer, linkBillingFreeSubscription } from '../../../../utils/billing.js';

import type { InviteAccountState } from './postSignup.js';
import type { DBInvitation, DBTeam } from '@nangohq/types';
import type { Request, Response } from 'express';

interface AuthenticatedUser {
    email: string;
    firstName?: string | null;
    lastName?: string | null;
}

interface WorkOSOrganizationClient {
    getOrganization(organizationId: string): Promise<{ name: string }>;
}

interface FinalizeManagedAuthParams {
    req: Request;
    res: Response;
    authorizedUser: AuthenticatedUser;
    organizationId?: string | undefined;
    workos: {
        organizations: WorkOSOrganizationClient;
    };
    state?: string | undefined;
    responseMode?: 'json' | 'redirect';
}

export interface ManagedAuthEmailVerificationData {
    email: string;
    emailVerificationId: string;
    pendingAuthenticationToken: string;
}

interface ManagedAuthVerificationRequiredError {
    rawData?: {
        code?: string;
        pending_authentication_token?: string;
        email?: string;
        email_verification_id?: string;
    };
}

export function parseManagedAuthState(state: string): InviteAccountState | null {
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

export function clearManagedAuthEmailVerification(req: Request) {
    delete req.session.managedAuthEmailVerification;
}

export function getManagedAuthEmailVerificationFromError(err: unknown): ManagedAuthEmailVerificationData | null {
    const workosErr = err as ManagedAuthVerificationRequiredError;

    if (
        workosErr.rawData?.code !== 'email_verification_required' ||
        !workosErr.rawData.pending_authentication_token ||
        !workosErr.rawData.email ||
        !workosErr.rawData.email_verification_id
    ) {
        return null;
    }

    return {
        email: workosErr.rawData.email,
        pendingAuthenticationToken: workosErr.rawData.pending_authentication_token,
        emailVerificationId: workosErr.rawData.email_verification_id
    };
}

export async function saveSession(req: Request): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        req.session.save((err) => {
            if (err) {
                reject(err instanceof Error ? err : new Error(String(err)));
                return;
            }

            resolve();
        });
    });
}

export async function setManagedAuthEmailVerification(req: Request, verification: ManagedAuthEmailVerificationData, state?: string): Promise<void> {
    req.session.managedAuthEmailVerification = {
        ...verification,
        state
    };
    await saveSession(req);
}

export function getManagedAuthRequestMetadata(req: Request) {
    const userAgentHeader = req.headers['user-agent'];
    const userAgent = Array.isArray(userAgentHeader) ? userAgentHeader[0] : userAgentHeader || undefined;
    const ipAddress = req.ip || undefined;

    const metadata: { ipAddress?: string; userAgent?: string } = {};
    if (ipAddress) {
        metadata.ipAddress = ipAddress;
    }
    if (userAgent) {
        metadata.userAgent = userAgent;
    }

    return metadata;
}

export async function finalizeManagedAuthentication({
    req,
    res,
    authorizedUser,
    organizationId,
    workos,
    state: encodedState,
    responseMode = 'redirect'
}: FinalizeManagedAuthParams): Promise<void> {
    const state = parseManagedAuthState(encodedState || '');
    let invitation: DBInvitation | null = null;
    if (state?.token) {
        invitation = await getInvitation(state.token);
        if (!invitation || invitation.email !== authorizedUser.email) {
            res.status(400).send({ error: { code: 'not_found', message: 'Invitation does not exist or is expired' } });
            return;
        }
    }

    let isNewTeam = true;
    let isNewUser = false;
    let user = await userService.getUserByEmail(authorizedUser.email);
    if (!user) {
        isNewUser = true;
        let account: DBTeam;
        let name =
            authorizedUser.firstName || authorizedUser.lastName
                ? `${authorizedUser.firstName || ''} ${authorizedUser.lastName || ''}`
                : authorizedUser.email.split('@')[0];
        if (!name) {
            name = nanoid();
        }

        if (organizationId) {
            const organization = await workos.organizations.getOrganization(organizationId);

            const resAccount = await accountService.getOrCreateAccount(organization.name);
            if (!resAccount) {
                res.status(500).send({ error: { code: 'error_creating_account', message: 'Failed to create account' } });
                return;
            }

            account = resAccount;

            if (!invitation) {
                await expirePreviousInvitations({ accountId: account.id, email: authorizedUser.email, trx: db.knex });
            }
        } else if (invitation) {
            isNewTeam = false;
            account = (await accountService.getAccountById(db.knex, invitation.account_id))!;
        } else {
            if (!envs.AUTH_ALLOW_SIGNUP) {
                res.status(403).send({ error: { code: 'forbidden', message: 'Signup is disabled.' } });
                return;
            }

            const resAccount = await accountService.createAccount({ name, email: authorizedUser.email });
            if (!resAccount) {
                res.status(500).send({ error: { code: 'error_creating_account', message: 'Failed to create account' } });
                return;
            }
            account = resAccount;
        }

        user = await userService.createUser({
            email: authorizedUser.email,
            name,
            account_id: account.id,
            email_verified: true,
            role: invitation ? invitation.role : envs.DEFAULT_USER_ROLE
        });
        if (!user) {
            res.status(500).send({ error: { code: 'error_creating_user', message: 'There was a problem creating the user. Please reach out to support.' } });
            return;
        }

        if (isNewTeam && flagHasUsage) {
            const linkOrbCustomerRes = await linkBillingCustomer(account, user);
            if (linkOrbCustomerRes.isErr()) {
                report(linkOrbCustomerRes.error);
            } else {
                const linkOrbSubscriptionRes = await linkBillingFreeSubscription(account);
                if (linkOrbSubscriptionRes.isErr()) {
                    report(linkOrbSubscriptionRes.error);
                }
            }
        }
    }

    clearManagedAuthEmailVerification(req);

    await new Promise<void>((resolve) => {
        req.login(user, async function (err) {
            if (err) {
                res.status(500).send({ error: { code: 'server_error', message: 'Failed to login' } });
                resolve();
                return;
            }

            if (invitation) {
                await acceptInvitation(invitation.token);
                const updated = await userService.update({ id: user.id, account_id: invitation.account_id });
                if (!updated) {
                    res.status(500).send({ error: { code: 'server_error', message: 'failed to update user team' } });
                    resolve();
                    return;
                }

                // @ts-expect-error you got to love passport
                req.session.passport.user.account_id = invitation.account_id;
                respondWithSuccess(res, `${basePublicUrl}/`, responseMode);
            } else if (isNewUser) {
                respondWithSuccess(res, `${basePublicUrl}/onboarding/hear-about-us`, responseMode);
            } else {
                respondWithSuccess(res, `${basePublicUrl}/`, responseMode);
            }

            resolve();
        });
    });
}

function respondWithSuccess(res: Response, url: string, responseMode: 'json' | 'redirect') {
    if (responseMode === 'json') {
        res.send({ data: { url } });
        return;
    }

    res.redirect(url);
}
