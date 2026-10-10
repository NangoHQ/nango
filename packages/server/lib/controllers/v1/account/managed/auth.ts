import db from '@nangohq/database';
import { acceptInvitation, accountService, expirePreviousInvitations, getInvitation, userService, validateInvitation } from '@nangohq/shared';
import { basePublicUrl, flagHasUsage, nanoid, report } from '@nangohq/utils';

import { envs } from '../../../../env.js';
import { identifyAccountMembership } from '../../../../services/accountAnalytics.service.js';
import { linkBillingCustomer, linkBillingFreeSubscription } from '../../../../utils/billing.js';
import { signupAcquisitionSchema } from '../../../../utils/signupAcquisition.js';
import { loginOrStartPendingMfa } from '../mfa/login.js';
import { isOAuthConsentReturnTo, safeReturnTo } from '../returnTo.js';

import type { DBInvitation, DBTeam, SignupAcquisition } from '@nangohq/types';
import type { User, WorkOS } from '@workos-inc/node';
import type { Request, Response } from 'express';

interface FinalizeManagedAuthParams {
    req: Request;
    res: Response;
    authorizedUser: User;
    organizationId?: string | undefined;
    workos: Pick<WorkOS, 'organizations'>;
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

export interface InviteAccountState {
    token?: string | undefined;
    returnTo?: string | undefined;
    acquisition?: SignupAcquisition | undefined;
}

const MAX_MANAGED_AUTH_STATE_LENGTH = 16384;

function encodeBoundedState(state: InviteAccountState): string {
    if (!Object.keys(state).length) return '';
    const encoded = Buffer.from(JSON.stringify(state)).toString('base64');
    return encoded.length <= MAX_MANAGED_AUTH_STATE_LENGTH ? encoded : '';
}

export function encodeManagedAuthState(state: InviteAccountState): string {
    const continuation: InviteAccountState = {};
    if (state.token) continuation.token = state.token;
    else if (state.returnTo) continuation.returnTo = state.returnTo;

    if (state.acquisition) {
        const withAcquisition = encodeBoundedState({ ...continuation, acquisition: state.acquisition });
        if (withAcquisition) return withAcquisition;
    }
    // Optional analytics must never displace the signup continuation.
    return encodeBoundedState(continuation);
}

export function parseManagedAuthState(state: string): InviteAccountState | null {
    try {
        if (state.length > MAX_MANAGED_AUTH_STATE_LENGTH) return null;
        const parsed = JSON.parse(Buffer.from(state, 'base64').toString('utf8')) as unknown;
        if (!parsed || typeof parsed !== 'object') return null;
        const candidate = parsed as Record<string, unknown>;
        if (candidate['token'] !== undefined && typeof candidate['token'] !== 'string') return null;
        if (candidate['returnTo'] !== undefined && typeof candidate['returnTo'] !== 'string') return null;

        const result: InviteAccountState = {};
        if (typeof candidate['token'] === 'string') result.token = candidate['token'];
        else if (typeof candidate['returnTo'] === 'string') result.returnTo = safeReturnTo(candidate['returnTo']);
        const acquisition = signupAcquisitionSchema.parse(candidate['acquisition']);
        if (acquisition) result.acquisition = acquisition;
        return Object.keys(result).length ? result : null;
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
        const validatedInvitation = validateInvitation(await getInvitation(state.token), authorizedUser.email);
        if (validatedInvitation.isErr()) {
            res.status(400).send({ error: { code: validatedInvitation.error.code, message: validatedInvitation.error.message } });
            return;
        }
        invitation = validatedInvitation.value;
    }

    let isNewTeam = true;
    let isNewUser = false;
    let user = await userService.getUserByEmail(authorizedUser.email);
    // Google identifies the user at this point. An OAuth consent request may only continue for an
    // existing Nango user, so stop before the normal managed-auth flow creates an account.
    if (!user && isOAuthConsentReturnTo(state?.returnTo)) {
        clearManagedAuthEmailVerification(req);
        req.audit = { ...req.audit, managedSignup: false };

        const signinUrl = new URL('/signin', basePublicUrl);
        signinUrl.searchParams.set('error', 'oauth_signup_not_allowed');
        signinUrl.searchParams.set('next', state.returnTo);
        respondWithSuccess(res, signinUrl.href, responseMode);
        return;
    }
    if (!user) {
        isNewUser = true;
        let account: DBTeam;
        const sanitize = (s: string | null | undefined) => (s && s !== 'null' ? s : '');
        let name =
            authorizedUser.firstName || authorizedUser.lastName
                ? `${sanitize(authorizedUser.firstName)} ${sanitize(authorizedUser.lastName)}`.trim()
                : authorizedUser.email.split('@')[0];
        if (!name) {
            name = nanoid();
        }

        if (invitation) {
            // Invitation takes priority over org membership — user joins the invited team
            isNewTeam = false;
            account = (await accountService.getAccountById(db.knex, invitation.account_id))!;
        } else if (organizationId) {
            const organization = await workos.organizations.getOrganization(organizationId);

            const resAccount = await accountService.getOrCreateAccount(organization.name);
            if (!resAccount) {
                res.status(500).send({ error: { code: 'error_creating_account', message: 'Failed to create account' } });
                return;
            }

            account = resAccount;
            await expirePreviousInvitations({ accountId: account.id, email: authorizedUser.email, trx: db.knex });
        } else {
            if (!envs.AUTH_ALLOW_SIGNUP) {
                res.status(403).send({ error: { code: 'forbidden', message: 'Signup is disabled.' } });
                return;
            }

            const resAccount = await accountService.createAccount({ name, email: authorizedUser.email, acquisition: state?.acquisition });
            if (!resAccount) {
                res.status(500).send({ error: { code: 'error_creating_account', message: 'Failed to create account' } });
                return;
            }
            account = resAccount;
        }

        // Invited users do not go through account discovery:
        const account_discovery_pending = !invitation;

        user = await userService.createUser({
            email: authorizedUser.email,
            name,
            account_id: account.id,
            email_verified: true,
            account_discovery_pending,
            role: invitation ? invitation.role : envs.DEFAULT_USER_ROLE
        });
        if (!user) {
            res.status(500).send({ error: { code: 'error_creating_user', message: 'There was a problem creating the user. Please reach out to support.' } });
            return;
        }
        void identifyAccountMembership(account.id);

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

    let destination = state?.token ? '/' : (state?.returnTo ?? '/');
    try {
        if (invitation && isNewUser) {
            // New user with an invitation: created directly in the invited team, auto-accept and proceed
            await acceptInvitation(invitation.token);
        } else if (invitation) {
            // Existing user with an invitation: let them explicitly accept or decline on the invite page
            destination = `/signup/${invitation.token}`;
        } else if (user.account_discovery_pending && (!state?.returnTo || state.returnTo === '/')) {
            // Only reaching onboarding clears the flag, so a destination defers this to the next sign-in.
            destination = '/onboarding/account-discovery';
        }
    } catch (err) {
        report(err);
        res.status(500).send({ error: { code: 'server_error', message: 'Failed to finalize login' } });
        return;
    }

    try {
        const pendingMfa = await loginOrStartPendingMfa(req, user, destination);
        if (pendingMfa) {
            respondWithSuccess(res, `${basePublicUrl}/signin/mfa`, responseMode);
            return;
        }
    } catch (err) {
        report(err);
        res.status(500).send({ error: { code: 'server_error', message: 'Failed to login' } });
        return;
    }

    req.audit = { ...req.audit, managedSignup: isNewUser };

    respondWithSuccess(res, `${basePublicUrl}${destination}`, responseMode);
}

function respondWithSuccess(res: Response, url: string, responseMode: 'json' | 'redirect') {
    if (responseMode === 'json') {
        res.send({ data: { url } });
        return;
    }

    res.redirect(url);
}
