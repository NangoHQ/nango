import { getUserAccountAndEnvironmentFromSession } from '../utils/utils.js';
import type { Request, Response, NextFunction } from 'express';
import EmailClient from '../clients/email.client.js';
import { userService, getBaseUrl } from '@nangohq/shared';

class UserController {
    async getUser(req: Request, res: Response, next: NextFunction) {
        try {
            const user = (await getUserAccountAndEnvironmentFromSession(req)).user;

            res.status(200).send({
                user: {
                    id: user.id,
                    accountId: user.account_id,
                    email: user.email,
                    name: user.name
                }
            });
        } catch (err) {
            next(err);
        }
    }

    async editName(req: Request, res: Response, next: NextFunction) {
        try {
            const user = (await getUserAccountAndEnvironmentFromSession(req)).user;
            const name = req.body['name'];

            if (!name) {
                res.status(400).send({ error: 'User name cannot be empty.' });
                return;
            }

            await userService.editUserName(name, user.id);
            res.status(200).send({ name });
        } catch (err) {
            next(err);
        }
    }

    async editPassword(req: Request, res: Response, next: NextFunction) {
        try {
            const user = (await getUserAccountAndEnvironmentFromSession(req)).user;
            const oldPassword = req.body['old_password'];
            const newPassword = req.body['new_password'];

            if (!oldPassword || !newPassword) {
                res.status(400).send({ error: 'Old password and new password cannot be empty.' });
                return;
            }

            await userService.changePassword(oldPassword, newPassword, user.id);
            res.status(200).send();
        } catch (err) {
            next(err);
        }
    }

    async invite(req: Request, res: Response, next: NextFunction) {
        try {
            const { account, user } = await getUserAccountAndEnvironmentFromSession(req);
            const email = req.body['email'];
            const name = req.body['name'];

            if (!email || !name) {
                res.status(400).send({ error: 'Email and name cannot be empty.' });
                return;
            }

            const invited = await userService.inviteUser(email, name, account.id, user.id);
            if (!invited) {
                throw new Error('Failed to invite user.');
            }
            const emailClient = EmailClient.getInstance();
            emailClient.send(
                invited.email,
                `Join the "${account.name}" account on Nango`,
                `
<p>Hi,</p>

<p>You are invited to join the ${account.name} account on Nango.</p>

<p>Join this account by clicking <a href="${getBaseUrl()}/signup/${invited?.token}">here</a> and completing your signup.</p>

<p>Questions or issues? We are happy to help on the <a href="https://nango.dev/slack">Slack community</a>!</p>

<p>Best,<br>
Team Nango</p>
            `
            );
            res.status(200).send(invited);
        } catch (err) {
            next(err);
        }
    }

    async suspend(req: Request, res: Response, next: NextFunction) {
        try {
            const userId = req.params['userId'];

            await userService.suspendUser(Number(userId));
            res.status(200).send();
        } catch (err) {
            next(err);
        }
    }
}

export default new UserController();
