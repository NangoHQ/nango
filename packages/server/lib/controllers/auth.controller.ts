import type { Request, Response, NextFunction } from 'express';

import { basePublicUrl, getLogger, Err, Ok } from '@nangohq/utils';
import type { Result } from '@nangohq/utils';
import { getWorkOSClient } from '../clients/workos.client.js';
import { userService, accountService, errorManager, NangoError } from '@nangohq/shared';

export interface WebUser {
    id: number;
    accountId: number;
    email: string;
    name: string;
}

const logger = getLogger('Server.AuthController');

interface InviteAccountBody {
    accountId: number;
}
interface InviteAccountState extends InviteAccountBody {
    token: string;
}

const allowedProviders = ['GoogleOAuth'];

const parseState = (state: string): Result<InviteAccountState> => {
    try {
        const parsed = JSON.parse(Buffer.from(state, 'base64').toString('ascii')) as InviteAccountState;
        return Ok(parsed);
    } catch {
        const error = new Error('Invalid state');
        return Err(error);
    }
};

const createAccountIfNotInvited = async (name: string, state?: string): Promise<number | null> => {
    if (!state) {
        const account = await accountService.createAccount(`${name}'s Organization`);
        if (!account) {
            throw new NangoError('account_creation_failure');
        }
        return account.id;
    }

    const parsedState: Result<InviteAccountState> = parseState(state);

    if (parsedState.isOk()) {
        const { accountId, token } = parsedState.value;
        const validToken = await userService.getInvitedUserByToken(token);
        if (validToken) {
            await userService.markAcceptedInvite(token);
        }
        return accountId;
    }

    return null;
};

class AuthController {
    logout(req: Request, res: Response<any, never>, next: NextFunction) {
        try {
            req.session.destroy((err) => {
                if (err) {
                    next(err);
                }

                res.status(200).send();
            });
        } catch (err) {
            next(err);
        }
    }

    async invitation(req: Request, res: Response<any, never>, next: NextFunction) {
        try {
            const token = req.query['token'] as string;

            if (!token) {
                res.status(400).send({ error: 'Token is missing' });
                return;
            }

            const invitee = await userService.getInvitedUserByToken(token);

            if (!invitee) {
                errorManager.errRes(res, 'duplicate_account');
                return;
            }

            res.status(200).send(invitee);
        } catch (error) {
            next(error);
        }
    }

    getManagedLogin(req: Request, res: Response<any, never>, next: NextFunction) {
        try {
            const provider = req.query['provider'] as string;

            if (!provider || !allowedProviders.includes(provider)) {
                errorManager.errRes(res, 'invalid_provider');
                return;
            }

            const workos = getWorkOSClient();

            const oAuthUrl = workos.userManagement.getAuthorizationUrl({
                clientId: process.env['WORKOS_CLIENT_ID'] || '',
                provider,
                redirectUri: `${basePublicUrl}/api/v1/login/callback`
            });

            res.send({ url: oAuthUrl });
        } catch (err) {
            next(err);
        }
    }

    getManagedLoginWithInvite(req: Request, res: Response<any, never>, next: NextFunction) {
        try {
            const workos = getWorkOSClient();
            const provider = req.query['provider'] as string;

            if (!provider || !allowedProviders.includes(provider)) {
                errorManager.errRes(res, 'invalid_provider');
                return;
            }

            const token = req.params['token'] as string;

            const body: InviteAccountBody = req.body as InviteAccountBody;

            if (!body || body.accountId === undefined) {
                errorManager.errRes(res, 'missing_params');
                return;
            }

            if (!provider || !token) {
                errorManager.errRes(res, 'missing_params');
                return;
            }

            const accountId = body.accountId;

            const inviteParams: InviteAccountState = {
                accountId,
                token
            };

            const oAuthUrl = workos.userManagement.getAuthorizationUrl({
                clientId: process.env['WORKOS_CLIENT_ID'] || '',
                provider,
                redirectUri: `${basePublicUrl}/api/v1/login/callback`,
                state: Buffer.from(JSON.stringify(inviteParams)).toString('base64')
            });

            res.send({ url: oAuthUrl });
        } catch (err) {
            next(err);
        }
    }

    async loginCallback(req: Request, res: Response<any, never>, next: NextFunction) {
        try {
            const { code, state } = req.query;

            const workos = getWorkOSClient();

            if (!code) {
                const error = new NangoError('missing_managed_login_callback_code');
                logger.error(error);
                res.redirect(basePublicUrl);
                return;
            }

            const { user: authorizedUser, organizationId } = await workos.userManagement.authenticateWithCode({
                clientId: process.env['WORKOS_CLIENT_ID'] || '',
                code: code as string
            });

            const existingUser = await userService.getUserByEmail(authorizedUser.email);

            if (existingUser) {
                req.login(existingUser, function (err) {
                    if (err) {
                        return next(err);
                    }
                    res.redirect(`${basePublicUrl}/`);
                });

                return;
            }

            const name =
                authorizedUser.firstName || authorizedUser.lastName
                    ? `${authorizedUser.firstName || ''} ${authorizedUser.lastName || ''}`
                    : authorizedUser.email.split('@')[0];

            let accountId: number | null = null;

            if (organizationId) {
                // in this case we have a pre registered organization with workos
                // let's make sure it exists in our system
                const organization = await workos.organizations.getOrganization(organizationId);

                const account = await accountService.getOrCreateAccount(organization.name);

                if (!account) {
                    throw new NangoError('account_creation_failure');
                }
                accountId = account.id;
            } else {
                if (!name) {
                    throw new NangoError('missing_name_for_account_creation');
                }

                accountId = await createAccountIfNotInvited(name, state as string);

                if (!accountId) {
                    throw new NangoError('account_creation_failure');
                }
            }

            const user = await userService.createUser(authorizedUser.email, name as string, '', '', accountId);
            if (!user) {
                throw new NangoError('user_creation_failure');
            }

            req.login(user, function (err) {
                if (err) {
                    return next(err);
                }
                res.redirect(`${basePublicUrl}/`);
            });
        } catch (err) {
            next(err);
        }
    }
}

export default new AuthController();
