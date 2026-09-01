import crypto from 'node:crypto';

import db from '@nangohq/database';
import { acceptInvitation, accountService, expirePreviousInvitations, getInvitation, userService, validateInvitation } from '@nangohq/shared';
import { basePublicUrl, flagHasUsage, nanoid, report } from '@nangohq/utils';

import { envs } from '../../../../env.js';
import { linkBillingCustomer, linkBillingFreeSubscription } from '../../../../utils/billing.js';
import { loginOrStartPendingMfa } from '../mfa/login.js';

import type { DBInvitation, DBTeam } from '@nangohq/types';
import type { User, WorkOS } from '@workos-inc/node';
import type { Request, Response } from 'express';

const managedAuthRequestMaxAgeMs = 30 * 60 * 1000;

// An MCP OAuth interaction may send the user through managed SSO, onboarding, and MFA before it can
// resume. Keep the post-login destination in the server session and put only an opaque nonce in the
// WorkOS state parameter so those intermediate login steps cannot lose or tamper with the interaction.

export interface ManagedAuthRequest {
    createdAt: number;
    token?: string | undefined;
    next?: string | undefined;
}

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

export function isSafePostLoginPath(path: string): boolean {
    if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) {
        return false;
    }

    try {
        return new URL(path, 'https://nango.invalid').origin === 'https://nango.invalid';
    } catch {
        return false;
    }
}

export function createManagedAuthRequest(req: Request, data: Omit<ManagedAuthRequest, 'createdAt'>): string {
    const now = Date.now();
    const activeRequests = Object.fromEntries(
        Object.entries(req.session.managedAuthRequests || {}).filter(([_, request]) => now - request.createdAt <= managedAuthRequestMaxAgeMs)
    );
    const state = crypto.randomBytes(32).toString('base64url');

    req.session.managedAuthRequests = {
        ...activeRequests,
        [state]: { ...data, createdAt: now }
    };

    return state;
}

function consumeManagedAuthRequest(req: Request, state: string | undefined): ManagedAuthRequest | null {
    if (!state) {
        return null;
    }

    const request = req.session.managedAuthRequests?.[state];
    if (!request) {
        return parseLegacyManagedAuthState(state);
    }

    delete req.session.managedAuthRequests?.[state];
    if (Date.now() - request.createdAt > managedAuthRequestMaxAgeMs || (request.next && !isSafePostLoginPath(request.next))) {
        return null;
    }

    return request;
}

function parseLegacyManagedAuthState(state: string): ManagedAuthRequest | null {
    try {
        const parsed: unknown = JSON.parse(Buffer.from(state, 'base64').toString('ascii'));
        if (!parsed || typeof parsed !== 'object' || !('token' in parsed) || typeof parsed.token !== 'string') {
            return null;
        }
        return { token: parsed.token, createdAt: Date.now() };
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
    const authRequest = consumeManagedAuthRequest(req, encodedState);
    if (!authRequest) {
        clearManagedAuthEmailVerification(req);
        if (responseMode === 'redirect') {
            res.redirect(`${basePublicUrl}/signin?error=sso_session_expired`);
        } else {
            res.status(400).send({ error: { code: 'invalid_session', message: 'The login session has expired or is invalid.' } });
        }
        return;
    }

    let invitation: DBInvitation | null = null;
    if (authRequest.token) {
        const validatedInvitation = validateInvitation(await getInvitation(authRequest.token), authorizedUser.email);
        if (validatedInvitation.isErr()) {
            res.status(400).send({ error: { code: validatedInvitation.error.code, message: validatedInvitation.error.message } });
            return;
        }
        invitation = validatedInvitation.value;
    }

    let isNewTeam = true;
    let isNewUser = false;
    let user = await userService.getUserByEmail(authorizedUser.email);
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

            const resAccount = await accountService.createAccount({ name, email: authorizedUser.email });
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

    let destination = '/';
    try {
        if (invitation && isNewUser) {
            // New user with an invitation: created directly in the invited team, auto-accept and proceed
            await acceptInvitation(invitation.token);
        } else if (invitation) {
            // Existing user with an invitation: let them explicitly accept or decline on the invite page
            destination = `/signup/${invitation.token}`;
        } else if (isNewUser) {
            // New user without an invitation: redirect to account discovery onboarding
            destination = '/onboarding/account-discovery';
        }
        if (!invitation && authRequest.next) {
            if (isNewUser) {
                destination += `?next=${encodeURIComponent(authRequest.next)}`;
            } else {
                destination = authRequest.next;
            }
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
